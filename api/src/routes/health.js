const { Router } = require("express");
const { pool } = require("../db");

const router = Router();

router.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", service: "api", db: true });
  } catch (err) {
    res.status(503).json({ status: "error", service: "api", db: false, error: err.message });
  }
});

module.exports = router;
