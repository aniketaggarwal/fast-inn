const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const healthRoutes = require("./routes/health");
const kycRoutes = require("./routes/kyc");
const reviewRoutes = require("./routes/review");
const jwksRoutes = require("./routes/jwks");
const revocationRoutes = require("./routes/revocation");

function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  app.use(healthRoutes);
  app.use(kycRoutes);
  app.use(reviewRoutes);
  app.use(jwksRoutes);
  app.use(revocationRoutes);

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
