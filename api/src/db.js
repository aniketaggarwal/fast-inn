const { Pool, types } = require("pg");

// pg's default DATE (OID 1082) parser returns a JS Date built at local
// midnight, which then serializes to JSON as a UTC timestamp on the
// *previous* day in any timezone ahead of UTC (e.g. 2026-09-17 becomes
// "2026-09-16T18:30:00.000Z" in IST). check_in/check_out are plain
// calendar dates with no time component, so keep them as the "YYYY-MM-DD"
// string Postgres already sends over the wire.
types.setTypeParser(1082, (value) => value);

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Runs fn inside a transaction with app.hotel_id set for the duration, so
// RLS policies on bookings/checkin_sessions/guest_register/consents (see
// api/migrations) enforce tenant isolation even if a query forgets its own
// WHERE hotel_id = $1 clause. set_config(..., true) scopes the setting to
// this transaction only (equivalent to SET LOCAL, but parameterizable).
async function withTenantTransaction(hotelId, fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.hotel_id', $1, true)", [hotelId]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// Guest-side counterpart: a guest's bookings span many hotels, so there's
// no single hotel_id to scope by. RLS on bookings (see the
// bookings-rls-guest-path migration) instead authorizes rows where
// guest_user_id matches app.guest_id.
async function withGuestTransaction(guestId, fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.guest_id', $1, true)", [guestId]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// Platform-admin counterpart: some admin routes (GET /admin/register)
// legitimately need to read across every tenant, which the hotel_id- and
// guest_id-scoped branches can never satisfy in one query. See the
// platform_admin branch added to every RLS policy in the
// 1735300000000_compliance migration — this is the only thing that sets
// that GUC, so it's impossible for a client-supplied value to reach it.
async function withPlatformAdminTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.platform_admin', 'true', true)");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, withTenantTransaction, withGuestTransaction, withPlatformAdminTransaction };
