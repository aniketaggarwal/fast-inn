// Postgres gotcha: once a custom GUC placeholder like app.hotel_id or
// app.guest_id has been SET at least once on a physical connection (even
// transaction-locally), current_setting(name, true) stops returning NULL
// when unset on a *later* transaction on that same pooled connection — it
// returns '' instead, because the placeholder now has a known (empty)
// default. Casting ''::uuid then throws 22P02 and the whole query 500s,
// which only shows up once connections are actually reused across
// requests that set different GUCs (surfaced by the Milestone 2 booking
// routes). NULLIF(..., '') turns that '' back into a real NULL before the
// cast, so an unset GUC correctly fails the policy instead of erroring.
exports.shorthands = undefined;

const TABLES = {
  bookings: `
    NULLIF(current_setting('app.hotel_id', true), '')::uuid = hotel_id
    OR NULLIF(current_setting('app.guest_id', true), '')::uuid = guest_user_id
  `,
  checkin_sessions: `NULLIF(current_setting('app.hotel_id', true), '')::uuid = hotel_id`,
  guest_register: `NULLIF(current_setting('app.hotel_id', true), '')::uuid = hotel_id`,
  consents: `NULLIF(current_setting('app.hotel_id', true), '')::uuid = hotel_id`,
};

exports.up = (pgm) => {
  for (const [table, condition] of Object.entries(TABLES)) {
    pgm.sql(`DROP POLICY IF EXISTS tenant_isolation ON ${table}`);
    pgm.sql(`
      CREATE POLICY tenant_isolation ON ${table}
      USING (${condition})
      WITH CHECK (${condition})
    `);
  }
};

exports.down = (pgm) => {
  for (const table of Object.keys(TABLES)) {
    pgm.sql(`DROP POLICY IF EXISTS tenant_isolation ON ${table}`);
  }
  pgm.sql(`
    CREATE POLICY tenant_isolation ON bookings
    USING (
      hotel_id = current_setting('app.hotel_id', true)::uuid
      OR guest_user_id = current_setting('app.guest_id', true)::uuid
    )
    WITH CHECK (
      hotel_id = current_setting('app.hotel_id', true)::uuid
      OR guest_user_id = current_setting('app.guest_id', true)::uuid
    )
  `);
  for (const table of ["checkin_sessions", "guest_register", "consents"]) {
    pgm.sql(`
      CREATE POLICY tenant_isolation ON ${table}
      USING (hotel_id = current_setting('app.hotel_id', true)::uuid)
      WITH CHECK (hotel_id = current_setting('app.hotel_id', true)::uuid)
    `);
  }
};
