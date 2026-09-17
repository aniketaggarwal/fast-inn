const { Router } = require("express");
const { withTenantTransaction } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { tenantScope } = require("../middleware/tenant");
const { asyncHandler } = require("../utils/asyncHandler");
const { logAudit } = require("../repo/audit");

const router = Router();

router.get(
  "/hotel/bookings",
  requireAuth,
  requireRole("HOTEL_STAFF", "HOTEL_ADMIN"),
  tenantScope,
  asyncHandler(async (req, res) => {
    // bookings has RLS forced (Section 7) — app.hotel_id must be set for
    // this SELECT to return anything at all, not just as a safety net.
    const bookings = await withTenantTransaction(req.hotelId, async (client) => {
      const result = await client.query(
        `SELECT b.id, b.check_in, b.check_out, b.status, b.total_amount,
                r.room_number, r.room_type,
                u.email AS guest_email
         FROM bookings b
         JOIN rooms r ON r.id = b.room_id
         JOIN users u ON u.id = b.guest_user_id
         WHERE b.hotel_id = $1
         ORDER BY b.check_in DESC`,
        [req.hotelId]
      );
      return result.rows;
    });
    res.json({ bookings });
  })
);

// Nothing in Milestones 1-6 ever moved a booking past CHECKED_IN — added
// here because the retention purge job (Section 8's "N days after
// checkout") needs a real checkout timestamp to count from, not just an
// enum value that's never reached. Sets guest_register.departure_at too,
// since that's the statutory record's own "when did they leave" field.
router.post(
  "/hotel/bookings/:id/checkout",
  requireAuth,
  requireRole("HOTEL_STAFF", "HOTEL_ADMIN"),
  tenantScope,
  asyncHandler(async (req, res) => {
    const outcome = await withTenantTransaction(req.hotelId, async (client) => {
      const booking = await client.query(
        "SELECT id, status FROM bookings WHERE id = $1 AND hotel_id = $2",
        [req.params.id, req.hotelId]
      );
      if (booking.rowCount === 0) return { code: "not_found" };
      if (booking.rows[0].status !== "CHECKED_IN") return { code: "not_checked_in" };

      await client.query("UPDATE bookings SET status = 'CHECKED_OUT' WHERE id = $1", [req.params.id]);
      await client.query(
        "UPDATE guest_register SET departure_at = now() WHERE booking_id = $1 AND departure_at IS NULL",
        [req.params.id]
      );
      await logAudit(client, {
        actorUserId: req.user.id,
        actorRole: req.user.role,
        hotelId: req.hotelId,
        action: "booking_checked_out",
        entity: "booking",
        entityId: req.params.id,
      });
      return { code: "ok" };
    });

    if (outcome.code === "not_found") return res.status(404).json({ error: "not_found" });
    if (outcome.code === "not_checked_in") return res.status(409).json({ error: "booking_not_checked_in" });
    res.json({ status: "CHECKED_OUT" });
  })
);

module.exports = router;
