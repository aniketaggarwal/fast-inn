const { Router } = require("express");
const { pool, withGuestTransaction } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { asyncHandler } = require("../utils/asyncHandler");
const { logAudit } = require("../repo/audit");

const router = Router();

// Section 8's guest-facing "my data" screen: what was shared, with whom,
// when. Deliberately shows claim *names*, never the disclosed values
// themselves — this page is an audit trail of what was shared, not
// another place the guest's own PII sits around waiting to be read.
router.get(
  "/consents/mine",
  requireAuth,
  requireRole("GUEST"),
  asyncHandler(async (req, res) => {
    const consents = await withGuestTransaction(req.user.id, async (client) => {
      const result = await client.query(
        `SELECT c.id, c.claims_disclosed_json, c.purpose, c.granted_at, c.withdrawn_at,
                h.name AS hotel_name, h.city AS hotel_city
         FROM consents c
         JOIN hotels h ON h.id = c.hotel_id
         WHERE c.guest_user_id = $1
         ORDER BY c.granted_at DESC`,
        [req.user.id]
      );
      return result.rows;
    });
    res.json({ consents });
  })
);

// Withdrawal can't undo a disclosure that already happened (the hotel's
// statutory guest_register entry stands), but it does two real things:
// records the withdrawal event itself (DPDP requires that), and purges
// this booking's verified_claims_json immediately rather than waiting for
// the nightly retention job — the one piece of this consent's data that
// *is* still sitting around and erasable.
router.post(
  "/consents/:id/withdraw",
  requireAuth,
  requireRole("GUEST"),
  asyncHandler(async (req, res) => {
    const outcome = await withGuestTransaction(req.user.id, async (client) => {
      const result = await client.query(
        `UPDATE consents SET withdrawn_at = now()
         WHERE id = $1 AND guest_user_id = $2 AND withdrawn_at IS NULL
         RETURNING id, booking_id, hotel_id`,
        [req.params.id, req.user.id]
      );
      if (result.rowCount === 0) return null;
      const consent = result.rows[0];

      if (consent.booking_id) {
        await client.query(
          "UPDATE checkin_sessions SET verified_claims_json = NULL WHERE booking_id = $1",
          [consent.booking_id]
        );
      }

      await logAudit(client, {
        actorUserId: req.user.id,
        actorRole: "GUEST",
        hotelId: consent.hotel_id,
        action: "consent_withdrawn",
        entity: "consent",
        entityId: consent.id,
      });
      return consent;
    });

    if (!outcome) {
      return res.status(404).json({ error: "not_found_or_already_withdrawn" });
    }
    res.json({ status: "WITHDRAWN" });
  })
);

// DPDP right to erasure, balanced against hotels' statutory duty to keep
// a guest register (Section 8 names both). A hard `DELETE FROM users`
// would CASCADE into bookings -> guest_register and destroy records
// hotels are legally required to retain — so this soft-deletes and
// anonymizes the *account* (login becomes impossible, email freed up for
// reuse) while leaving the statutory register intact. The guest's own
// booking/consent history remains queryable by id for compliance, just no
// longer reachable via a live login.
router.delete(
  "/account",
  requireAuth,
  requireRole("GUEST"),
  asyncHandler(async (req, res) => {
    const anonymizedEmail = `deleted-${req.user.id}@deleted.hotelverify.invalid`;
    const result = await pool.query(
      `UPDATE users SET email = $2, password_hash = '', deleted_at = now()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id`,
      [req.user.id, anonymizedEmail]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "already_deleted" });
    }
    await logAudit(pool, {
      actorUserId: req.user.id,
      actorRole: "GUEST",
      action: "account_deleted",
      entity: "user",
      entityId: req.user.id,
    });
    res.json({ status: "DELETED" });
  })
);

module.exports = router;
