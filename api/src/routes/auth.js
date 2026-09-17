const { Router } = require("express");
const { pool } = require("../db");
const { hashPassword, verifyPassword } = require("../utils/password");
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require("../utils/jwt");
const { asyncHandler } = require("../utils/asyncHandler");

const router = Router();

function publicUser(row) {
  return { id: row.id, email: row.email, role: row.role, hotelId: row.hotel_id };
}

async function issueTokens(user) {
  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken({ sub: user.id, role: user.role, hotelId: user.hotel_id }),
    signRefreshToken({ sub: user.id }),
  ]);
  return { accessToken, refreshToken };
}

// Public self-registration always creates a GUEST account. Staff and admin
// accounts are provisioned out-of-band (scripts/seed.js for now; an admin
// "onboard hotel" flow in a later milestone) — a hotel doesn't get to grant
// itself HOTEL_ADMIN by POSTing a role field.
router.post("/auth/register", asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== "string" || typeof password !== "string" || password.length < 8) {
    return res.status(400).json({ error: "invalid_input" });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existing = await pool.query("SELECT id FROM users WHERE email = $1", [normalizedEmail]);
  if (existing.rowCount > 0) {
    return res.status(409).json({ error: "email_taken" });
  }

  const passwordHash = await hashPassword(password);
  const result = await pool.query(
    `INSERT INTO users (email, password_hash, role, hotel_id)
     VALUES ($1, $2, 'GUEST', NULL)
     RETURNING id, email, role, hotel_id`,
    [normalizedEmail, passwordHash]
  );
  const user = result.rows[0];
  const tokens = await issueTokens(user);
  res.status(201).json({ user: publicUser(user), ...tokens });
}));

router.post("/auth/login", asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "invalid_input" });
  }

  const result = await pool.query(
    "SELECT id, email, password_hash, role, hotel_id FROM users WHERE email = $1 AND deleted_at IS NULL",
    [email.trim().toLowerCase()]
  );
  const user = result.rows[0];
  // Same generic error whether the email doesn't exist or the password is
  // wrong — don't let login responses double as an email-enumeration oracle.
  if (!user || !(await verifyPassword(user.password_hash, password))) {
    return res.status(401).json({ error: "invalid_credentials" });
  }

  const tokens = await issueTokens(user);
  res.json({ user: publicUser(user), ...tokens });
}));

router.post("/auth/refresh", asyncHandler(async (req, res) => {
  const { refreshToken } = req.body || {};
  if (typeof refreshToken !== "string") {
    return res.status(400).json({ error: "invalid_input" });
  }

  let payload;
  try {
    payload = await verifyRefreshToken(refreshToken);
  } catch {
    return res.status(401).json({ error: "invalid_refresh_token" });
  }

  const result = await pool.query("SELECT id, email, role, hotel_id FROM users WHERE id = $1 AND deleted_at IS NULL", [payload.sub]);
  const user = result.rows[0];
  if (!user) {
    return res.status(401).json({ error: "invalid_refresh_token" });
  }

  const accessToken = await signAccessToken({ sub: user.id, role: user.role, hotelId: user.hotel_id });
  res.json({ accessToken });
}));

module.exports = router;
