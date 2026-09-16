const { Pool } = require("pg");

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

module.exports = { pool, withTenantTransaction };
