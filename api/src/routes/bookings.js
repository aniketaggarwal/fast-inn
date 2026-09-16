const { Router } = require("express");
const { pool, withGuestTransaction } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { asyncHandler } = require("../utils/asyncHandler");
const { isValidDateStr, nightsBetween, todayUTC } = require("../utils/dates");

const router = Router();

// Booking targets one specific room, not a room "type" pool — this matches
// how room_availability is keyed (PK (room_id, stay_date), Section 9.5) and
// how the concurrency test is phrased ("20 concurrent requests for the same
// room"). A room-type-first flow would still bottom out here once a
// specific room is chosen.
router.post(
  "/bookings",
  requireAuth,
  requireRole("GUEST"),
  asyncHandler(async (req, res) => {
    const { hotelId, roomId, checkIn, checkOut } = req.body || {};
    if (typeof hotelId !== "string" || typeof roomId !== "string") {
      return res.status(400).json({ error: "invalid_input" });
    }
    if (!isValidDateStr(checkIn) || !isValidDateStr(checkOut) || checkIn >= checkOut) {
      return res.status(400).json({ error: "invalid_date_range" });
    }
    if (checkIn < todayUTC()) {
      return res.status(400).json({ error: "check_in_in_past" });
    }

    const roomResult = await pool.query(
      "SELECT id, base_price FROM rooms WHERE id = $1 AND hotel_id = $2",
      [roomId, hotelId]
    );
    if (roomResult.rowCount === 0) {
      return res.status(404).json({ error: "room_not_found" });
    }
    const room = roomResult.rows[0];
    const nights = nightsBetween(checkIn, checkOut);
    const totalAmount = (Number(room.base_price) * nights.length).toFixed(2);

    try {
      // bookings has RLS forced (Section 7); a guest's own row is
      // authorized via the guest_user_id branch of that policy, set here
      // for the transaction's duration — see the
      // bookings-rls-guest-path migration.
      const booking = await withGuestTransaction(req.user.id, async (client) => {
        const bookingResult = await client.query(
          `INSERT INTO bookings (hotel_id, room_id, guest_user_id, check_in, check_out, total_amount)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, hotel_id, room_id, check_in, check_out, status, total_amount`,
          [hotelId, roomId, req.user.id, checkIn, checkOut, totalAmount]
        );
        const created = bookingResult.rows[0];

        // One row per night. If any night is already taken, this insert
        // hits the (room_id, stay_date) primary key and throws — the whole
        // transaction rolls back, so a booking is never left half-reserved.
        for (const night of nights) {
          await client.query(
            "INSERT INTO room_availability (room_id, stay_date, booking_id) VALUES ($1, $2, $3)",
            [roomId, night, created.id]
          );
        }
        return created;
      });
      res.status(201).json({ booking });
    } catch (err) {
      if (err.code === "23505") {
        return res.status(409).json({ error: "room_not_available" });
      }
      throw err;
    }
  })
);

router.get(
  "/bookings/mine",
  requireAuth,
  requireRole("GUEST"),
  asyncHandler(async (req, res) => {
    const bookings = await withGuestTransaction(req.user.id, async (client) => {
      const result = await client.query(
        `SELECT b.id, b.check_in, b.check_out, b.status, b.total_amount,
                h.name AS hotel_name, h.city AS hotel_city,
                r.room_number, r.room_type
         FROM bookings b
         JOIN hotels h ON h.id = b.hotel_id
         JOIN rooms r ON r.id = b.room_id
         WHERE b.guest_user_id = $1
         ORDER BY b.check_in DESC`,
        [req.user.id]
      );
      return result.rows;
    });
    res.json({ bookings });
  })
);

// 404 (not 403) for a booking that exists but belongs to someone else —
// same reasoning as the cross-tenant case in Section 7, applied to
// ownership instead of hotel_id.
router.post(
  "/bookings/:bookingId/cancel",
  requireAuth,
  requireRole("GUEST"),
  asyncHandler(async (req, res) => {
    const cancelledId = await withGuestTransaction(req.user.id, async (client) => {
      const result = await client.query(
        `UPDATE bookings SET status = 'CANCELLED'
         WHERE id = $1 AND guest_user_id = $2 AND status = 'RESERVED'
         RETURNING id`,
        [req.params.bookingId, req.user.id]
      );
      if (result.rowCount === 0) return null;
      await client.query("DELETE FROM room_availability WHERE booking_id = $1", [req.params.bookingId]);
      return result.rows[0].id;
    });

    if (!cancelledId) {
      return res.status(404).json({ error: "not_found" });
    }
    res.json({ booking: { id: cancelledId, status: "CANCELLED" } });
  })
);

module.exports = router;
