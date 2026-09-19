const { Router } = require("express");
const { pool } = require("../db");

const router = Router();

// Demo mode only: lets the login page offer tap-to-fill accounts without the
// password being baked into the web bundle.
function demoInfo() {
  const demo = process.env.DEMO_MODE === "true";
  return demo ? { demo, demoPassword: process.env.DEMO_PASSWORD || "Password123!" } : { demo };
}

router.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", service: "api", db: true, ...demoInfo() });
  } catch (err) {
    res.status(503).json({ status: "error", service: "api", db: false, error: err.message });
  }
});

module.exports = router;
