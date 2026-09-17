const { Router } = require("express");
const { pool, withPlatformAdminTransaction } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { asyncHandler } = require("../utils/asyncHandler");

const router = Router();

// hotels and audit_log carry no RLS at all (see the RLS_TABLES list in
// migrations), so plain pool queries are fine for those two. guest_register
// does have FORCE RLS, so reading it across every hotel needs
// withPlatformAdminTransaction's app.platform_admin branch — a plain
// pool.query would silently come back empty for every hotel, not error.
router.get(
  "/admin/hotels",
  requireAuth,
  requireRole("PLATFORM_ADMIN"),
  asyncHandler(async (req, res) => {
    const result = await pool.query("SELECT id, name, city, status, created_at FROM hotels ORDER BY name");
    res.json({ hotels: result.rows });
  })
);

router.get(
  "/admin/audit",
  requireAuth,
  requireRole("PLATFORM_ADMIN"),
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const result = await pool.query(
      `SELECT a.id, a.actor_user_id, a.actor_role, a.hotel_id, h.name AS hotel_name,
              a.action, a.entity, a.entity_id, a.meta_json, a.at
       FROM audit_log a
       LEFT JOIN hotels h ON h.id = a.hotel_id
       ORDER BY a.at DESC
       LIMIT $1`,
      [limit]
    );
    res.json({ entries: result.rows });
  })
);

// Cross-hotel register view, purely so a platform admin has somewhere to
// find a credential_id to revoke from (Section 10's Milestone 7 done-when:
// "Revoke a credential -> next check-in fails with a clear reason" needs a
// discoverable UI path to that revoke call, not just the raw endpoint).
router.get(
  "/admin/register",
  requireAuth,
  requireRole("PLATFORM_ADMIN"),
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const rows = await withPlatformAdminTransaction(async (client) => {
      const result = await client.query(
        `SELECT g.id, g.full_name, g.id_type, g.id_last4, g.nationality,
                g.arrival_at, g.departure_at, g.credential_id, h.name AS hotel_name
         FROM guest_register g
         JOIN hotels h ON h.id = g.hotel_id
         ORDER BY g.arrival_at DESC
         LIMIT $1`,
        [limit]
      );
      return result.rows;
    });
    res.json({ entries: rows });
  })
);

module.exports = router;
