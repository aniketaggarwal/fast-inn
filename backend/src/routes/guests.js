'use strict';
/**
 * routes/guests.js — Guest KYC upload, status, admin verify/reject
 */
const express = require('express');
const path    = require('path');
const router  = express.Router();

const { query }        = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { requireRole }  = require('../middleware/roleCheck');
const { validate, schemas } = require('../utils/validators');
const { upload, getFileUrl } = require('../services/s3');
const { extractFromDocument } = require('../services/ocr');
const { sendKYCApproved, sendKYCRejected } = require('../services/emailService');
const logger = require('../utils/logger');

// Multer middleware for KYC document upload
const kycUpload = upload.fields([
  { name: 'id_document', maxCount: 1 },
  { name: 'id_document_back', maxCount: 1 },
  { name: 'face_photo', maxCount: 1 },
]);

// POST /api/guests/kyc/upload — Guest uploads ID document
router.post(
  '/kyc/upload',
  authenticate,
  requireRole('guest'),
  (req, res, next) => {
    req.uploadSubDir = 'kyc';
    next();
  },
  kycUpload,
  validate(schemas.kycUploadSchema),
  async (req, res, next) => {
    try {
      const { id_type, id_number, id_expiry_date } = req.body;
      const userId = req.user.id;

      // Check if KYC already exists
      const existing = await query('SELECT id, verification_status FROM guest_kyc WHERE user_id = $1', [userId]);
      if (existing.rows.length && existing.rows[0].verification_status === 'verified') {
        return res.status(409).json({ success: false, error: 'KYC already verified' });
      }

      if (!req.files?.id_document?.[0]) {
        return res.status(400).json({ success: false, error: 'ID document file is required' });
      }

      const docFile  = req.files.id_document[0];
      const backFile = req.files.id_document_back?.[0];
      const faceFile = req.files.face_photo?.[0];

      const docUrl  = getFileUrl(docFile.path);
      const backUrl = backFile  ? getFileUrl(backFile.path)  : null;
      const faceUrl = faceFile  ? getFileUrl(faceFile.path)  : null;

      // Run OCR
      const ocr = await extractFromDocument(docFile.path, id_type);

      const upsertQuery = existing.rows.length
        ? `UPDATE guest_kyc SET
             id_type = $1, id_number = $2, id_document_url = $3,
             id_document_back_url = $4, face_photo_url = $5, id_expiry_date = $6,
             extracted_name = $7, extracted_dob = $8, extracted_address = $9,
             extracted_id_number = $10, ocr_confidence_score = $11,
             verification_status = 'pending', updated_at = NOW()
           WHERE user_id = $12
           RETURNING *`
        : `INSERT INTO guest_kyc
             (user_id, id_type, id_number, id_document_url, id_document_back_url,
              face_photo_url, id_expiry_date, extracted_name, extracted_dob,
              extracted_address, extracted_id_number, ocr_confidence_score)
           VALUES ($12, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           RETURNING *`;

      const { rows: [kyc] } = await query(upsertQuery, [
        id_type, id_number, docUrl, backUrl, faceUrl,
        id_expiry_date || null,
        ocr.name, ocr.dob, ocr.address, ocr.idNumber, ocr.confidence,
        userId,
      ]);

      logger.info('KYC uploaded', { userId, idType: id_type, confidence: ocr.confidence });

      res.status(201).json({
        success: true,
        data:    { kyc, ocr: { confidence: ocr.confidence, extractedName: ocr.name } },
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/guests/kyc/status — Guest checks own KYC status
router.get('/kyc/status', authenticate, requireRole('guest'), async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, id_type, verification_status, ocr_confidence_score,
              extracted_name, verified_at, rejection_reason, created_at
       FROM guest_kyc WHERE user_id = $1`,
      [req.user.id]
    );
    if (!rows.length) {
      return res.json({ success: true, data: null, message: 'No KYC submitted yet' });
    }
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

// GET /api/guests/kyc — Admin: list all pending KYC
router.get('/kyc', authenticate, requireRole('admin', 'hotel_staff'), async (req, res, next) => {
  try {
    const status = req.query.status || 'pending';
    const page   = parseInt(req.query.page || '1', 10);
    const limit  = parseInt(req.query.limit || '20', 10);
    const offset = (page - 1) * limit;

    const { rows } = await query(
      `SELECT k.*, u.full_name, u.email, u.phone
       FROM guest_kyc k
       JOIN users u ON u.id = k.user_id
       WHERE k.verification_status = $1
       ORDER BY k.created_at DESC
       LIMIT $2 OFFSET $3`,
      [status, limit, offset]
    );

    const { rows: [{ count }] } = await query(
      'SELECT COUNT(*) FROM guest_kyc WHERE verification_status = $1',
      [status]
    );

    res.json({
      success: true,
      data:    rows,
      meta:    { total: parseInt(count), page, limit },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/guests/kyc/:id — Admin: get single KYC record
router.get('/kyc/:id', authenticate, requireRole('admin', 'hotel_staff'), async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT k.*, u.full_name, u.email, u.phone
       FROM guest_kyc k
       JOIN users u ON u.id = k.user_id
       WHERE k.id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'KYC record not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/guests/kyc/:id/verify — Admin approves KYC
router.patch('/kyc/:id/verify', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const { rows } = await query(
      `UPDATE guest_kyc
       SET verification_status = 'verified', verified_by_admin_id = $1, verified_at = NOW()
       WHERE id = $2
       RETURNING *, (SELECT email FROM users WHERE id = user_id) AS email,
                    (SELECT full_name FROM users WHERE id = user_id) AS full_name`,
      [req.user.id, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'KYC not found' });

    // Also update booking status if pending_kyc
    await query(
      `UPDATE bookings SET status = 'kyc_verified'
       WHERE guest_user_id = $1 AND status = 'pending_kyc'`,
      [rows[0].user_id]
    );

    // Send approval email
    sendKYCApproved(rows[0].email, rows[0].full_name).catch(() => {});

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/guests/kyc/:id/reject — Admin rejects KYC
router.patch(
  '/kyc/:id/reject',
  authenticate,
  requireRole('admin'),
  validate(schemas.kycRejectSchema),
  async (req, res, next) => {
    try {
      const { rejection_reason } = req.body;
      const { rows } = await query(
        `UPDATE guest_kyc
         SET verification_status = 'rejected', rejection_reason = $1,
             verified_by_admin_id = $2, verified_at = NOW()
         WHERE id = $3
         RETURNING *, (SELECT email FROM users WHERE id = user_id) AS email,
                      (SELECT full_name FROM users WHERE id = user_id) AS full_name`,
        [rejection_reason, req.user.id, req.params.id]
      );
      if (!rows.length) return res.status(404).json({ success: false, error: 'KYC not found' });

      sendKYCRejected(rows[0].email, rows[0].full_name, rejection_reason).catch(() => {});

      res.json({ success: true, data: rows[0] });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
