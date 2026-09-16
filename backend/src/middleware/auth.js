'use strict';
/**
 * auth.js — JWT authentication middleware
 * Attaches req.user = { id, email, role } if valid token present
 */
const { verifyToken } = require('../utils/jwt');
const { query } = require('../config/db');
const logger = require('../utils/logger');

async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'No token provided' });
    }

    const token = authHeader.slice(7);
    const decoded = verifyToken(token);

    // Verify user still exists and is active
    const { rows } = await query(
      'SELECT id, email, role, is_active FROM users WHERE id = $1',
      [decoded.id]
    );

    if (!rows.length || !rows[0].is_active) {
      return res.status(401).json({ success: false, error: 'User not found or inactive' });
    }

    req.user = {
      id:    rows[0].id,
      email: rows[0].email,
      role:  rows[0].role,
    };

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: 'Token expired' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }
    logger.error('Auth middleware error', { error: err.message });
    next(err);
  }
}

module.exports = { authenticate };
