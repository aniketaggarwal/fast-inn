'use strict';
/**
 * jwt.js — JWT sign / verify helpers
 */
const jwt = require('jsonwebtoken');
const config = require('../config/env');

/**
 * Sign a JWT token
 * @param {Object} payload - { id, email, role }
 * @returns {string} signed JWT
 */
function signToken(payload) {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
    issuer: 'hotelverify',
    audience: 'hotelverify-client',
  });
}

/**
 * Verify and decode a JWT token
 * @param {string} token
 * @returns {Object} decoded payload
 * @throws {JsonWebTokenError|TokenExpiredError}
 */
function verifyToken(token) {
  return jwt.verify(token, config.jwt.secret, {
    issuer: 'hotelverify',
    audience: 'hotelverify-client',
  });
}

module.exports = { signToken, verifyToken };
