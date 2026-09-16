const crypto = require("crypto");
const { issueCredential } = require("credentials");
const { getActiveKeyPair } = require("../keys");
const { buildClaims } = require("./claims");
const repo = require("../repo");
const s3 = require("../storage/s3");

const CREDENTIAL_TTL_SECONDS = 365 * 24 * 60 * 60; // 1 year
const ISSUER_IDENTIFIER = process.env.ISSUER_IDENTIFIER || "https://issuer.hotelverify.test";

// Shared by both the auto-pass path (kyc.js) and the reviewer-approve path
// (review.js): builds claims, signs the SD-JWT, persists it. Deliberately
// does NOT touch the raw document/selfie in storage — see
// deleteSubmissionDocuments below for why that's a separate, later step.
async function issueCredentialForSubmission({ submission, values, docHash, holderPublicKeyJwk }) {
  const { selfie_object_key: selfieObjectKey } = submission;
  const selfieBuffer = selfieObjectKey ? await s3.getObjectBuffer(selfieObjectKey) : null;

  const claims = await buildClaims({ values, docType: submission.doc_type, docHash, selfieBuffer });
  const { publicKeyJwk, privateKeyJwk, kid } = getActiveKeyPair();

  // Generated up front so it can be embedded as the JWT's own jti before
  // signing, and then inserted as that same row's id afterward — without
  // this, a verifier has no way to know which credentials-table row a
  // given JWT corresponds to, and so no way to check it against
  // /revocations (Section 3d).
  const credentialId = crypto.randomUUID();

  const issued = await issueCredential({
    claims,
    issuerPrivateKeyJwk: privateKeyJwk,
    kid,
    issuer: ISSUER_IDENTIFIER,
    subject: submission.guest_id,
    holderPublicKeyJwk,
    expiresInSeconds: CREDENTIAL_TTL_SECONDS,
    credentialId,
  });

  const expiresAt = new Date(Date.now() + CREDENTIAL_TTL_SECONDS * 1000);
  const credential = await repo.insertCredential({
    id: credentialId,
    guestId: submission.guest_id,
    jwt: issued.jwt,
    disclosures: issued.disclosures,
    docHash,
    expiresAt,
  });

  await repo.logAudit({
    actor: "issuer-pipeline",
    action: "credential_issued",
    subjectId: credential.id,
    meta: { guestId: submission.guest_id, kycSubmissionId: submission.id },
  });

  return { credential, disclosures: issued.disclosures, publicKeyJwk };
}

// Deletes the raw doc/selfie from storage — only doc_hash survives
// (Section 9.6). Called explicitly by the route AFTER it has durably
// recorded the outcome (decideSubmission), never before: issuing a
// credential and deleting its source document is easy to redo if the
// final DB write fails, but an S3 delete is not undoable, so it has to be
// the very last thing that can fail. (An earlier version of this route
// deleted first and updated status last — a failure in between left a
// submission stuck in NEEDS_REVIEW with its evidence already gone.)
// By the time this runs, decideSubmission has already succeeded — the
// outcome the caller actually cares about is durably recorded. A deletion
// failure here (network blip, object already gone) shouldn't turn that
// into a 500 the client might mistake for "the decision didn't happen."
// It's also not silently swallowed: logged to console and issuer_audit so
// an orphaned object is actually visible to whoever's watching, instead
// of quietly outliving the "raw docs deleted after issuance" guarantee
// (Section 9.6). Object keys are only cleared in the DB once deletion
// actually succeeds, so a retry has something to retry against.
async function deleteSubmissionDocuments(submission) {
  const { id, doc_object_key: docObjectKey, selfie_object_key: selfieObjectKey } = submission;
  try {
    if (docObjectKey) await s3.deleteObject(docObjectKey);
    if (selfieObjectKey) await s3.deleteObject(selfieObjectKey);
    await repo.clearSubmissionObjectKeys(id);
  } catch (err) {
    console.error(`Failed to delete raw KYC documents for submission ${id}:`, err);
    await repo.logAudit({
      actor: "issuer-pipeline",
      action: "document_deletion_failed",
      subjectId: id,
      meta: { error: err.message },
    });
  }
}

module.exports = {
  issueCredentialForSubmission,
  deleteSubmissionDocuments,
  CREDENTIAL_TTL_SECONDS,
  ISSUER_IDENTIFIER,
};
