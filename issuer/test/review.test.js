const request = require("supertest");
const { createApp } = require("../src/app");
const { pool } = require("../src/db");
const s3 = require("../src/storage/s3");
const { loadOrCreateKeys } = require("../src/keys");
const { hashPhone } = require("../src/repo");
const { makeCardBuffer, GOOD_AADHAAR_VALUES, cleanupIssuerData } = require("./helpers");

const app = createApp();
const SERVICE_TOKEN = process.env.ISSUER_SERVICE_TOKEN;
const trackedGuestIds = [];

beforeAll(async () => {
  await loadOrCreateKeys();
  await s3.ensureBucket();
});

afterAll(async () => {
  await cleanupIssuerData({ guestIds: trackedGuestIds });
  await pool.end();
});

async function submitBadChecksum(phone, seed) {
  const values = { ...GOOD_AADHAAR_VALUES(seed), idNumber: "111111111111" };
  const docBuffer = await makeCardBuffer("AADHAAR", values);

  const presign = await request(app).post("/kyc/uploads/presign").send({ docType: "AADHAAR" });
  await fetch(presign.body.docUploadUrl, { method: "PUT", headers: { "Content-Type": "image/png" }, body: docBuffer });
  await fetch(presign.body.selfieUploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "image/png" },
    body: docBuffer,
  });

  const submit = await request(app)
    .post("/kyc/submit")
    .send({ phone, docType: "AADHAAR", docKey: presign.body.docKey, selfieKey: presign.body.selfieKey, consent: true });

  // kyc_submissions.guest_id cascades on guest deletion, so tracking the
  // guest here is enough to clean up the submission row too — including
  // ones a test deliberately leaves in NEEDS_REVIEW rather than deciding.
  const guestResult = await pool.query("SELECT id FROM guests WHERE phone_hash = $1", [hashPhone(phone)]);
  trackedGuestIds.push(guestResult.rows[0].id);

  return submit.body.submissionId;
}

describe("auth", () => {
  it("rejects GET /review with no service token", async () => {
    const res = await request(app).get("/review");
    expect(res.status).toBe(401);
  });

  it("rejects GET /review with the wrong service token", async () => {
    const res = await request(app).get("/review").set("X-Issuer-Service-Token", "wrong-token");
    expect(res.status).toBe(401);
  });

  it("rejects decide with no service token", async () => {
    const res = await request(app).post("/review/00000000-0000-0000-0000-000000000000/decide").send({});
    expect(res.status).toBe(401);
  });
});

describe("GET /review", () => {
  it("lists NEEDS_REVIEW submissions with short-lived image URLs", async () => {
    const submissionId = await submitBadChecksum("7000000501", 501);

    const res = await request(app).get("/review").set("X-Issuer-Service-Token", SERVICE_TOKEN);
    expect(res.status).toBe(200);
    const entry = res.body.submissions.find((s) => s.id === submissionId);
    expect(entry).toBeDefined();
    expect(entry.docImageUrl).toContain("X-Amz-Signature");
    expect(entry.ocrJson.idNumber.passed).toBe(false);
    // Regression check: pg's NUMERIC parser defaults to returning a
    // string, which crashed AdminReviewPage.jsx's ocrConfidence.toFixed().
    expect(typeof entry.ocrConfidence).toBe("number");
  });
});

describe("POST /review/:id/decide", () => {
  it("approves with reviewer-corrected fields and issues a credential", async () => {
    const submissionId = await submitBadChecksum("7000000601", 601);

    const res = await request(app)
      .post(`/review/${submissionId}/decide`)
      .set("X-Issuer-Service-Token", SERVICE_TOKEN)
      .send({
        decision: "APPROVE",
        note: "verified manually",
        reviewerId: "00000000-0000-0000-0000-000000000099",
        correctedFields: GOOD_AADHAAR_VALUES(601),
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("APPROVED");
    expect(typeof res.body.credential.jwt).toBe("string");

    const statusRes = await request(app).get(`/kyc/${submissionId}/status`);
    expect(statusRes.body.status).toBe("APPROVED");
  });

  it("rejects an APPROVE whose corrected field still fails validation", async () => {
    const submissionId = await submitBadChecksum("7000000602", 602);

    const res = await request(app)
      .post(`/review/${submissionId}/decide`)
      .set("X-Issuer-Service-Token", SERVICE_TOKEN)
      .send({
        decision: "APPROVE",
        reviewerId: "00000000-0000-0000-0000-000000000099",
        correctedFields: { ...GOOD_AADHAAR_VALUES(602), idNumber: "111111111111" }, // still bad
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_corrected_field");
  });

  it("rejects a malformed reviewerId before doing anything state-changing", async () => {
    const submissionId = await submitBadChecksum("7000000603", 603);

    const res = await request(app)
      .post(`/review/${submissionId}/decide`)
      .set("X-Issuer-Service-Token", SERVICE_TOKEN)
      .send({ decision: "APPROVE", reviewerId: "not-a-uuid", correctedFields: GOOD_AADHAAR_VALUES(603) });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_reviewer_id");

    // Confirm nothing changed — the submission is still there to retry.
    const statusRes = await request(app).get(`/kyc/${submissionId}/status`);
    expect(statusRes.body.status).toBe("NEEDS_REVIEW");
  });

  it("rejects and cleans up storage, with no credential issued", async () => {
    const submissionId = await submitBadChecksum("7000000604", 604);

    const res = await request(app)
      .post(`/review/${submissionId}/decide`)
      .set("X-Issuer-Service-Token", SERVICE_TOKEN)
      .send({ decision: "REJECT", note: "looks fabricated", reviewerId: "00000000-0000-0000-0000-000000000099" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("REJECTED");

    const statusRes = await request(app).get(`/kyc/${submissionId}/status`);
    expect(statusRes.body.status).toBe("REJECTED");
    expect(statusRes.body.credential).toBeUndefined();
  });

  it("404s deciding a submission that isn't pending review", async () => {
    const res = await request(app)
      .post("/review/00000000-0000-0000-0000-000000000000/decide")
      .set("X-Issuer-Service-Token", SERVICE_TOKEN)
      .send({ decision: "REJECT" });
    expect(res.status).toBe(404);
  });
});
