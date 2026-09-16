const { Router } = require("express");
const { getJWKS } = require("../keys");

const router = Router();

// Public, cacheable — this is what lets a hotel desk verify a credential
// with no network round-trip to the issuer at presentation time (Section
// 3e), once it has this response cached.
router.get("/.well-known/jwks.json", (req, res) => {
  res.json(getJWKS());
});

module.exports = router;
