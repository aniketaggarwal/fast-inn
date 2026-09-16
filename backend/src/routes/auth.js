'use strict';
/**
 * routes/auth.js — Authentication: register, login, OTP
 */
const express  = require('express');
const bcrypt   = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const router   = express.Router();

const { query }       = require('../config/db');
const { signToken }   = require('../utils/jwt');
const { validate, schemas } = require('../utils/validators');
const { authenticate }      = require('../middleware/auth');
const { sendOTP, verifyOTP } = require('../services/otp');
const logger = require('../utils/logger');

// POST /api/auth/register
router.post('/register', validate(schemas.registerSchema), async (req, res, next) => {
  try {
    const { full_name, email, phone, password, role } = req.body;

    // Hash password
    const password_hash = await bcrypt.hash(password, 12);

    const { rows: [user] } = await query(
      `INSERT INTO users (full_name, email, phone, password_hash, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, phone, role, full_name, created_at`,
      [full_name, email, phone, password_hash, role]
    );

    const token = signToken({ id: user.id, email: user.email, role: user.role });

    logger.info('New user registered', { userId: user.id, role: user.role });

    res.status(201).json({
      success: true,
      data:    { user, token },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', validate(schemas.loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const { rows } = await query(
      'SELECT id, email, phone, role, full_name, password_hash, is_active FROM users WHERE email = $1',
      [email]
    );

    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    if (!user.is_active) {
      return res.status(403).json({ success: false, error: 'Account is deactivated' });
    }

    // Update last login
    await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    const token = signToken({ id: user.id, email: user.email, role: user.role });

    const { password_hash: _, ...safeUser } = user;

    logger.info('User logged in', { userId: user.id, role: user.role });

    res.json({ success: true, data: { user: safeUser, token } });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me — Get current user profile
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT id, email, phone, role, full_name, last_login_at, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'User not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/otp/send
router.post('/otp/send', validate(schemas.otpSendSchema), async (req, res, next) => {
  try {
    const result = await sendOTP(req.body);
    res.json({ success: true, message: 'OTP sent', data: result });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/otp/verify
router.post('/otp/verify', validate(schemas.otpVerifySchema), async (req, res, next) => {
  try {
    await verifyOTP(req.body);
    res.json({ success: true, message: 'OTP verified' });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ success: false, error: err.message });
    }
    next(err);
  }
});

module.exports = router;
