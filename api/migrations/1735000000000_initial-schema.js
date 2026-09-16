exports.shorthands = undefined;

const RLS_TABLES = ["bookings", "checkin_sessions", "guest_register", "consents"];

exports.up = (pgm) => {
  pgm.createExtension("pgcrypto", { ifNotExists: true });

  pgm.createType("user_role", ["GUEST", "HOTEL_STAFF", "HOTEL_ADMIN", "PLATFORM_ADMIN"]);
  pgm.createType("booking_status", ["RESERVED", "CHECKED_IN", "CHECKED_OUT", "CANCELLED", "NO_SHOW"]);

  pgm.createTable("hotels", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    name: { type: "text", notNull: true },
    city: { type: "text", notNull: true },
    address: { type: "text" },
    gstin: { type: "text" },
    status: { type: "text", notNull: true, default: "ACTIVE" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  pgm.createTable("users", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    email: { type: "text", notNull: true, unique: true },
    password_hash: { type: "text", notNull: true },
    role: { type: "user_role", notNull: true },
    hotel_id: { type: "uuid", references: "hotels", onDelete: "CASCADE" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("users", "hotel_id");
  // Staff/admin accounts belong to exactly one hotel; guest/platform-admin
  // accounts belong to none. Catches the "hotel_id from request body" bug
  // class one level earlier, at the schema.
  pgm.addConstraint("users", "users_hotel_role_chk", {
    check:
      "(role IN ('HOTEL_STAFF','HOTEL_ADMIN') AND hotel_id IS NOT NULL) OR (role IN ('GUEST','PLATFORM_ADMIN') AND hotel_id IS NULL)",
  });

  pgm.createTable("rooms", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    hotel_id: { type: "uuid", notNull: true, references: "hotels", onDelete: "CASCADE" },
    room_number: { type: "text", notNull: true },
    room_type: { type: "text", notNull: true },
    base_price: { type: "numeric(10,2)", notNull: true },
  });
  pgm.createIndex("rooms", "hotel_id");
  pgm.addConstraint("rooms", "rooms_hotel_number_unique", { unique: ["hotel_id", "room_number"] });

  // PK (room_id, stay_date) makes double-booking structurally impossible:
  // the second concurrent insert for the same room+night fails at the
  // database, no application-level locking required (Section 9.5).
  pgm.createTable("room_availability", {
    room_id: { type: "uuid", notNull: true, references: "rooms", onDelete: "CASCADE" },
    stay_date: { type: "date", notNull: true },
    booking_id: { type: "uuid" },
  });
  pgm.addConstraint("room_availability", "room_availability_pk", { primaryKey: ["room_id", "stay_date"] });

  pgm.createTable("bookings", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    hotel_id: { type: "uuid", notNull: true, references: "hotels", onDelete: "CASCADE" },
    room_id: { type: "uuid", notNull: true, references: "rooms", onDelete: "CASCADE" },
    guest_user_id: { type: "uuid", notNull: true, references: "users", onDelete: "CASCADE" },
    check_in: { type: "date", notNull: true },
    check_out: { type: "date", notNull: true },
    status: { type: "booking_status", notNull: true, default: "RESERVED" },
    total_amount: { type: "numeric(10,2)", notNull: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("bookings", "hotel_id");
  pgm.createIndex("bookings", "guest_user_id");

  pgm.addConstraint("room_availability", "room_availability_booking_fk", {
    foreignKeys: { columns: "booking_id", references: "bookings(id)", onDelete: "SET NULL" },
  });

  pgm.createTable("checkin_sessions", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    booking_id: { type: "uuid", notNull: true, references: "bookings", onDelete: "CASCADE" },
    hotel_id: { type: "uuid", notNull: true, references: "hotels", onDelete: "CASCADE" },
    nonce: { type: "text", notNull: true, unique: true },
    status: { type: "text", notNull: true, default: "PENDING" },
    expires_at: { type: "timestamptz", notNull: true },
    verified_claims_json: { type: "jsonb" },
    verified_at: { type: "timestamptz" },
  });
  pgm.createIndex("checkin_sessions", "hotel_id");

  pgm.createTable("guest_register", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    hotel_id: { type: "uuid", notNull: true, references: "hotels", onDelete: "CASCADE" },
    booking_id: { type: "uuid", notNull: true, references: "bookings", onDelete: "CASCADE" },
    full_name: { type: "text", notNull: true },
    id_type: { type: "text", notNull: true },
    id_last4: { type: "text", notNull: true },
    nationality: { type: "text", notNull: true },
    arrival_at: { type: "timestamptz" },
    departure_at: { type: "timestamptz" },
    credential_id: { type: "uuid" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("guest_register", "hotel_id");

  pgm.createTable("form_c_records", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    guest_register_id: { type: "uuid", notNull: true, references: "guest_register", onDelete: "CASCADE" },
    passport_no_last4: { type: "text" },
    visa_type: { type: "text" },
    arrival_from: { type: "text" },
    generated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    exported_at: { type: "timestamptz" },
  });

  pgm.createTable("consents", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    guest_user_id: { type: "uuid", notNull: true, references: "users", onDelete: "CASCADE" },
    hotel_id: { type: "uuid", notNull: true, references: "hotels", onDelete: "CASCADE" },
    booking_id: { type: "uuid", references: "bookings", onDelete: "CASCADE" },
    claims_disclosed_json: { type: "jsonb", notNull: true },
    purpose: { type: "text", notNull: true },
    granted_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    expires_at: { type: "timestamptz" },
    withdrawn_at: { type: "timestamptz" },
  });
  pgm.createIndex("consents", "hotel_id");

  // Append-only: the app's DB role gets INSERT/SELECT here, never
  // UPDATE/DELETE (Section 5). Grant is applied in a follow-up migration
  // once a dedicated non-owner app role exists; noted as a known gap in
  // PROGRESS.md for now since the dev role is the table owner.
  pgm.createTable("audit_log", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    actor_user_id: { type: "uuid" },
    actor_role: { type: "text" },
    hotel_id: { type: "uuid" },
    action: { type: "text", notNull: true },
    entity: { type: "text", notNull: true },
    entity_id: { type: "uuid" },
    meta_json: { type: "jsonb" },
    ip: { type: "text" },
    at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("audit_log", "hotel_id");

  // Defence in depth (Section 7): even if a route forgets its WHERE
  // hotel_id = $1 clause, RLS blocks cross-tenant rows at the database.
  // FORCE is required because in this dev setup the app connects as the
  // table owner, who bypasses RLS by default.
  for (const table of RLS_TABLES) {
    pgm.sql(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    pgm.sql(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
    pgm.sql(`
      CREATE POLICY tenant_isolation ON ${table}
      USING (hotel_id = current_setting('app.hotel_id', true)::uuid)
      WITH CHECK (hotel_id = current_setting('app.hotel_id', true)::uuid)
    `);
  }
};

exports.down = (pgm) => {
  for (const table of RLS_TABLES) {
    pgm.sql(`DROP POLICY IF EXISTS tenant_isolation ON ${table}`);
  }
  pgm.dropTable("audit_log");
  pgm.dropTable("consents");
  pgm.dropTable("form_c_records");
  pgm.dropTable("guest_register");
  pgm.dropTable("checkin_sessions");
  pgm.dropConstraint("room_availability", "room_availability_booking_fk");
  pgm.dropTable("bookings");
  pgm.dropTable("room_availability");
  pgm.dropTable("rooms");
  pgm.dropTable("users");
  pgm.dropTable("hotels");
  pgm.dropType("booking_status");
  pgm.dropType("user_role");
};
