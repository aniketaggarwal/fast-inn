'use strict';
/**
 * app.js — Express application setup
 * Middleware, routes, static files, error handler
 */
const express       = require('express');
const cors          = require('cors');
const helmet        = require('helmet');
const morgan        = require('morgan');
const path          = require('path');
const rateLimit     = require('express-rate-limit');

const config        = require('./config/env');
const logger        = require('./utils/logger');
const { errorHandler } = require('./middleware/errorHandler');
const { UPLOADS_DIR }  = require('./services/s3');

// Routes
const authRoutes       = require('./routes/auth');
const guestRoutes      = require('./routes/guests');
const hotelRoutes      = require('./routes/hotels');
const bookingRoutes    = require('./routes/bookings');
const documentRoutes   = require('./routes/documents');
const checkinRoutes    = require('./routes/checkin');
const complianceRoutes = require('./routes/compliance');

const app = express();

// ── Security middleware ───────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // allow /uploads serving
}));

app.use(cors({
  origin:      config.cors.frontendUrl,
  credentials: true,
  methods:     ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Rate limiting ─────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max:      config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, error: 'Too many requests, please try again later' },
});

// Stricter limit for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max:      20,
  message: { success: false, error: 'Too many auth attempts' },
});

app.use(limiter);

// ── Request parsing ───────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── HTTP request logging ──────────────────────────────────────
if (config.NODE_ENV !== 'test') {
  app.use(morgan('combined', {
    stream: { write: (msg) => logger.http(msg.trim()) },
  }));
}

// ── Static file serving (local uploads) ──────────────────────
app.use('/uploads', express.static(UPLOADS_DIR));

// ── Health check ──────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), env: config.NODE_ENV });
});

// ── API Routes ────────────────────────────────────────────────
app.use('/api/auth',       authLimiter, authRoutes);
app.use('/api/guests',     guestRoutes);
app.use('/api/hotels',     hotelRoutes);
app.use('/api/bookings',   bookingRoutes);
app.use('/api/documents',  documentRoutes);
app.use('/api/checkin',    checkinRoutes);
app.use('/api/compliance', complianceRoutes);

// ── 404 handler ───────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, error: `Route ${req.method} ${req.path} not found` });
});

// ── Global error handler ──────────────────────────────────────
app.use(errorHandler);

module.exports = app;
