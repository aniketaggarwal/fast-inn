const sharp = require("sharp");
const { renderIdCardSVG } = require("../src/pipeline/template");
const { appendVerhoeffCheckDigit } = require("../src/pipeline/validators");
const { pool } = require("../src/db");
const s3 = require("../src/storage/s3");

// Tests generate their own fixture images inline (not from fixtures/) so
// they're hermetic — no separate `npm run make-fake-ids` step required
// for CI or a fresh checkout to pass.
async function makeCardBuffer(docType, values) {
  const svg = renderIdCardSVG(docType, values);
  return sharp(Buffer.from(svg)).png().toBuffer();
}

function validAadhaarNumber(seed = 1) {
  const eleven = String(seed).padStart(11, "4");
  return appendVerhoeffCheckDigit(eleven);
}

const GOOD_AADHAAR_VALUES = (seed = 1) => ({
  fullName: "Test Guest",
  dateOfBirth: "14/05/2000",
  idNumber: validAadhaarNumber(seed),
  nationality: "IN",
});

// A submission a test deliberately leaves in NEEDS_REVIEW (to test that
// exact state) never goes through deleteSubmissionDocuments — correctly,
// since a genuinely pending review still needs its document in storage
// for a reviewer to look at. But that means test cleanup has to delete
// those S3 objects itself, not just the DB rows, or every test run leaks
// objects into the bucket forever.
async function deleteObjectsForGuests(guestIds) {
  if (!guestIds.length) return;
  const result = await pool.query(
    "SELECT doc_object_key, selfie_object_key FROM kyc_submissions WHERE guest_id = ANY($1::uuid[])",
    [guestIds]
  );
  for (const row of result.rows) {
    if (row.doc_object_key) await s3.deleteObject(row.doc_object_key).catch(() => {});
    if (row.selfie_object_key) await s3.deleteObject(row.selfie_object_key).catch(() => {});
  }
}

async function cleanupIssuerData({ guestIds = [], submissionIds = [] } = {}) {
  if (submissionIds.length) {
    await pool.query("DELETE FROM kyc_submissions WHERE id = ANY($1::uuid[])", [submissionIds]);
  }
  if (guestIds.length) {
    await deleteObjectsForGuests(guestIds);
    await pool.query("DELETE FROM credentials WHERE guest_id = ANY($1::uuid[])", [guestIds]);
    await pool.query("DELETE FROM guests WHERE id = ANY($1::uuid[])", [guestIds]);
  }
}

module.exports = { makeCardBuffer, validAadhaarNumber, GOOD_AADHAAR_VALUES, cleanupIssuerData };
