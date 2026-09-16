// issuer_db has no users/roles table of its own (Section 5) — KYC review
// here is done by one small ops team, not multi-tenant hotel staff, so a
// full parallel auth system would be inventing schema the spec doesn't
// ask for. Staff-only issuer routes (/review, /admin/revoke) are instead
// reached only through api's proxy (api/src/routes/issuerReview.js),
// which checks the caller is a logged-in PLATFORM_ADMIN and then attaches
// this shared secret — the browser never sees or sends it directly.
function requireServiceToken(req, res, next) {
  const header = req.headers["x-issuer-service-token"];
  if (!header || header !== process.env.ISSUER_SERVICE_TOKEN) {
    return res.status(401).json({ error: "invalid_service_token" });
  }
  next();
}

module.exports = { requireServiceToken };
