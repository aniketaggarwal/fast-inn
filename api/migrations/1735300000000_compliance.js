// Milestone 7 (compliance) needs two RLS changes on top of
// 1735200000000_rls-nullif-empty-guc's NULLIF-safe policies:
//
// 1. consents needs the same guest_id branch bookings already has
//    (1735100000000) — a guest's own consent history spans many hotels,
//    so GET /consents/mine can't be authorized by a single hotel_id.
//
// 2. All four RLS tables need a platform-admin branch. FORCE ROW LEVEL
//    SECURITY (deliberately, Section 7) means even the owning role can't
//    read across tenants — which is exactly what a PLATFORM_ADMIN route
//    (GET /admin/register, and any future one) legitimately needs to do.
//    Without this branch, api/src/routes/admin.js's cross-hotel queries
//    would silently return zero rows for every hotel, not "empty because
//    no data" but "empty because RLS filtered everything" — a real bug
//    caught by this migration's own test (compliance.test.js's "reads
//    across hotels" case failed before this branch existed). The branch
//    is a session-scoped GUC (app.platform_admin) set only inside
//    withPlatformAdminTransaction (api/src/db.js), never something a
//    client request can set itself.
exports.shorthands = undefined;

const TABLES = {
  bookings: `
    NULLIF(current_setting('app.hotel_id', true), '')::uuid = hotel_id
    OR NULLIF(current_setting('app.guest_id', true), '')::uuid = guest_user_id
    OR current_setting('app.platform_admin', true) = 'true'
  `,
  checkin_sessions: `
    NULLIF(current_setting('app.hotel_id', true), '')::uuid = hotel_id
    OR current_setting('app.platform_admin', true) = 'true'
  `,
  guest_register: `
    NULLIF(current_setting('app.hotel_id', true), '')::uuid = hotel_id
    OR current_setting('app.platform_admin', true) = 'true'
  `,
  consents: `
    NULLIF(current_setting('app.hotel_id', true), '')::uuid = hotel_id
    OR NULLIF(current_setting('app.guest_id', true), '')::uuid = guest_user_id
    OR current_setting('app.platform_admin', true) = 'true'
  `,
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

  pgm.addColumn("users", {
    deleted_at: { type: "timestamptz" },
  });
};

exports.down = (pgm) => {
  pgm.dropColumn("users", "deleted_at");

  for (const table of Object.keys(TABLES)) {
    pgm.sql(`DROP POLICY IF EXISTS tenant_isolation ON ${table}`);
  }
  pgm.sql(`
    CREATE POLICY tenant_isolation ON bookings
    USING (
      NULLIF(current_setting('app.hotel_id', true), '')::uuid = hotel_id
      OR NULLIF(current_setting('app.guest_id', true), '')::uuid = guest_user_id
    )
    WITH CHECK (
      NULLIF(current_setting('app.hotel_id', true), '')::uuid = hotel_id
      OR NULLIF(current_setting('app.guest_id', true), '')::uuid = guest_user_id
    )
  `);
  for (const table of ["checkin_sessions", "guest_register", "consents"]) {
    pgm.sql(`
      CREATE POLICY tenant_isolation ON ${table}
      USING (NULLIF(current_setting('app.hotel_id', true), '')::uuid = hotel_id)
      WITH CHECK (NULLIF(current_setting('app.hotel_id', true), '')::uuid = hotel_id)
    `);
  }
};
