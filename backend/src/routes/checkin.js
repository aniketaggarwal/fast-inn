'use strict';
/**
 * routes/checkin.js — Check-in / check-out logic + QR scan
 */
const express = require('express');
const router  = express.Router();

const { query, withTransaction } = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { requireRole }  = require('../middleware/roleCheck');
const { validate, schemas } = require('../utils/validators');
const { generateCheckInQR } = require('../utils/qrCode');
const logger = require('../utils/logger');

// POST /api/checkin — Staff processes guest check-in
router.post(
  '/',
  authenticate,
  requireRole('hotel_staff', 'admin'),
  validate(schemas.checkInSchema),
  async (req, res, next) => {
    try {
      const { booking_id, pin_code } = req.body;

      // Fetch booking + check-in record
      const { rows } = await query(
        `SELECT b.*, cc.id AS cc_id, cc.pin_code AS stored_pin, cc.check_in_time, cc.qr_code
         FROM bookings b
         JOIN checkin_checkouts cc ON cc.booking_id = b.id
         WHERE b.id = $1`,
        [booking_id]
      );

      if (!rows.length) return res.status(404).json({ success: false, error: 'Booking not found' });

      const record = rows[0];

      // Validate PIN
      if (record.stored_pin !== pin_code) {
        return res.status(400).json({ success: false, error: 'Invalid PIN code' });
      }

      // Validate status
      if (record.status === 'pending_kyc') {
        return res.status(400).json({ success: false, error: 'Guest KYC not verified yet' });
      }
      if (record.check_in_time) {
        return res.status(409).json({ success: false, error: 'Guest already checked in' });
      }
      if (record.status === 'cancelled') {
        return res.status(400).json({ success: false, error: 'Booking is cancelled' });
      }

      // Process check-in in transaction
      const result = await withTransaction(async (client) => {
        await client.query(
          `UPDATE checkin_checkouts SET check_in_time = NOW(), checked_in_by = $1 WHERE id = $2`,
          [req.user.id, record.cc_id]
        );
        const { rows: [booking] } = await client.query(
          `UPDATE bookings SET status = 'checked_in', updated_at = NOW() WHERE id = $1 RETURNING *`,
          [booking_id]
        );
        return booking;
      });

      // Generate QR data URL for receipt
      const qrDataUrl = await generateCheckInQR(booking_id, pin_code);

      logger.info('Guest checked in', { bookingId: booking_id, staffId: req.user.id });

      res.json({
        success: true,
        message: 'Check-in successful',
        data: { booking: result, qrDataUrl },
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/checkin/checkout — Staff processes guest check-out
router.post(
  '/checkout',
  authenticate,
  requireRole('hotel_staff', 'admin'),
  validate(schemas.checkOutSchema),
  async (req, res, next) => {
    try {
      const { booking_id, notes } = req.body;

      const { rows } = await query(
        `SELECT b.status, cc.id AS cc_id, cc.check_in_time, cc.check_out_time
         FROM bookings b
         JOIN checkin_checkouts cc ON cc.booking_id = b.id
         WHERE b.id = $1`,
        [booking_id]
      );

      if (!rows.length) return res.status(404).json({ success: false, error: 'Booking not found' });
      const record = rows[0];

      if (record.status !== 'checked_in') {
        return res.status(400).json({ success: false, error: 'Guest is not currently checked in' });
      }
      if (record.check_out_time) {
        return res.status(409).json({ success: false, error: 'Guest already checked out' });
      }

      await withTransaction(async (client) => {
        await client.query(
          `UPDATE checkin_checkouts SET check_out_time = NOW(), checked_out_by = $1, notes = $2 WHERE id = $3`,
          [req.user.id, notes, record.cc_id]
        );
        await client.query(
          `UPDATE bookings SET status = 'checked_out', updated_at = NOW() WHERE id = $1`,
          [booking_id]
        );
      });

      logger.info('Guest checked out', { bookingId: booking_id, staffId: req.user.id });

      res.json({ success: true, message: 'Check-out successful' });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/checkin/scan/:qrCode — Scan QR code to fetch booking details
router.get('/scan/:qrCode', authenticate, requireRole('hotel_staff', 'admin'), async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT b.*, u.full_name, u.phone, u.email,
              k.verification_status AS kyc_status, k.id_type, k.extracted_name,
              cc.check_in_time, cc.check_out_time, cc.pin_code
       FROM checkin_checkouts cc
       JOIN bookings b ON b.id = cc.booking_id
       JOIN users u ON u.id = b.guest_user_id
       LEFT JOIN guest_kyc k ON k.user_id = b.guest_user_id
       WHERE cc.qr_code = $1`,
      [req.params.qrCode]
    );

    if (!rows.length) return res.status(404).json({ success: false, error: 'QR code not found' });

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

// GET /api/checkin/today — Today's arrivals for hotel
router.get('/today', authenticate, requireRole('hotel_staff', 'admin'), async (req, res, next) => {
  try {
    const { rows: [hotel] } = await query(
      'SELECT id FROM hotels WHERE admin_id = $1',
      [req.user.id]
    );
    if (!hotel) return res.status(404).json({ success: false, error: 'Hotel not found' });

    const today = new Date().toISOString().split('T')[0];

    const { rows } = await query(
      `SELECT b.*, u.full_name, u.phone, k.verification_status AS kyc_status,
              cc.check_in_time, cc.qr_code
       FROM bookings b
       JOIN users u ON u.id = b.guest_user_id
       LEFT JOIN guest_kyc k ON k.user_id = b.guest_user_id
       LEFT JOIN checkin_checkouts cc ON cc.booking_id = b.id
       WHERE b.hotel_id = $1 AND b.check_in_date = $2 AND b.status != 'cancelled'
       ORDER BY b.created_at ASC`,
      [hotel.id, today]
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
