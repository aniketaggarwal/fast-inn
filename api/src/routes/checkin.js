const crypto = require("crypto");
const { Router } = require("express");
const QRCode = require("qrcode");
const { withTenantTransaction } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { tenantScope } = require("../middleware/tenant");
const { asyncHandler } = require("../utils/asyncHandler");
const { verifyGuestPresentation, VerificationError } = require("../services/verifier");
const { logAudit } = require("../repo/audit");
const { presentationLimiter } = require("../middleware/rateLimit");

const router = Router();

const SESSION_TTL_SECONDS = 90; // Section 9.4
const WEB_BASE_URL = process.env.WEB_BASE_URL || "http://localhost:5173";

// WEB_BASE_URL=auto (scripts/demo.js): the QR must point at whatever public
// address this request arrived on — a phone scanning it can't reach
// "localhost", and behind a tunnel the hostname is random per run.
function webBaseUrl(req) {
  return WEB_BASE_URL === "auto" ? req.publicOrigin || "http://localhost:5173" : WEB_BASE_URL;
}

// Claims a guest register row can't exist without (Section 5's schema has
// them NOT NULL) — the check-in consent screen locks these four as
// mandatory; everything else the credential can disclose (dateOfBirth,
// isAdult, photoThumb) is a genuine guest choice.
const REQUIRED_CLAIMS = ["fullName", "idType", "idLast4", "nationality"];

router.post(
  "/checkin/sessions",
  requireAuth,
  requireRole("HOTEL_STAFF", "HOTEL_ADMIN"),
  tenantScope,
  asyncHandler(async (req, res) => {
    const { bookingId } = req.body || {};
    if (typeof bookingId !== "string") {
      return res.status(400).json({ error: "invalid_input" });
    }

    const session = await withTenantTransaction(req.hotelId, async (client) => {
      const booking = await client.query(
        "SELECT id, status FROM bookings WHERE id = $1 AND hotel_id = $2",
        [bookingId, req.hotelId]
      );
      if (booking.rowCount === 0) {
        return null;
      }
      if (booking.rows[0].status !== "RESERVED") {
        throw Object.assign(new Error("booking_not_reservable"), { status: 409 });
      }

      const nonce = crypto.randomBytes(16).toString("base64url");
      const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
      const result = await client.query(
        `INSERT INTO checkin_sessions (booking_id, hotel_id, nonce, status, expires_at)
         VALUES ($1, $2, $3, 'PENDING', $4)
         RETURNING id, nonce, hotel_id, expires_at`,
        [bookingId, req.hotelId, nonce, expiresAt]
      );
      return result.rows[0];
    });

    if (!session) {
      return res.status(404).json({ error: "booking_not_found" });
    }

    const qrUrl = `${webBaseUrl(req)}/checkin/present?sessionId=${session.id}&nonce=${session.nonce}&hotelId=${session.hotel_id}`;
    const qrImageDataUrl = await QRCode.toDataURL(qrUrl);

    res.status(201).json({
      sessionId: session.id,
      nonce: session.nonce,
      hotelId: session.hotel_id,
      expiresAt: session.expires_at,
      qrUrl,
      qrImageDataUrl,
    });
  })
);

router.get(
  "/checkin/sessions/:id",
  requireAuth,
  requireRole("HOTEL_STAFF", "HOTEL_ADMIN"),
  tenantScope,
  asyncHandler(async (req, res) => {
    const session = await withTenantTransaction(req.hotelId, async (client) => {
      const result = await client.query(
        "SELECT id, hotel_id, nonce, status, expires_at, verified_claims_json, verified_at FROM checkin_sessions WHERE id = $1 AND hotel_id = $2",
        [req.params.id, req.hotelId]
      );
      return result.rows[0] || null;
    });

    if (!session) {
      return res.status(404).json({ error: "not_found" });
    }

    // Regenerated on every poll, not just at creation — the staff screen
    // polls this endpoint every couple of seconds while PENDING (see
    // web/src/pages/StaffCheckinSessionPage.jsx), and each response
    // replaces the page's whole session object, so a QR image only
    // present in the original POST response would vanish the moment the
    // first poll landed.
    const qrUrl = `${webBaseUrl(req)}/checkin/present?sessionId=${session.id}&nonce=${session.nonce}&hotelId=${session.hotel_id}`;
    const qrImageDataUrl = session.status === "PENDING" ? await QRCode.toDataURL(qrUrl) : null;

    res.json({
      sessionId: session.id,
      status: session.status,
      expiresAt: session.expires_at,
      verifiedClaims: session.verified_claims_json,
      verifiedAt: session.verified_at,
      qrUrl: session.status === "PENDING" ? qrUrl : null,
      qrImageDataUrl,
    });
  })
);

