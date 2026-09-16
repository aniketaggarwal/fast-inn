const { Router } = require("express");
const { asyncHandler } = require("../utils/asyncHandler");
const { requireServiceToken } = require("../middleware/requireServiceToken");
const repo = require("../repo");

const router = Router();

// version increments any time the list changes, so a verifier's 5-minute
// cache (Section 3d) can cheaply tell "nothing changed" from "go re-fetch"
// without comparing the whole array.
let version = 0;

router.get(
  "/revocations",
  asyncHandler(async (req, res) => {
    const revokedIds = await repo.listRevokedCredentialIds();
    res.json({ version, revokedIds });
  })
);

router.post(
  "/admin/revoke/:credId",
  requireServiceToken,
  asyncHandler(async (req, res) => {
    const { reason, actorId } = req.body || {};
    const credential = await repo.getCredential(req.params.credId);
    if (!credential) {
      return res.status(404).json({ error: "not_found" });
    }
    if (credential.revoked_at) {
      return res.status(409).json({ error: "already_revoked" });
    }

    const revoked = await repo.revokeCredential(req.params.credId, reason || null);
    version += 1;

    await repo.logAudit({
      actor: actorId || "unknown-admin",
      action: "credential_revoked",
      subjectId: req.params.credId,
      meta: { reason: reason || null },
    });

    res.json({ id: revoked.id, revokedAt: revoked.revoked_at, version });
  })
);

module.exports = router;
