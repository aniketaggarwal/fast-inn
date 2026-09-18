const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { apiLimiter } = require("./middleware/rateLimit");
const healthRoutes = require("./routes/health");
const authRoutes = require("./routes/auth");
const hotelRoomsRoutes = require("./routes/hotelRooms");
const hotelsRoutes = require("./routes/hotels");
const bookingsRoutes = require("./routes/bookings");
const hotelBookingsRoutes = require("./routes/hotelBookings");
const issuerReviewRoutes = require("./routes/issuerReview");
const checkinRoutes = require("./routes/checkin");
const adminNetworkRoutes = require("./routes/adminNetwork");
const hotelRegisterRoutes = require("./routes/hotelRegister");
const myDataRoutes = require("./routes/myData");
const adminRoutes = require("./routes/admin");

function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(apiLimiter);

  app.use(healthRoutes);
  app.use(authRoutes);
  app.use(hotelRoomsRoutes);
  app.use(hotelsRoutes);
  app.use(bookingsRoutes);
  app.use(hotelBookingsRoutes);
  app.use(issuerReviewRoutes);
  app.use(checkinRoutes);
  app.use(adminNetworkRoutes);
  app.use(hotelRegisterRoutes);
  app.use(myDataRoutes);
  app.use(adminRoutes);

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
