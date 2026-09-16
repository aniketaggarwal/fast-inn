'use strict';
/**
 * env.js — Centralised environment variable config
 * Validates required vars at startup and exports typed config
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../..', '.env') });

function required(key) {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function optional(key, defaultVal = '') {
  return process.env[key] || defaultVal;
}

const config = {
  NODE_ENV: optional('NODE_ENV', 'development'),
  IS_PROD: optional('NODE_ENV') === 'production',
  PORT: parseInt(optional('PORT', '5000'), 10),

  db: {
    connectionString: optional('DATABASE_URL'),
    host:     optional('DB_HOST', 'localhost'),
    port:     parseInt(optional('DB_PORT', '5432'), 10),
    name:     optional('DB_NAME', 'hotelverify_db'),
    user:     optional('DB_USER', 'hotelverify'),
    password: optional('DB_PASSWORD', 'password'),
  },

  redis: {
    url:      optional('REDIS_URL', 'redis://localhost:6379'),
    password: optional('REDIS_PASSWORD'),
  },

  jwt: {
    secret:         optional('JWT_SECRET', 'dev_secret_change_in_production_min_64_chars_long'),
    expiresIn:      optional('JWT_EXPIRES_IN', '7d'),
    refreshExpires: optional('JWT_REFRESH_EXPIRES_IN', '30d'),
  },

  storage: {
    type:         optional('STORAGE_TYPE', 'local'),   // 'local' | 's3'
    uploadsDir:   optional('UPLOADS_DIR', './uploads'),
    maxFileSizeMb: parseInt(optional('MAX_FILE_SIZE_MB', '10'), 10),
    // S3
    awsRegion:    optional('AWS_REGION', 'ap-south-1'),
    awsAccessKey: optional('AWS_ACCESS_KEY_ID'),
    awsSecretKey: optional('AWS_SECRET_ACCESS_KEY'),
    s3Bucket:     optional('S3_BUCKET_NAME'),
  },

  otp: {
    expiresSeconds: parseInt(optional('OTP_EXPIRES_SECONDS', '300'), 10),
    length:         parseInt(optional('OTP_LENGTH', '6'), 10),
    twilioSid:      optional('TWILIO_ACCOUNT_SID'),
    twilioToken:    optional('TWILIO_AUTH_TOKEN'),
    twilioFrom:     optional('TWILIO_FROM_NUMBER'),
  },

  email: {
    from:     optional('EMAIL_FROM', 'noreply@hotelverify.in'),
    host:     optional('SMTP_HOST'),
    port:     parseInt(optional('SMTP_PORT', '587'), 10),
    user:     optional('SMTP_USER'),
    pass:     optional('SMTP_PASS'),
  },

  cors: {
    frontendUrl: optional('FRONTEND_URL', 'http://localhost:5173'),
  },

  rateLimit: {
    windowMs: parseInt(optional('RATE_LIMIT_WINDOW_MS', '900000'), 10),
    max:      parseInt(optional('RATE_LIMIT_MAX', '100'), 10),
  },
};

module.exports = config;
