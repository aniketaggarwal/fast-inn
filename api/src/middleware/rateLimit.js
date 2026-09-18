const rateLimit = require("express-rate-limit");

// Section 10's Milestone 8 explicitly calls for rate limits. Skipped
// entirely under the test suite (vitest sets NODE_ENV=test) — the test
// files legitimately call /auth/login and similar routes dozens of times
// per run across fresh users, which isn't the abuse pattern these limits
// exist to catch.
const skip = () => process.env.NODE_ENV === "test";

const standardResponse = (req, res) => res.status(429).json({ error: "too_many_requests" });

// Generous, applied to every route — a backstop against a runaway
// client/script, not meant to bother normal browsing. Sized with headroom
// for a real SPA session: React StrictMode double-invokes effects in dev,
// and a single page view can fire several requests at once (hotel list +
// availability + rooms, etc.) — a tight per-minute budget here trips on
// completely normal use, not just abuse.
const apiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  handler: standardResponse,
});

// Login/register: the classic credential-stuffing / enumeration target.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  handler: standardResponse,
});

// Check-in presentation is public (Section 4 — no api JWT on this path at
// all) and security-critical (Section 9.4's replay defence lives here) —
// worth its own tighter limit independent of the global one.
const presentationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  handler: standardResponse,
});

module.exports = { apiLimiter, authLimiter, presentationLimiter };
