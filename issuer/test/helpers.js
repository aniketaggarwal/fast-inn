const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { renderIdCardSVG, CARD_HEIGHT } = require("../src/pipeline/template");
const { appendVerhoeffCheckDigit } = require("../src/pipeline/validators");
const { pool } = require("../src/db");
const s3 = require("../src/storage/s3");

const FACES_DIR = path.join(__dirname, "faces");

// Two AI-generated faces (thispersondoesnotexist.com — StyleGAN output,
// not a real person, so no consent/privacy question in committing them)
// used across the face-match tests: FACE_A twice for a genuine match,
// FACE_A vs FACE_B for an impostor mismatch. The real FAR/FRR accuracy
// study (scripts/face-far-frr-sweep.js) uses actual distinct photos of
// real people (LFW) instead — these two are just fixed, reusable wiring
// fixtures, not a claim about matcher accuracy.
const FACE_A = fs.readFileSync(path.join(FACES_DIR, "genuine-a.jpg"));
const FACE_B = fs.readFileSync(path.join(FACES_DIR, "genuine-b.jpg"));

// Tests generate their own fixture images inline (not from fixtures/) so
// they're hermetic — no separate `npm run make-fake-ids` step required
// for CI or a fresh checkout to pass.
//
// A real face is composited into a margin appended *below* the card's own
// CARD_HEIGHT, never inside it — the OCR field crops (template.js) only
// ever read y < CARD_HEIGHT, so this can't perturb OCR in any way. No
// face is embedded unless a caller explicitly opts in with `faceBuffer`
// (kyc.test.js's face-match tests) — every other test in this suite
// (quality gate, OCR/extraction) relies on the plain card's exact
// brightness/content-area metrics, which a bright face photo would skew.
async function makeCardBuffer(docType, values, { faceBuffer = null } = {}) {
  const svg = renderIdCardSVG(docType, values);
  const card = sharp(Buffer.from(svg)).png();
  if (!faceBuffer) return card.toBuffer();

  // Neutral grey margin, not the card's own near-white background: the
  // card's background is already close to quality.js's BRIGHTNESS_MAX
  // (~219 of 220) by itself, so extending it with more near-white area
  // pushes brightness over the top and fails the quality gate on a
  // perfectly good image. A mid-grey margin keeps the overall average
  // where it was.
  const face = await sharp(faceBuffer).resize(180, 180).png().toBuffer();
  return card
    .extend({ bottom: 200, background: "#808080" })
    .composite([{ input: face, top: CARD_HEIGHT + 10, left: 20 }])
    .png()
    .toBuffer();
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

module.exports = { makeCardBuffer, validAadhaarNumber, GOOD_AADHAAR_VALUES, cleanupIssuerData, FACE_A, FACE_B };
