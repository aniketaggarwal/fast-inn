const { Router } = require("express");
const { asyncHandler } = require("../utils/asyncHandler");
const { DOC_TEMPLATES } = require("../pipeline/template");
const { runQualityGate } = require("../pipeline/quality");
const { extractFields } = require("../pipeline/extract");
const { stubFaceMatch } = require("../pipeline/facematch");
const { issueCredentialForSubmission, deleteSubmissionDocuments } = require("../pipeline/issue");
const s3 = require("../storage/s3");
const repo = require("../repo");

const router = Router();

// Guest app talks to the issuer directly for KYC (Section 4 architecture
// diagram) — no api-issued auth token is involved here at all. Identity
// on this side is phone-based (guests.phone_hash), deliberately decoupled
// from api's email/JWT accounts; the two systems only meet later when a
// presented credential is checked in at a hotel (Milestone 5).
router.post(
  "/kyc/uploads/presign",
  asyncHandler(async (req, res) => {
    const { docType } = req.body || {};
    if (!DOC_TEMPLATES[docType]) {
      return res.status(400).json({ error: "invalid_doc_type" });
    }

    const docKey = s3.newObjectKey("kyc/docs", "png");
    const selfieKey = s3.newObjectKey("kyc/selfies", "png");
    const [docUploadUrl, selfieUploadUrl] = await Promise.all([
      s3.presignedPutUrl(docKey, "image/png"),
      s3.presignedPutUrl(selfieKey, "image/png"),
    ]);

    res.json({ docKey, docUploadUrl, selfieKey, selfieUploadUrl });
  })
);

router.post(
  "/kyc/submit",
  asyncHandler(async (req, res) => {
    const { phone, docType, docKey, selfieKey, consent, holderPublicKeyJwk } = req.body || {};

    if (typeof phone !== "string" || phone.trim().length < 6) {
      return res.status(400).json({ error: "invalid_phone" });
    }
    if (!DOC_TEMPLATES[docType]) {
      return res.status(400).json({ error: "invalid_doc_type" });
    }
    if (typeof docKey !== "string" || typeof selfieKey !== "string") {
      return res.status(400).json({ error: "missing_upload_keys" });
    }
    if (consent !== true) {
      return res.status(400).json({ error: "consent_required" });
    }

    const guest = await repo.findOrCreateGuest(phone.trim());
    const submission = await repo.createKycSubmission({ guestId: guest.id, docType });
    await repo.setSubmissionObjectKeys(submission.id, { docObjectKey: docKey, selfieObjectKey: selfieKey });

    let docBuffer;
    try {
      docBuffer = await s3.getObjectBuffer(docKey);
    } catch {
      return res.status(400).json({ error: "doc_upload_not_found" });
    }

    // Quality gate runs before OCR ever sees the image (Section 9.1) — an
    // unreadable upload is rejected immediately with a reason, not parked
    // in a review queue a human will also find unreadable.
    const quality = await runQualityGate(docBuffer);
    if (!quality.passed) {
      const rejected = await repo.decideSubmission(submission.id, {
        status: "REJECTED",
        reviewerId: null,
        reviewNote: `quality_gate_failed: ${quality.reasons.join(", ")}`,
      });
      await deleteSubmissionDocuments({ ...rejected, doc_object_key: docKey, selfie_object_key: selfieKey });
      return res.status(422).json({ error: "quality_gate_failed", reasons: quality.reasons, submissionId: submission.id });
    }

    const extraction = await extractFields(docBuffer, docType);
    await stubFaceMatch();
    const docHash = repo.hashBuffer(docBuffer);

    // Fraud signal (Section 9.8): the same document bound to a different
    // guest forces human review regardless of how clean the OCR looked.
    const duplicate = await repo.findCredentialByDocHash(docHash);
    const isDuplicateForAnotherGuest = Boolean(duplicate && duplicate.guest_id !== guest.id);
    if (isDuplicateForAnotherGuest) {
      await repo.logAudit({
        actor: "issuer-pipeline",
        action: "fraud_signal_duplicate_document",
        subjectId: submission.id,
        meta: { docHash, existingGuestId: duplicate.guest_id, newGuestId: guest.id },
      });
    }

    const autoPass = extraction.allPassed && !isDuplicateForAnotherGuest;

    if (!autoPass) {
      await repo.recordExtractionResult(submission.id, {
        ocrJson: extraction.fields,
        ocrConfidence: extraction.overallConfidence,
        faceScore: null,
        status: "NEEDS_REVIEW",
      });
      return res.status(202).json({ status: "NEEDS_REVIEW", submissionId: submission.id });
    }

    await repo.recordExtractionResult(submission.id, {
      ocrJson: extraction.fields,
      ocrConfidence: extraction.overallConfidence,
      faceScore: null,
      status: "AUTO_PASS",
    });

    const values = {
      fullName: extraction.fields.fullName.value,
      dateOfBirth: extraction.fields.dateOfBirth.value,
      idNumber: extraction.fields.idNumber.value,
      nationality: extraction.fields.nationality.value,
    };

    const freshSubmission = await repo.getSubmission(submission.id);
    const { credential, disclosures, publicKeyJwk } = await issueCredentialForSubmission({
      submission: freshSubmission,
      values,
      docHash,
      holderPublicKeyJwk,
    });
    await repo.decideSubmission(submission.id, { status: "APPROVED", reviewerId: null, reviewNote: "auto-approved" });
    await deleteSubmissionDocuments(freshSubmission);

    res.json({
      status: "APPROVED",
      submissionId: submission.id,
      credential: { id: credential.id, jwt: credential.jwt, disclosures, expiresAt: credential.expires_at },
      issuerPublicKeyJwk: publicKeyJwk,
    });
  })
);

router.get(
  "/kyc/:id/status",
  asyncHandler(async (req, res) => {
    const submission = await repo.getSubmission(req.params.id);
    if (!submission) {
      return res.status(404).json({ error: "not_found" });
    }

    const response = { submissionId: submission.id, status: submission.status, docType: submission.doc_type };

    if (submission.status === "APPROVED") {
      const credential = await repo.getLatestCredentialForGuest(submission.guest_id);
      if (credential) {
        response.credential = {
          id: credential.id,
          jwt: credential.jwt,
          disclosures: credential.disclosures_json,
          expiresAt: credential.expires_at,
        };
      }
    } else if (submission.status === "REJECTED") {
      response.reviewNote = submission.review_note;
    }

    res.json(response);
  })
);

module.exports = router;
