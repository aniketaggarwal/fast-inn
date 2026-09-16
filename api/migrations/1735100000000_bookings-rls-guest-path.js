// The original bookings policy (migration 1735000000000) only recognized a
// single-tenant staff session via app.hotel_id — correct for "hotel A staff
// can't see hotel B's bookings", but it also silently blocked every guest
// query, since a guest's own bookings span many different hotels and no
// hotel_id is ever "theirs". Add a second branch keyed on app.guest_id so
// api/src/db.js's withGuestTransaction can authorize a guest to see/modify
// their own bookings regardless of which hotel they're at, while the
// hotel_id branch still fully gates the staff path.
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`DROP POLICY IF EXISTS tenant_isolation ON bookings`);
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
};

exports.down = (pgm) => {
  pgm.sql(`DROP POLICY IF EXISTS tenant_isolation ON bookings`);
  pgm.sql(`
    CREATE POLICY tenant_isolation ON bookings
    USING (hotel_id = current_setting('app.hotel_id', true)::uuid)
    WITH CHECK (hotel_id = current_setting('app.hotel_id', true)::uuid)
  `);
};
