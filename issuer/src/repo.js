const crypto = require("crypto");
const { pool } = require("./db");

function hashPhone(phone) {
  return crypto.createHash("sha256").update(phone).digest("hex");
}

function hashBuffer(buffer) {
  return "sha256:" + crypto.createHash("sha256").update(buffer).digest("hex");
}

async function findOrCreateGuest(phone) {
  const phoneHash = hashPhone(phone);
  const existing = await pool.query("SELECT id, phone_hash FROM guests WHERE phone_hash = $1", [phoneHash]);
  if (existing.rowCount > 0) return existing.rows[0];

  const created = await pool.query(
    "INSERT INTO guests (phone_hash) VALUES ($1) RETURNING id, phone_hash",
    [phoneHash]
  );
  return created.rows[0];
}

async function createKycSubmission({ guestId, docType }) {
  const result = await pool.query(
    `INSERT INTO kyc_submissions (guest_id, doc_type, status)
     VALUES ($1, $2, 'PENDING')
     RETURNING id, guest_id, doc_type, status, created_at`,
    [guestId, docType]
  );
  return result.rows[0];
}

async function setSubmissionObjectKeys(id, { docObjectKey, selfieObjectKey }) {
  await pool.query(
    "UPDATE kyc_submissions SET doc_object_key = $2, selfie_object_key = $3 WHERE id = $1",
    [id, docObjectKey, selfieObjectKey]
  );
}

async function recordExtractionResult(id, { ocrJson, ocrConfidence, faceScore, status }) {
  const result = await pool.query(
    `UPDATE kyc_submissions
     SET ocr_json = $2, ocr_confidence = $3, face_score = $4, status = $5
     WHERE id = $1
     RETURNING id, guest_id, doc_type, status, ocr_json, ocr_confidence`,
    [id, ocrJson, ocrConfidence, faceScore, status]
  );
  return result.rows[0];
}

// Clears the object keys once the underlying S3 objects are deleted — the
// row itself is kept (audit trail), but nothing on it points at storage
// that no longer holds anything (Section 9.6).
async function clearSubmissionObjectKeys(id) {
  await pool.query(
    "UPDATE kyc_submissions SET doc_object_key = NULL, selfie_object_key = NULL WHERE id = $1",
    [id]
  );
}

async function decideSubmission(id, { status, reviewerId, reviewNote }) {
  const result = await pool.query(
    `UPDATE kyc_submissions
     SET status = $2, reviewer_id = $3, review_note = $4, decided_at = now()
     WHERE id = $1
     RETURNING id, guest_id, doc_type, status, ocr_json`,
    [id, status, reviewerId, reviewNote]
  );
  return result.rows[0];
}

async function getSubmission(id) {
  const result = await pool.query("SELECT * FROM kyc_submissions WHERE id = $1", [id]);
  return result.rows[0] || null;
}

async function listSubmissionsByStatus(status) {
  const result = await pool.query(
    "SELECT * FROM kyc_submissions WHERE status = $1 ORDER BY created_at ASC",
    [status]
  );
  return result.rows;
}

async function insertCredential({ guestId, jwt, disclosures, docHash, expiresAt }) {
  const result = await pool.query(
    `INSERT INTO credentials (guest_id, jwt, disclosures_json, doc_hash, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, guest_id, jwt, disclosures_json, doc_hash, issued_at, expires_at`,
    [guestId, jwt, JSON.stringify(disclosures), docHash, expiresAt]
  );
  return result.rows[0];
}

async function getCredential(id) {
  const result = await pool.query("SELECT * FROM credentials WHERE id = $1", [id]);
  return result.rows[0] || null;
}

// kyc_submissions has no credential_id column (Section 5's schema doesn't
// give it one) — the most recently issued credential for this submission's
// guest is a reasonable proxy for "the credential this submission
// produced", true as long as a guest isn't re-verifying concurrently.
async function getLatestCredentialForGuest(guestId) {
  const result = await pool.query(
    "SELECT * FROM credentials WHERE guest_id = $1 ORDER BY issued_at DESC LIMIT 1",
    [guestId]
  );
  return result.rows[0] || null;
}

async function findCredentialByDocHash(docHash) {
  const result = await pool.query(
    "SELECT id, guest_id FROM credentials WHERE doc_hash = $1 AND revoked_at IS NULL",
    [docHash]
  );
  return result.rows[0] || null;
}

async function revokeCredential(id, reason) {
  const result = await pool.query(
    "UPDATE credentials SET revoked_at = now(), revoke_reason = $2 WHERE id = $1 RETURNING id, revoked_at",
    [id, reason]
  );
  return result.rows[0] || null;
}

async function listRevokedCredentialIds() {
  const result = await pool.query("SELECT id FROM credentials WHERE revoked_at IS NOT NULL");
  return result.rows.map((r) => r.id);
}

async function logAudit({ actor, action, subjectId, meta }) {
  await pool.query(
    "INSERT INTO issuer_audit (actor, action, subject_id, meta_json) VALUES ($1, $2, $3, $4)",
    [actor, action, subjectId || null, meta ? JSON.stringify(meta) : null]
  );
}

module.exports = {
  hashPhone,
  hashBuffer,
  findOrCreateGuest,
  createKycSubmission,
  setSubmissionObjectKeys,
  recordExtractionResult,
  clearSubmissionObjectKeys,
  decideSubmission,
  getSubmission,
  listSubmissionsByStatus,
  insertCredential,
  getCredential,
  getLatestCredentialForGuest,
  findCredentialByDocHash,
  revokeCredential,
  listRevokedCredentialIds,
  logAudit,
};
