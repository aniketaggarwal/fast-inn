const { Router } = require("express");
const { pool } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { asyncHandler } = require("../utils/asyncHandler");
const { logAudit } = require("../repo/audit");

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
    // Mirrored into api's own audit_log (the issuer keeps its own
    // issuer_audit for the same event) so a platform admin reviewing
    // /admin/audit sees revocations alongside check-ins and account
    // deletions in one place, rather than needing to check two systems.
    // Best-effort: the revoke itself already succeeded upstream by this
    // point, so a logging hiccup (or, as this route's own test caught, a
    // credId that isn't UUID-shaped violating entity_id's column type)
    // shouldn't turn a successful revoke into a 500 for the caller.
    if (status < 300) {
      try {
        await logAudit(pool, {
          actorUserId: req.user.id,
          actorRole: req.user.role,
          action: "credential_revoked",
          entity: "credential",
          entityId: req.params.credId,
          meta: { reason: req.body?.reason || null },
        });
      } catch (err) {
        console.error("failed to write credential_revoked audit entry:", err);
      }
    }
    res.status(status).json(data);
  })
);

module.exports = router;
