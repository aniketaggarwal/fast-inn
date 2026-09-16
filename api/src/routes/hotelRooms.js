const { Router } = require("express");
const { pool } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { tenantScope } = require("../middleware/tenant");
const { asyncHandler } = require("../utils/asyncHandler");

const router = Router();

// Minimal tenant-scoped resource for Milestone 1, so the tenant-scoping
// middleware has something real to protect and the cross-tenant test has
// something real to hit against. Full booking/room-management CRUD is
// Milestone 2 — this only lists and reads rooms already seeded for the
// caller's own hotel.
router.get(
  "/hotel/rooms",
  requireAuth,
  requireRole("HOTEL_STAFF", "HOTEL_ADMIN"),
  tenantScope,
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      "SELECT id, room_number, room_type, base_price FROM rooms WHERE hotel_id = $1 ORDER BY room_number",
      [req.hotelId]
    );
    res.json({ rooms: result.rows });
  })
);

// 404, not 403, for a room that exists but belongs to another hotel — a 403
// would confirm the room's existence to a caller who shouldn't even know
// that (Section 7).
router.get(
  "/hotel/rooms/:roomId",
  requireAuth,
  requireRole("HOTEL_STAFF", "HOTEL_ADMIN"),
  tenantScope,
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      "SELECT id, room_number, room_type, base_price FROM rooms WHERE id = $1 AND hotel_id = $2",
      [req.params.roomId, req.hotelId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "not_found" });
    }
    res.json({ room: result.rows[0] });
  })
);

module.exports = router;
