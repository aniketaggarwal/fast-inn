'use strict';
/**
 * qrCode.js — QR code generation for check-in flow
 */
const QRCode = require('qrcode');
const crypto = require('crypto');

/**
 * Generate a secure random PIN
 * @param {number} length
 * @returns {string}
 */
function generatePin(length = 6) {
  const digits = '0123456789';
  let pin = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    pin += digits[bytes[i] % 10];
  }
  return pin;
}

/**
 * Generate a QR code data URL for a booking check-in
 * @param {string} bookingId
 * @param {string} pin
 * @returns {Promise<string>} base64 PNG data URL
 */
async function generateCheckInQR(bookingId, pin) {
  const payload = JSON.stringify({
    bid: bookingId,
    pin,
    ts:  Date.now(),
  });
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    width: 300,
    margin: 2,
    color: { dark: '#0A1628', light: '#FFFFFF' },
  });
}

/**
 * Generate a unique QR token string (stored in DB)
 * @returns {string}
 */
function generateQRToken() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = { generatePin, generateCheckInQR, generateQRToken };
