'use strict';
/**
 * errorHandler.js — Global Express error handler
 * Maps common error types to clean JSON responses
 */
const logger = require('../utils/logger');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  logger.error('Unhandled error', {
    message: err.message,
    stack:   err.stack,
    path:    req.path,
    method:  req.method,
  });

  // Zod validation (should be caught by validate() middleware, but just in case)
  if (err.name === 'ZodError') {
    return res.status(400).json({
      success: false,
      error:   'Validation failed',
      details: err.flatten().fieldErrors,
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ success: false, error: 'Token expired' });
  }

  // PostgreSQL errors
  if (err.code) {
    switch (err.code) {
      case '23505': // unique_violation
        return res.status(409).json({
          success: false,
          error: 'A record with that value already exists',
          detail: err.detail,
        });
      case '23503': // foreign_key_violation
        return res.status(400).json({
          success: false,
          error: 'Referenced resource does not exist',
        });
      case '23502': // not_null_violation
        return res.status(400).json({
          success: false,
          error: `Missing required field: ${err.column}`,
        });
    }
  }

  // Multer file size error
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ success: false, error: 'File too large' });
  }

  // Default 500
  const isProd = process.env.NODE_ENV === 'production';
  return res.status(err.status || 500).json({
    success: false,
    error:   isProd ? 'Internal server error' : err.message,
    ...(isProd ? {} : { stack: err.stack }),
  });
}

module.exports = { errorHandler };
