const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const healthRoutes = require("./routes/health");

function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  app.use(healthRoutes);

  // Milestone 3+ will add: /kyc, /review, /credentials, /.well-known/jwks.json, /revocations.

  app.use((req, res) => {
    res.status(404).json({ error: "not_found" });
  });

  return app;
}

module.exports = { createApp };
