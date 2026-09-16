'use strict';
/**
 * routes/compliance.js — Compliance report generation and retrieval
 */
const express = require('express');
const router  = express.Router();

const { query }        = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { requireRole }  = require('../middleware/roleCheck');
const { validate, schemas } = require('../utils/validators');
const { generateReport } = require('../services/complianceGenerator');

// POST /api/compliance/generate — Generate compliance report
router.post(
  '/generate',
  authenticate,
  requireRole('hotel_staff', 'admin'),
  validate(schemas.generateReportSchema),
  async (req, res, next) => {
    try {
      const { hotel_id, report_period_start, report_period_end } = req.body;

      // Verify staff owns the hotel (admin can generate for any)
      if (req.user.role === 'hotel_staff') {
        const { rows: [hotel] } = await query(
          'SELECT id FROM hotels WHERE id = $1 AND admin_id = $2',
          [hotel_id, req.user.id]
        );
        if (!hotel) return res.status(403).json({ success: false, error: 'Not your hotel' });
      }

      const report = await generateReport({
        hotelId:    hotel_id,
        startDate:  report_period_start,
        endDate:    report_period_end,
        generatedBy: req.user.id,
      });

      res.status(201).json({ success: true, data: report });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/compliance/reports — List reports (hotel or admin)
router.get('/reports', authenticate, requireRole('hotel_staff', 'admin'), async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    let where  = '';
    const params = [];

    if (req.user.role === 'hotel_staff') {
      const { rows: [hotel] } = await query('SELECT id FROM hotels WHERE admin_id = $1', [req.user.id]);
      if (hotel) {
        params.push(hotel.id);
        where = 'WHERE cr.hotel_id = $1';
      }
    }

    params.push(parseInt(limit, 10), offset);

    const { rows } = await query(
      `SELECT cr.*, h.name AS hotel_name
       FROM compliance_reports cr
       JOIN hotels h ON h.id = cr.hotel_id
       ${where}
       ORDER BY cr.generated_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/compliance/reports/:id — Get single report with full data
router.get('/reports/:id', authenticate, requireRole('hotel_staff', 'admin'), async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT cr.*, h.name AS hotel_name, h.address AS hotel_address
       FROM compliance_reports cr
       JOIN hotels h ON h.id = cr.hotel_id
       WHERE cr.id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'Report not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
