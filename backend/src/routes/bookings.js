'use strict';
/**
 * routes/bookings.js — Booking CRUD + status management
 */
const express = require('express');
const crypto  = require('crypto');
const router  = express.Router();

const { query }        = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { requireRole }  = require('../middleware/roleCheck');
const { validate, schemas } = require('../utils/validators');
const { generateQRToken, generatePin } = require('../utils/qrCode');
const { sendBookingConfirmation }      = require('../services/emailService');
const logger = require('../utils/logger');

/** Generate unique 8-char booking reference */
function generateReference() {
  return 'HV' + crypto.randomBytes(3).toString('hex').toUpperCase();
}

// POST /api/bookings — Create booking
router.post(
  '/',
  authenticate,
  requireRole('guest', 'hotel_staff', 'admin'),
  validate(schemas.createBookingSchema),
  async (req, res, next) => {
    try {
      const guestId = req.user.role === 'guest' ? req.user.id : req.body.guest_user_id;
      if (!guestId) return res.status(400).json({ success: false, error: 'guest_user_id required' });

      // Verify hotel exists and is verified
      const { rows: [hotel] } = await query(
        "SELECT id, name, verification_status FROM hotels WHERE id = $1",
        [req.body.hotel_id]
      );
      if (!hotel) return res.status(404).json({ success: false, error: 'Hotel not found' });
      if (hotel.verification_status !== 'verified') {
        return res.status(400).json({ success: false, error: 'Hotel is not verified yet' });
      }

      // Check KYC status
      const { rows: [kyc] } = await query(
        "SELECT verification_status FROM guest_kyc WHERE user_id = $1",
        [guestId]
      );
      const bookingStatus = kyc?.verification_status === 'verified' ? 'kyc_verified' : 'pending_kyc';

      const reference = generateReference();

      const { rows: [booking] } = await query(
        `INSERT INTO bookings
           (guest_user_id, hotel_id, room_number, room_type, check_in_date,
            check_out_date, num_guests, price, status, booking_reference, special_requests)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING *`,
        [
          guestId, req.body.hotel_id, req.body.room_number, req.body.room_type,
          req.body.check_in_date, req.body.check_out_date, req.body.num_guests,
          req.body.price, bookingStatus, reference, req.body.special_requests,
        ]
      );

      // Create checkin record with QR + PIN
      const qrToken = generateQRToken();
      const pin     = generatePin(6);
      await query(
        `INSERT INTO checkin_checkouts
           (booking_id, guest_user_id, hotel_id, qr_code, pin_code, qr_expires_at)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [booking.id, guestId, req.body.hotel_id, qrToken, pin,
         new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)] // 30 days
      );

      // Send confirmation email
      const { rows: [guest] } = await query('SELECT email, full_name FROM users WHERE id = $1', [guestId]);
      sendBookingConfirmation(guest.email, {
        guestName:  guest.full_name,
        hotelName:  hotel.name,
        roomNumber: booking.room_number,
        checkIn:    booking.check_in_date,
        checkOut:   booking.check_out_date,
        reference:  booking.booking_reference,
      }).catch(() => {});

      logger.info('Booking created', { bookingId: booking.id, reference, status: bookingStatus });

      res.status(201).json({ success: true, data: { booking, qrToken, pin } });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/bookings — List bookings (role-aware)
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    let whereClause = '';
    const params    = [];

    if (req.user.role === 'guest') {
      params.push(req.user.id);
      whereClause = `WHERE b.guest_user_id = $${params.length}`;
    } else if (req.user.role === 'hotel_staff') {
      // Staff sees bookings for their hotel
      const { rows: [hotel] } = await query('SELECT id FROM hotels WHERE admin_id = $1', [req.user.id]);
      if (hotel) {
        params.push(hotel.id);
        whereClause = `WHERE b.hotel_id = $${params.length}`;
      }
    }
    // Admin sees all

    if (status) {
      params.push(status);
      whereClause += whereClause ? ` AND b.status = $${params.length}` : `WHERE b.status = $${params.length}`;
    }

    params.push(parseInt(limit, 10), offset);

    const { rows } = await query(
      `SELECT b.*, u.full_name AS guest_name, u.phone AS guest_phone,
              h.name AS hotel_name, h.city AS hotel_city
       FROM bookings b
       JOIN users u ON u.id = b.guest_user_id
       JOIN hotels h ON h.id = b.hotel_id
       ${whereClause}
       ORDER BY b.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({ success: true, data: rows, meta: { page: +page, limit: +limit } });
  } catch (err) {
    next(err);
  }
});

// GET /api/bookings/:id — Single booking
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT b.*, u.full_name AS guest_name, u.email AS guest_email, u.phone AS guest_phone,
              h.name AS hotel_name, h.address AS hotel_address,
              cc.qr_code, cc.pin_code, cc.check_in_time, cc.check_out_time,
              k.verification_status AS kyc_status
       FROM bookings b
       JOIN users u ON u.id = b.guest_user_id
       JOIN hotels h ON h.id = b.hotel_id
       LEFT JOIN checkin_checkouts cc ON cc.booking_id = b.id
       LEFT JOIN guest_kyc k ON k.user_id = b.guest_user_id
       WHERE b.id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'Booking not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/bookings/:id/status — Update booking status
router.patch('/:id/status', authenticate, requireRole('hotel_staff', 'admin'), async (req, res, next) => {
  try {
    const { status } = req.body;
    const validStatuses = ['kyc_verified', 'checked_in', 'checked_out', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }
    const { rows: [booking] } = await query(
      'UPDATE bookings SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [status, req.params.id]
    );
    if (!booking) return res.status(404).json({ success: false, error: 'Booking not found' });
    res.json({ success: true, data: booking });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
