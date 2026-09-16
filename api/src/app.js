const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const healthRoutes = require("./routes/health");
const authRoutes = require("./routes/auth");
const hotelRoomsRoutes = require("./routes/hotelRooms");

function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  app.use(healthRoutes);
  app.use(authRoutes);
  app.use(hotelRoomsRoutes);

  // Milestone 2+ will add: /hotels, /bookings, /checkin, /compliance, /admin.

  app.use((req, res) => {
    res.status(404).json({ error: "not_found" });
  });

  // Centralized error handler so route handlers can stay free of try/catch
  // boilerplate for anything that isn't an expected 4xx.
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  });

  return app;
}

module.exports = { createApp };
