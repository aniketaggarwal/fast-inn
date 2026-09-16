const { Router } = require("express");
const { pool } = require("../db");
const { asyncHandler } = require("../utils/asyncHandler");
const { isValidDateStr } = require("../utils/dates");

const router = Router();

// Public browsing — no auth required, matches Section 6 (GET /hotels,
// GET /hotels/:id/availability carry no role restriction).
router.get(
  "/hotels",
  asyncHandler(async (req, res) => {
    const { city } = req.query;
    const params = [];
    let where = "WHERE status = 'ACTIVE'";
    if (typeof city === "string" && city.trim()) {
      params.push(city.trim());
      where += ` AND city ILIKE $${params.length}`;
    }
    const result = await pool.query(
      `SELECT id, name, city, address FROM hotels ${where} ORDER BY name`,
      params
    );
    res.json({ hotels: result.rows });
  })
);

router.get(
  "/hotels/:hotelId/availability",
  asyncHandler(async (req, res) => {
    const { from, to } = req.query;
    if (!isValidDateStr(from) || !isValidDateStr(to) || from >= to) {
      return res.status(400).json({ error: "invalid_date_range" });
    }

    const hotel = await pool.query("SELECT id FROM hotels WHERE id = $1 AND status = 'ACTIVE'", [
      req.params.hotelId,
    ]);
    if (hotel.rowCount === 0) {
      return res.status(404).json({ error: "not_found" });
    }

    // A room is available for the range iff no room_availability row
    // exists for any night in it — one EXISTS subquery per room, no
    // per-night looping in application code.
    const result = await pool.query(
      `SELECT r.id, r.room_number, r.room_type, r.base_price,
              NOT EXISTS (
                SELECT 1 FROM room_availability ra
                WHERE ra.room_id = r.id AND ra.stay_date >= $2 AND ra.stay_date < $3
              ) AS available
       FROM rooms r
       WHERE r.hotel_id = $1
       ORDER BY r.room_number`,
      [req.params.hotelId, from, to]
    );
    res.json({ rooms: result.rows });
  })
);

module.exports = router;
