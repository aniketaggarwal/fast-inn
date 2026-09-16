'use strict';
/**
 * routes/hotels.js — Hotel registration, management, admin verification
 */
const express = require('express');
const router  = express.Router();

const { query }        = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { requireRole }  = require('../middleware/roleCheck');
const { validate, schemas } = require('../utils/validators');
const logger = require('../utils/logger');

// POST /api/hotels — Register new hotel (hotel_staff or admin)
router.post(
  '/',
  authenticate,
  requireRole('hotel_staff', 'admin'),
  validate(schemas.createHotelSchema),
  async (req, res, next) => {
    try {
      const {
        name, address, city, state, pincode, phone, email,
        latitude, longitude, room_count, registration_license,
      } = req.body;

      const { rows: [hotel] } = await query(
        `INSERT INTO hotels
           (admin_id, name, address, city, state, pincode, phone, email,
            latitude, longitude, room_count, registration_license)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING *`,
        [
          req.user.id, name, address, city, state, pincode,
          phone, email, latitude, longitude, room_count, registration_license,
        ]
      );

      logger.info('Hotel registered', { hotelId: hotel.id, name });
      res.status(201).json({ success: true, data: hotel });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/hotels — List hotels (public, with filters)
router.get('/', async (req, res, next) => {
  try {
    const { city, status = 'verified', page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const params  = [status, limit, offset];
    let where     = 'verification_status = $1';

    if (city) {
      where += ' AND LOWER(city) = LOWER($4)';
      params.push(city);
    }

    const { rows } = await query(
      `SELECT id, name, address, city, state, pincode, phone, email,
              latitude, longitude, room_count, logo_url, verification_status, created_at
       FROM hotels WHERE ${where}
       ORDER BY name ASC LIMIT $2 OFFSET $3`,
      params
    );

    const { rows: [{ count }] } = await query(
      `SELECT COUNT(*) FROM hotels WHERE ${where}`,
      params.slice(0, city ? 4 : 3).filter((_, i) => i !== 1 && i !== 2)
    );

    res.json({ success: true, data: rows, meta: { total: parseInt(count), page: +page, limit: +limit } });
  } catch (err) {
    next(err);
  }
});

// GET /api/hotels/:id — Get single hotel
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM hotels WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'Hotel not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/hotels/:id — Update hotel (owner or admin)
router.patch(
  '/:id',
  authenticate,
  validate(schemas.updateHotelSchema),
  async (req, res, next) => {
    try {
      // Verify ownership
      const { rows } = await query('SELECT admin_id FROM hotels WHERE id = $1', [req.params.id]);
      if (!rows.length) return res.status(404).json({ success: false, error: 'Hotel not found' });
      if (rows[0].admin_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Not authorized to update this hotel' });
      }

      const fields = Object.keys(req.body);
      if (!fields.length) return res.status(400).json({ success: false, error: 'No fields to update' });

      const setClauses = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
      const values     = fields.map(f => req.body[f]);

      const { rows: [updated] } = await query(
        `UPDATE hotels SET ${setClauses}, updated_at = NOW() WHERE id = $1 RETURNING *`,
        [req.params.id, ...values]
      );

      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/hotels/:id/verify — Admin verifies hotel
router.patch('/:id/verify', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const { rows: [hotel] } = await query(
      `UPDATE hotels SET verification_status = 'verified', verified_at = NOW()
       WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (!hotel) return res.status(404).json({ success: false, error: 'Hotel not found' });
    logger.info('Hotel verified', { hotelId: hotel.id, adminId: req.user.id });
    res.json({ success: true, data: hotel });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/hotels/:id/reject — Admin rejects hotel
router.patch('/:id/reject', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const reason = req.body.reason || 'Does not meet requirements';
    const { rows: [hotel] } = await query(
      `UPDATE hotels SET verification_status = 'rejected', rejected_reason = $2
       WHERE id = $1 RETURNING *`,
      [req.params.id, reason]
    );
    if (!hotel) return res.status(404).json({ success: false, error: 'Hotel not found' });
    res.json({ success: true, data: hotel });
  } catch (err) {
    next(err);
  }
});

// GET /api/hotels/my/dashboard — Hotel staff: own hotel stats
router.get('/my/dashboard', authenticate, requireRole('hotel_staff', 'admin'), async (req, res, next) => {
  try {
    const { rows: [hotel] } = await query(
      'SELECT * FROM hotels WHERE admin_id = $1 LIMIT 1',
      [req.user.id]
    );
    if (!hotel) return res.status(404).json({ success: false, error: 'No hotel associated with account' });

    const today = new Date().toISOString().split('T')[0];

    const [arrivals, departures, kyqQueue] = await Promise.all([
      query(
        `SELECT COUNT(*) FROM bookings WHERE hotel_id = $1 AND check_in_date = $2 AND status != 'cancelled'`,
        [hotel.id, today]
      ),
      query(
        `SELECT COUNT(*) FROM bookings WHERE hotel_id = $1 AND check_out_date = $2 AND status = 'checked_in'`,
        [hotel.id, today]
      ),
      query(
        `SELECT COUNT(*) FROM bookings WHERE hotel_id = $1 AND status = 'pending_kyc'`,
        [hotel.id]
      ),
    ]);

    res.json({
      success: true,
      data: {
        hotel,
        stats: {
          today_arrivals:  parseInt(arrivals.rows[0].count),
          today_departures: parseInt(departures.rows[0].count),
          pending_kyc:     parseInt(kyqQueue.rows[0].count),
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
