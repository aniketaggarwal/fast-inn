const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { apiLimiter } = require("./middleware/rateLimit");
const healthRoutes = require("./routes/health");
const kycRoutes = require("./routes/kyc");
const reviewRoutes = require("./routes/review");
const jwksRoutes = require("./routes/jwks");
const revocationRoutes = require("./routes/revocation");
const livenessRoutes = require("./routes/liveness");

function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors());
  // Default 100kb is fine for every other route here, but the liveness
  // check's multiple base64-encoded camera frames (Section 9.3) don't fit
  // in it.
  app.use(express.json({ limit: "5mb" }));
  app.use(apiLimiter);

  app.use(healthRoutes);
  app.use(kycRoutes);
  app.use(reviewRoutes);
  app.use(jwksRoutes);
  app.use(revocationRoutes);
  app.use(livenessRoutes);

  app.use((req, res) => {
    res.status(404).json({ error: "not_found" });
  });

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  });

  return app;
}

module.exports = { createApp };
