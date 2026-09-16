'use strict';
/**
 * otp.js — OTP generation, storage (Redis) and verification
 * For MVP: OTP is logged to console. Wire in Twilio for production.
 */
const crypto = require('crypto');
const redis = require('../config/redis');
const config = require('../config/env');
const logger = require('../utils/logger');

const OTP_PREFIX    = 'otp:';
const ATTEMPT_PREFIX = 'otp_attempts:';
const MAX_ATTEMPTS  = 5;

/**
 * Generate a secure numeric OTP
 */
function generateOTP(length = config.otp.length) {
  const digits = '0123456789';
  const bytes  = crypto.randomBytes(length);
  return Array.from(bytes).map(b => digits[b % 10]).join('');
}

/**
 * Build the Redis key for an OTP
 * @param {string} identifier - phone or email
 * @param {string} purpose
 */
function otpKey(identifier, purpose) {
  return `${OTP_PREFIX}${purpose}:${identifier}`;
}

/**
 * Send OTP to phone/email (MVP: console log only)
 * @param {Object} params
 * @param {string} [params.phone]
 * @param {string} [params.email]
 * @param {string} params.purpose
 * @returns {Promise<void>}
 */
async function sendOTP({ phone, email, purpose }) {
  const identifier = phone || email;
  if (!identifier) throw new Error('Phone or email required');

  const otp = generateOTP();
  const key = otpKey(identifier, purpose);

  // Store hashed OTP in Redis
  const hashed = crypto.createHash('sha256').update(otp).digest('hex');
  await redis.setex(key, config.otp.expiresSeconds, hashed);

  // Reset attempt counter
  await redis.del(`${ATTEMPT_PREFIX}${key}`);

  // In development, log OTP to console
  if (config.NODE_ENV !== 'production') {
    logger.info(`[DEV OTP] ${identifier} | Purpose: ${purpose} | OTP: ${otp}`);
  } else {
    // TODO: Integrate Twilio SMS for production
    // await twilioClient.messages.create({ body: `Your HotelVerify OTP: ${otp}`, from: ..., to: phone });
    logger.warn('Production OTP send not yet configured — OTP not sent');
  }

  return { expiresIn: config.otp.expiresSeconds };
}

/**
 * Verify OTP
 * @param {Object} params
 * @param {string} [params.phone]
 * @param {string} [params.email]
 * @param {string} params.otp
 * @param {string} params.purpose
 * @returns {Promise<boolean>}
 */
async function verifyOTP({ phone, email, otp, purpose }) {
  const identifier = phone || email;
  const key        = otpKey(identifier, purpose);
  const attemptKey = `${ATTEMPT_PREFIX}${key}`;

  // Check attempt limit
  const attempts = parseInt((await redis.get(attemptKey)) || '0', 10);
  if (attempts >= MAX_ATTEMPTS) {
    throw Object.assign(new Error('Too many OTP attempts. Please request a new OTP.'), { status: 429 });
  }

  const storedHash = await redis.get(key);
  if (!storedHash) {
    throw Object.assign(new Error('OTP expired or not found'), { status: 400 });
  }

  const inputHash = crypto.createHash('sha256').update(otp).digest('hex');

  // Constant-time comparison
  const isValid = crypto.timingSafeEqual(
    Buffer.from(storedHash, 'hex'),
    Buffer.from(inputHash, 'hex')
  );

  if (!isValid) {
    await redis.incr(attemptKey);
    await redis.expire(attemptKey, config.otp.expiresSeconds);
    throw Object.assign(new Error('Invalid OTP'), { status: 400 });
  }

  // Invalidate OTP after successful verification
  await redis.del(key, attemptKey);
  return true;
}

module.exports = { sendOTP, verifyOTP };
