// npm run purge-retention — Section 8's DPDP retention job: "nightly job
// purges verified_claims_json and selfies N days after checkout;
// configurable, default 90 days."
//
// Selfies/ID documents are already deleted from storage immediately after
// a credential is issued (issuer/src/pipeline/issue.js, Milestone 4) —
// stricter than the 90-day allowance, so there's nothing left there for
// this job to purge. The one thing that *does* sit around in app_db after
// checkout is checkin_sessions.verified_claims_json (the disclosed-claims
// snapshot written at check-in, Milestone 5) — that's what this purges,
// anchored on guest_register.departure_at (set by the checkout action in
// api/src/routes/hotelBookings.js).
//
// Not wired to an actual cron/systemd timer in this dev setup — run by
// hand, or add `0 3 * * * cd /path/to/repo && npm run purge-retention` to
// a real deployment's crontab. Idempotent: rerunning after a purge finds
// nothing left to do.
require("dotenv").config({ path: "api/.env" });
const { Pool } = require("pg");

const RETENTION_DAYS = Number(process.env.RETENTION_DAYS) || 90;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://hotelverify:hotelverify@localhost:5432/hotelverify_app",
});

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // checkin_sessions and guest_register both have FORCE ROW LEVEL
    // SECURITY (Section 7) — with no app.hotel_id/app.guest_id/
    // app.platform_admin GUC set, every policy branch is false and this
    // job's own queries would silently touch zero rows, "succeeding" at
    // nothing rather than erroring. Found by actually running this script
    // against a fixture row and seeing 0 purged when it should have been
    // 1, not by inspection. app.platform_admin is the same bypass
    // api/src/db.js's withPlatformAdminTransaction uses for cross-tenant
    // admin reads — this job is exactly that kind of cross-tenant
    // operation, just from a script instead of an HTTP route.
    await client.query("SELECT set_config('app.platform_admin', 'true', true)");

    const purged = await client.query(
      `UPDATE checkin_sessions
       SET verified_claims_json = NULL
       WHERE verified_claims_json IS NOT NULL
         AND booking_id IN (
           SELECT booking_id FROM guest_register
           WHERE departure_at IS NOT NULL
             AND departure_at < now() - ($1 || ' days')::interval
         )
       RETURNING id`,
      [RETENTION_DAYS]
    );

    if (purged.rowCount > 0) {
      await client.query(
        `INSERT INTO audit_log (action, entity, meta_json)
         VALUES ('retention_purge', 'checkin_sessions', $1)`,
        [JSON.stringify({ purgedCount: purged.rowCount, retentionDays: RETENTION_DAYS })]
      );
    }

    await client.query("COMMIT");
    console.log(`Retention purge (>${RETENTION_DAYS} days post-checkout): cleared verified_claims_json on ${purged.rowCount} check-in session(s).`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
