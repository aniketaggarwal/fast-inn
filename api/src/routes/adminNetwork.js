const { Router } = require("express");
const { requireAuth, requireRole } = require("../middleware/auth");
const { setSimulateOffline, isSimulatingOffline } = require("../services/issuerClient");

const router = Router();

// Section 3e's demo toggle: "add a demo toggle that simulates network
// loss." Flipping this makes the JWKS/revocation client skip its live
// fetch to the issuer and serve only what's already cached in Redis —
// showing check-in verification keep working with no network reachable,
// and making the honest tradeoff (stale revocations) something you can
// point at instead of just describe.
router.get(
  "/admin/network/offline",
  requireAuth,
  requireRole("PLATFORM_ADMIN"),
  (req, res) => {
    res.json({ offline: isSimulatingOffline() });
  }
);

router.post(
  "/admin/network/offline",
  requireAuth,
  requireRole("PLATFORM_ADMIN"),
  (req, res) => {
    const { offline } = req.body || {};
    setSimulateOffline(Boolean(offline));
    res.json({ offline: isSimulatingOffline() });
  }
);

module.exports = router;
