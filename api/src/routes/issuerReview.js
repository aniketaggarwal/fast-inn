const { Router } = require("express");
const { requireAuth, requireRole } = require("../middleware/auth");
const { asyncHandler } = require("../utils/asyncHandler");

const router = Router();

const ISSUER_BASE_URL = process.env.ISSUER_BASE_URL || "http://localhost:4001";

// The browser never sees ISSUER_SERVICE_TOKEN or talks to the issuer's
// staff-only routes directly. api checks the caller is a logged-in
// PLATFORM_ADMIN (its own JWT auth), then attaches the shared secret
// itself and forwards the real admin's user id so the issuer's audit
// trail records who actually made the call — see
// issuer/src/middleware/requireServiceToken.js for the other half of
// this design.
async function forwardToIssuer(path, { method = "GET", body } = {}) {
  const res = await fetch(`${ISSUER_BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Issuer-Service-Token": process.env.ISSUER_SERVICE_TOKEN,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

router.get(
  "/issuer/review",
  requireAuth,
  requireRole("PLATFORM_ADMIN"),
  asyncHandler(async (req, res) => {
    const { status, data } = await forwardToIssuer("/review");
    res.status(status).json(data);
  })
);

router.post(
  "/issuer/review/:id/decide",
  requireAuth,
  requireRole("PLATFORM_ADMIN"),
  asyncHandler(async (req, res) => {
    const { status, data } = await forwardToIssuer(`/review/${req.params.id}/decide`, {
      method: "POST",
      body: { ...req.body, reviewerId: req.user.id },
    });
    res.status(status).json(data);
  })
);

router.post(
  "/issuer/admin/revoke/:credId",
  requireAuth,
  requireRole("PLATFORM_ADMIN"),
  asyncHandler(async (req, res) => {
    const { status, data } = await forwardToIssuer(`/admin/revoke/${req.params.credId}`, {
      method: "POST",
      body: { ...req.body, actorId: req.user.id },
    });
    res.status(status).json(data);
  })
);

module.exports = router;
