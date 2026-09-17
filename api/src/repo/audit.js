// audit_log has no RLS (see api/migrations' RLS_TABLES list) — it's
// meant to be a single cross-tenant append-only trail a platform admin
// can review, not something scoped per hotel session. The app's DB role
// is still the table owner in this dev setup rather than a role with
// INSERT/SELECT-only grants (Section 5's "grant INSERT/SELECT, never
// UPDATE/DELETE" isn't wired up yet) — a known gap, noted in PROGRESS.md
// rather than quietly left unmentioned.
//
// `client` can be the shared pool or a transaction client — both expose
// the same `.query()` — so a caller already inside a withTenantTransaction
// can log in the same transaction instead of a separate round trip.
async function logAudit(client, { actorUserId = null, actorRole = null, hotelId = null, action, entity, entityId = null, meta = null, ip = null }) {
  await client.query(
    `INSERT INTO audit_log (actor_user_id, actor_role, hotel_id, action, entity, entity_id, meta_json, ip)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [actorUserId, actorRole, hotelId, action, entity, entityId, meta ? JSON.stringify(meta) : null, ip]
  );
}

module.exports = { logAudit };
