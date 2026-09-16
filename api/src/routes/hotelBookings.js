const { Router } = require("express");
const { withTenantTransaction } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { tenantScope } = require("../middleware/tenant");
const { asyncHandler } = require("../utils/asyncHandler");

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

module.exports = router;
