'use strict';
/**
 * routes/documents.js — Guest document upload and verification
 */
const express = require('express');
const router  = express.Router();

const { query }        = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { requireRole }  = require('../middleware/roleCheck');
const { upload, getFileUrl } = require('../services/s3');
const logger = require('../utils/logger');

const docUpload = upload.single('document');

// POST /api/documents/upload
router.post(
  '/upload',
  authenticate,
  (req, res, next) => { req.uploadSubDir = 'documents'; next(); },
  docUpload,
  async (req, res, next) => {
    try {
      const { booking_id, document_type } = req.body;
      if (!booking_id || !document_type) {
        return res.status(400).json({ success: false, error: 'booking_id and document_type required' });
      }
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'Document file required' });
      }

      // Verify booking belongs to user (or staff/admin)
      const { rows: [booking] } = await query(
        'SELECT guest_user_id, hotel_id FROM bookings WHERE id = $1',
        [booking_id]
      );
      if (!booking) return res.status(404).json({ success: false, error: 'Booking not found' });

      if (req.user.role === 'guest' && booking.guest_user_id !== req.user.id) {
        return res.status(403).json({ success: false, error: 'Not your booking' });
      }

      const fileUrl = getFileUrl(req.file.path);

      const { rows: [doc] } = await query(
        `INSERT INTO guest_documents
           (booking_id, guest_user_id, document_type, document_url, file_size, mime_type)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [booking_id, booking.guest_user_id, document_type, fileUrl, req.file.size, req.file.mimetype]
      );

      res.status(201).json({ success: true, data: doc });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/documents/:bookingId — List documents for a booking
router.get('/:bookingId', authenticate, async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT * FROM guest_documents WHERE booking_id = $1 ORDER BY uploaded_at DESC',
      [req.params.bookingId]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/documents/:id/verify — Staff verifies a document
router.patch('/:id/verify', authenticate, requireRole('hotel_staff', 'admin'), async (req, res, next) => {
  try {
    const { rows: [doc] } = await query(
      'UPDATE guest_documents SET verified_at = NOW(), verified_by = $1 WHERE id = $2 RETURNING *',
      [req.user.id, req.params.id]
    );
    if (!doc) return res.status(404).json({ success: false, error: 'Document not found' });
    res.json({ success: true, data: doc });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
