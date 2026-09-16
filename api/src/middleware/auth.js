const { verifyAccessToken } = require("../utils/jwt");

// Verifies the bearer access token and attaches req.user = { id, role, hotelId }.
// req.user.hotelId comes only from the token's own claims — never from
// anything the client sent in this request.
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "missing_token" });
  }

  try {
    const payload = await verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role, hotelId: payload.hotelId || null };
    next();
  } catch {
    return res.status(401).json({ error: "invalid_token" });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "forbidden" });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