// Public — no api auth. The guest's browser reaches this by scanning a QR
// code, not by being logged in as a HotelVerify user; identity and
// authorization here come entirely from the signed presentation itself
// (issuer signature + device signature + nonce), not from a JWT. hotelId
// is supplied by the client because there is no staff JWT to take it
// from — but unlike Section 7's staff-facing rule, that's safe here: it's
// just a lookup key the guest already received in the QR/URL they
// scanned, not a trust boundary. A wrong hotelId simply fails to find the
// session (both the query's own WHERE and checkin_sessions' RLS policy
// filter on it identically); the actual security — proving this
// presentation was made for *this* session by *this* credential's own
// device — is enforced by verifyGuestPresentation below, not by this
// lookup.
router.post(
  "/checkin/sessions/:id/present",
  presentationLimiter,
  asyncHandler(async (req, res) => {
    const { presentation, hotelId } = req.body || {};
    if (typeof presentation !== "string" || typeof hotelId !== "string") {
      return res.status(400).json({ error: "invalid_input" });
    }

    const session = await withTenantTransaction(hotelId, async (client) => {
      const result = await client.query(
        "SELECT id, booking_id, hotel_id, nonce, status, expires_at FROM checkin_sessions WHERE id = $1 AND hotel_id = $2",
        [req.params.id, hotelId]
      );
      return result.rows[0] || null;
    });

    if (!session) {
      return res.status(404).json({ error: "session_not_found" });
    }
    if (session.status !== "PENDING") {
      return res.status(409).json({ error: "session_not_pending" });
    }
    if (new Date(session.expires_at).getTime() < Date.now()) {
      return res.status(410).json({ error: "session_expired" });
    }

    let verification;
    try {
      verification = await verifyGuestPresentation({
        presentation,
        expectedNonce: session.nonce,
        expectedHotelId: session.hotel_id,
        maxAgeSeconds: SESSION_TTL_SECONDS,
      });
    } catch (err) {
      if (err instanceof VerificationError) {
        return res.status(422).json({ error: "verification_failed", reason: err.reason });
      }
      throw err;
    }

    const missing = REQUIRED_CLAIMS.filter((name) => !(name in verification.claims));
    if (missing.length > 0) {
      return res.status(422).json({ error: "missing_required_claims", claims: missing });
    }

    const outcome = await withTenantTransaction(hotelId, async (client) => {
      // Single-use enforcement (Section 9.4): this UPDATE only succeeds
      // for a session that's *still* PENDING — the WHERE clause and the
      // status check above together mean two concurrent presentations
      // for the same session can't both win, the same structural
      // guarantee room_availability's composite PK gives bookings.
      const updated = await client.query(
        `UPDATE checkin_sessions
         SET status = 'VERIFIED', verified_claims_json = $2, verified_at = now()
         WHERE id = $1 AND status = 'PENDING'
         RETURNING booking_id, hotel_id`,
        [session.id, JSON.stringify(verification.claims)]
      );
      if (updated.rowCount === 0) {
        return null; // consumed by a concurrent request between our check and this update
      }

      const registerRow = await client.query(
        `INSERT INTO guest_register (hotel_id, booking_id, full_name, id_type, id_last4, nationality, arrival_at, credential_id)
         VALUES ($1, $2, $3, $4, $5, $6, now(), $7)
         RETURNING id`,
        [
          hotelId,
          session.booking_id,
          verification.claims.fullName,
          verification.claims.idType,
          verification.claims.idLast4,
          verification.claims.nationality,
          verification.credentialId,
        ]
      );

      // Section 8: Form C is required for foreign nationals, flagged on
      // the arrivals board. visa_type/arrival_from aren't claims this
      // credential ever carries, so they're left null rather than
      // fabricated — an honest gap called out in PROGRESS.md, not silently
      // guessed at.
      if (verification.claims.nationality !== "IN") {
        await client.query(
          `INSERT INTO form_c_records (guest_register_id, passport_no_last4)
           VALUES ($1, $2)`,
          [registerRow.rows[0].id, verification.claims.idType === "PASSPORT" ? verification.claims.idLast4 : null]
        );
      }

      // DPDP consent capture (Section 8): recorded against the claims
      // *actually disclosed* in this presentation (verification.claims'
      // own keys), not some fixed list — a guest who left dateOfBirth
      // unchecked on the consent screen has that same fact reflected here.
      const booking = await client.query("SELECT guest_user_id FROM bookings WHERE id = $1", [session.booking_id]);
      const guestUserId = booking.rows[0]?.guest_user_id || null;
      if (guestUserId) {
        await client.query(
          `INSERT INTO consents (guest_user_id, hotel_id, booking_id, claims_disclosed_json, purpose, granted_at)
           VALUES ($1, $2, $3, $4, $5, now())`,
          [guestUserId, hotelId, session.booking_id, JSON.stringify(Object.keys(verification.claims)), "hotel check-in identity verification"]
        );
      }

      await logAudit(client, {
        actorUserId: guestUserId,
        actorRole: "GUEST",
        hotelId,
        action: "checkin_verified",
        entity: "checkin_session",
        entityId: session.id,
        meta: { bookingId: session.booking_id, credentialId: verification.credentialId, claimsDisclosed: Object.keys(verification.claims) },
      });

      return updated.rows[0];
    });

    if (!outcome) {
      return res.status(409).json({ error: "session_not_pending" });
    }

    res.json({ status: "VERIFIED", claims: verification.claims });
  })
);

router.post(
  "/checkin/sessions/:id/complete",
  requireAuth,
  requireRole("HOTEL_STAFF", "HOTEL_ADMIN"),
  tenantScope,
  asyncHandler(async (req, res) => {
    const outcome = await withTenantTransaction(req.hotelId, async (client) => {
      const session = await client.query(
        "SELECT id, booking_id, status FROM checkin_sessions WHERE id = $1 AND hotel_id = $2",
        [req.params.id, req.hotelId]
      );
      if (session.rowCount === 0) return { code: "not_found" };
      if (session.rows[0].status !== "VERIFIED") return { code: "not_verified" };

      await client.query("UPDATE bookings SET status = 'CHECKED_IN' WHERE id = $1", [session.rows[0].booking_id]);
      await client.query("UPDATE checkin_sessions SET status = 'COMPLETED' WHERE id = $1", [session.rows[0].id]);
      return { code: "ok" };
    });

    if (outcome.code === "not_found") return res.status(404).json({ error: "not_found" });
    if (outcome.code === "not_verified") return res.status(409).json({ error: "session_not_verified" });
    res.json({ status: "COMPLETED" });
  })
);

module.exports = router;
