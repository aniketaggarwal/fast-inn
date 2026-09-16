exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createExtension("pgcrypto", { ifNotExists: true });

  pgm.createTable("guests", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    phone_hash: { type: "text", notNull: true, unique: true },
    device_pubkey_jwk: { type: "jsonb" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  pgm.createType("kyc_status", ["PENDING", "AUTO_PASS", "NEEDS_REVIEW", "APPROVED", "REJECTED"]);

  pgm.createTable("kyc_submissions", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    guest_id: { type: "uuid", notNull: true, references: "guests", onDelete: "CASCADE" },
    doc_type: { type: "text", notNull: true },
    doc_object_key: { type: "text" },
    selfie_object_key: { type: "text" },
    ocr_json: { type: "jsonb" },
    ocr_confidence: { type: "numeric" },
    face_score: { type: "numeric" },
    status: { type: "kyc_status", notNull: true, default: "PENDING" },
    reviewer_id: { type: "uuid" },
    review_note: { type: "text" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    decided_at: { type: "timestamptz" },
  });
  pgm.createIndex("kyc_submissions", "guest_id");
  pgm.createIndex("kyc_submissions", "status");

  // Raw doc/selfie object keys are nulled and the S3 objects deleted once a
  // credential is issued (Section 9.6) — only doc_hash on credentials
  // survives, for duplicate detection.
  pgm.createTable("credentials", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    guest_id: { type: "uuid", notNull: true, references: "guests", onDelete: "CASCADE" },
    jwt: { type: "text", notNull: true },
    disclosures_json: { type: "jsonb", notNull: true },
    doc_hash: { type: "text", notNull: true },
    issued_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    expires_at: { type: "timestamptz", notNull: true },
    revoked_at: { type: "timestamptz" },
    revoke_reason: { type: "text" },
  });
  pgm.createIndex("credentials", "guest_id");
  pgm.createIndex("credentials", "doc_hash");

  pgm.createTable("issuer_audit", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    actor: { type: "text", notNull: true },
    action: { type: "text", notNull: true },
    subject_id: { type: "uuid" },
    meta_json: { type: "jsonb" },
    at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
};

exports.down = (pgm) => {
  pgm.dropTable("issuer_audit");
  pgm.dropTable("credentials");
  pgm.dropTable("kyc_submissions");
  pgm.dropType("kyc_status");
  pgm.dropTable("guests");
};
