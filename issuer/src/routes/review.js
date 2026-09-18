const { Router } = require("express");
const { asyncHandler } = require("../utils/asyncHandler");
const { requireServiceToken } = require("../middleware/requireServiceToken");
const { FIELD_VALIDATORS } = require("../pipeline/validators");
const { issueCredentialForSubmission, deleteSubmissionDocuments } = require("../pipeline/issue");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const s3 = require("../storage/s3");
const repo = require("../repo");

const router = Router();

router.get(
  "/review",
  requireServiceToken,
  asyncHandler(async (req, res) => {
    const submissions = await repo.listSubmissionsByStatus("NEEDS_REVIEW");

    // 60s presigned GET, generated only for this authorised reviewer
    // request — never a permanent URL (Section 9.6).
    const withImageUrls = await Promise.all(
      submissions.map(async (s) => ({
        id: s.id,
        guestId: s.guest_id,
        docType: s.doc_type,
        ocrJson: s.ocr_json,
        ocrConfidence: s.ocr_confidence,
        faceScore: s.face_score,
        faceMatchStatus: s.face_match_status,
        createdAt: s.created_at,
        docImageUrl: s.doc_object_key ? await s3.presignedGetUrl(s.doc_object_key, 60, req.publicOrigin) : null,
        selfieImageUrl: s.selfie_object_key ? await s3.presignedGetUrl(s.selfie_object_key, 60, req.publicOrigin) : null,
      }))
    );

    res.json({ submissions: withImageUrls });
  })
);

router.post(
  "/review/:id/decide",
  requireServiceToken,
  asyncHandler(async (req, res) => {
    const { decision, note, correctedFields, reviewerId, holderPublicKeyJwk } = req.body || {};
    if (decision !== "APPROVE" && decision !== "REJECT") {
      return res.status(400).json({ error: "invalid_decision" });
    }
    // Validated up front, before anything state-changing: a malformed
    // reviewerId failing at the final DB write (after a credential was
    // already issued and the source document already deleted) is exactly
    // the inconsistent-state bug this route used to have.
    if (reviewerId !== undefined && reviewerId !== null && !UUID_RE.test(reviewerId)) {
      return res.status(400).json({ error: "invalid_reviewer_id" });
    }

    const submission = await repo.getSubmission(req.params.id);
    if (!submission || submission.status !== "NEEDS_REVIEW") {
      return res.status(404).json({ error: "not_found_or_not_pending_review" });
    }

    if (decision === "REJECT") {
      await repo.decideSubmission(submission.id, { status: "REJECTED", reviewerId, reviewNote: note || null });
      await deleteSubmissionDocuments(submission);
      return res.json({ status: "REJECTED" });
    }

    // APPROVE: a reviewer can override a low-confidence read, but not
    // submit a value that fails the field's own format/checksum — the
    // validators exist to catch nonsense, not just OCR noise.
    if (!correctedFields || typeof correctedFields !== "object") {
      return res.status(400).json({ error: "corrected_fields_required" });
    }
    const values = {};
    for (const fieldName of ["fullName", "dateOfBirth", "idNumber", "nationality"]) {
      const raw = correctedFields[fieldName];
      if (typeof raw !== "string") {
        return res.status(400).json({ error: "missing_corrected_field", field: fieldName });
      }
      const { valid, value } = FIELD_VALIDATORS[fieldName](raw, submission.doc_type);
      if (!valid) {
        return res.status(400).json({ error: "invalid_corrected_field", field: fieldName });
      }
      values[fieldName] = value;
    }

    // Same hash semantics as the auto-pass path in kyc.js: the actual
    // document image bytes, hashed before they're deleted below — not
    // derived from the (possibly reviewer-corrected) field values.
    const docBuffer = await s3.getObjectBuffer(submission.doc_object_key);
    const docHash = repo.hashBuffer(docBuffer);

    const { credential, disclosures } = await issueCredentialForSubmission({
      submission,
      values,
      docHash,
      holderPublicKeyJwk,
    });

    await repo.decideSubmission(submission.id, { status: "APPROVED", reviewerId, reviewNote: note || null });
    await deleteSubmissionDocuments(submission);

    res.json({
      status: "APPROVED",
      credential: { id: credential.id, jwt: credential.jwt, disclosures, expiresAt: credential.expires_at },
    });
  })
);

module.exports = router;
