const rateLimit = require("express-rate-limit");

// Same shape as api/src/middleware/rateLimit.js — see its comment. Skipped
// under the test suite (vitest sets NODE_ENV=test).
const skip = () => process.env.NODE_ENV === "test";

const standardResponse = (req, res) => res.status(429).json({ error: "too_many_requests" });

const apiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  handler: standardResponse,
});

// KYC submission runs real OCR/face-match inference per call — worth a
// tighter limit than the global one independent of abuse concerns, since
// it's also the most expensive route in this service.
const kycLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  handler: standardResponse,
});

module.exports = { apiLimiter, kycLimiter };
