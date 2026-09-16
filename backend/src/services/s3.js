'use strict';
/**
 * s3.js — File storage abstraction
 * MVP: local disk via multer
 * Production: swap STORAGE_TYPE=s3 and provide AWS credentials
 */
const multer = require('multer');
const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');
const config = require('../config/env');
const logger = require('../utils/logger');

// Ensure uploads directory exists
const UPLOADS_DIR = path.resolve(config.storage.uploadsDir);
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// ── Local Storage (MVP) ──────────────────────────────────────

const localStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const subDir = req.uploadSubDir || 'misc';
    const dest   = path.join(UPLOADS_DIR, subDir);
    fs.mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename: (req, file, cb) => {
    const ext      = path.extname(file.originalname).toLowerCase();
    const unique   = crypto.randomBytes(16).toString('hex');
    cb(null, `${unique}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('File type not allowed. Accepted: JPEG, PNG, WebP, PDF'), false);
  }
};

const upload = multer({
  storage: localStorage,
  fileFilter,
  limits: { fileSize: config.storage.maxFileSizeMb * 1024 * 1024 },
});

/**
 * Get the public URL for a stored file
 * @param {string} filePath - relative path returned by multer
 * @returns {string}
 */
function getFileUrl(filePath) {
  if (config.storage.type === 's3') {
    return `https://${config.storage.s3Bucket}.s3.${config.storage.awsRegion}.amazonaws.com/${filePath}`;
  }
  // Local: serve from /uploads/ via Express static
  const relative = path.relative(UPLOADS_DIR, filePath);
  return `/uploads/${relative.replace(/\\/g, '/')}`;
}

/**
 * Delete a stored file
 * @param {string} fileUrl - URL or local path
 */
async function deleteFile(fileUrl) {
  if (config.storage.type === 's3') {
    // TODO: AWS S3 deleteObject
    logger.warn('S3 deleteFile not yet implemented');
    return;
  }
  try {
    const localPath = fileUrl.startsWith('/uploads/')
      ? path.join(UPLOADS_DIR, fileUrl.slice('/uploads/'.length))
      : fileUrl;
    fs.unlinkSync(localPath);
  } catch (err) {
    logger.warn('Could not delete file', { fileUrl, error: err.message });
  }
}

module.exports = { upload, getFileUrl, deleteFile, UPLOADS_DIR };
