const { SignJWT, jwtVerify } = require("jose");

const ACCESS_TTL = "15m";
const REFRESH_TTL = "7d";

function accessSecret() {
  return new TextEncoder().encode(process.env.JWT_ACCESS_SECRET);
}

function refreshSecret() {
  return new TextEncoder().encode(process.env.JWT_REFRESH_SECRET);
}

// Symmetric (HS256) app-session tokens. Distinct from the issuer's Ed25519
// credential-signing key introduced in Milestone 3 — that key proves a
// third party vouches for a guest's identity; this one just proves someone
// is logged in to HotelVerify.
async function signAccessToken({ sub, role, hotelId }) {
  return new SignJWT({ role, hotelId: hotelId || null })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TTL)
    .sign(accessSecret());
}

async function signRefreshToken({ sub }) {
  return new SignJWT({ type: "refresh" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime(REFRESH_TTL)
    .sign(refreshSecret());
}

async function verifyAccessToken(token) {
  const { payload } = await jwtVerify(token, accessSecret());
  return payload;
}

async function verifyRefreshToken(token) {
  const { payload } = await jwtVerify(token, refreshSecret());
  return payload;
}

module.exports = { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken };
