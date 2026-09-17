const request = require("supertest");
const { createApp } = require("../src/app");
const { pool } = require("../src/db");
const s3 = require("../src/storage/s3");
const { loadOrCreateKeys } = require("../src/keys");
const { hashPhone } = require("../src/repo");
const { makeCardBuffer, GOOD_AADHAAR_VALUES, cleanupIssuerData, FACE_A, FACE_B } = require("./helpers");

const app = createApp();
const trackedGuestIds = [];

beforeAll(async () => {
  await loadOrCreateKeys();
  await s3.ensureBucket();
});

afterAll(async () => {
  await cleanupIssuerData({ guestIds: trackedGuestIds });
  await pool.end();
});

async function uploadAndSubmit({ docType, values, phone, consent = true, docBuffer: docBufferOverride, selfieBuffer }) {
  const docBuffer = docBufferOverride || (await makeCardBuffer(docType, values, { faceBuffer: FACE_A }));

  const presign = await request(app).post("/kyc/uploads/presign").send({ docType });
  await fetch(presign.body.docUploadUrl, { method: "PUT", headers: { "Content-Type": "image/png" }, body: docBuffer });
  await fetch(presign.body.selfieUploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "image/png" },
    body: selfieBuffer || docBuffer,
  });

  const submit = await request(app)
    .post("/kyc/submit")
    .send({ phone, docType, docKey: presign.body.docKey, selfieKey: presign.body.selfieKey, consent });

  // kyc_submissions.guest_id cascades on guest deletion, so tracking the
  // guest here is enough to clean up the submission row too — including
  // NEEDS_REVIEW ones a test leaves undecided, and even a consent_required
  // 400 (no guest ever gets created there, so the lookup just finds none).
  if (submit.status !== 400) {
    const guestResult = await pool.query("SELECT id FROM guests WHERE phone_hash = $1", [hashPhone(phone)]);
    if (guestResult.rowCount > 0) trackedGuestIds.push(guestResult.rows[0].id);
  }

  return { submit, docKey: presign.body.docKey, selfieKey: presign.body.selfieKey };
}

describe("POST /kyc/uploads/presign", () => {
  it("returns presigned PUT URLs and object keys for a valid doc type", async () => {
    const res = await request(app).post("/kyc/uploads/presign").send({ docType: "AADHAAR" });
    expect(res.status).toBe(200);
    expect(res.body.docKey).toMatch(/^kyc\/docs\//);
    expect(res.body.selfieKey).toMatch(/^kyc\/selfies\//);
    expect(res.body.docUploadUrl).toContain("X-Amz-Signature");
  });

  it("rejects an unknown doc type", async () => {
    const res = await request(app).post("/kyc/uploads/presign").send({ docType: "NOT_A_REAL_DOC" });
    expect(res.status).toBe(400);
  });
});

describe("POST /kyc/submit — auto-pass path", () => {
  it("auto-approves a clean document and issues a credential; the raw doc is deleted from storage", async () => {
    const values = GOOD_AADHAAR_VALUES(101);
    const { submit, docKey, selfieKey } = await uploadAndSubmit({
      docType: "AADHAAR",
      values,
      phone: "7000000101",
    });

    expect(submit.status).toBe(200);
    expect(submit.body.status).toBe("APPROVED");
    expect(typeof submit.body.credential.jwt).toBe("string");
    expect(submit.body.credential.disclosures.map((d) => d.name)).toEqual(
      expect.arrayContaining(["fullName", "dateOfBirth", "isAdult", "nationality", "idType", "idLast4", "idDocHash", "verifiedAt"])
    );

    // A verifier (Milestone 5) identifies which DB row a JWT corresponds
    // to via its jti — must match the credential's own id, not just be
    // present.
    const payload = JSON.parse(Buffer.from(submit.body.credential.jwt.split(".")[1], "base64url").toString());
    expect(payload.jti).toBe(submit.body.credential.id);

    // The "S3 object is gone afterwards" done-when criterion, checked
    // directly against storage rather than trusting the API's word for it.
    expect(await s3.objectExists(docKey)).toBe(false);
    expect(await s3.objectExists(selfieKey)).toBe(false);

    const statusRes = await request(app).get(`/kyc/${submit.body.submissionId}/status`);
    expect(statusRes.body.status).toBe("APPROVED");
    expect(statusRes.body.credential.jwt).toBe(submit.body.credential.jwt);
  });

  it("rejects submission without consent", async () => {
    const res = await request(app)
      .post("/kyc/submit")
      .send({ phone: "7000000102", docType: "AADHAAR", docKey: "x", selfieKey: "y", consent: false });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("consent_required");
  });

  it("reuses the same guest for repeated submissions from the same phone", async () => {
    const phone = "7000000103";
    const values1 = GOOD_AADHAAR_VALUES(104);
    const { submit: first } = await uploadAndSubmit({ docType: "AADHAAR", values: values1, phone });
    expect(first.status).toBe(200);

    const values2 = GOOD_AADHAAR_VALUES(105);
    const { submit: second } = await uploadAndSubmit({ docType: "AADHAAR", values: values2, phone });
    expect(second.status).toBe(200);

    const guestResult = await pool.query("SELECT id FROM guests WHERE phone_hash = $1", [hashPhone(phone)]);
    expect(guestResult.rowCount).toBe(1); // one guest, not two, despite two submissions
  });
});

describe("POST /kyc/submit — quality gate rejection", () => {
  it("rejects a heavily blurred upload before it ever reaches OCR, and cleans up storage", async () => {
    const values = GOOD_AADHAAR_VALUES(201);
    const docBuffer = await makeCardBuffer("AADHAAR", values);
    const sharp = require("sharp");
    const blurred = await sharp(docBuffer).blur(50).png().toBuffer();

    const presign = await request(app).post("/kyc/uploads/presign").send({ docType: "AADHAAR" });
    await fetch(presign.body.docUploadUrl, { method: "PUT", headers: { "Content-Type": "image/png" }, body: blurred });
    await fetch(presign.body.selfieUploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "image/png" },
      body: blurred,
    });

    const submit = await request(app).post("/kyc/submit").send({
      phone: "7000000201",
      docType: "AADHAAR",
      docKey: presign.body.docKey,
      selfieKey: presign.body.selfieKey,
      consent: true,
    });

    expect(submit.status).toBe(422);
    expect(submit.body.error).toBe("quality_gate_failed");
    expect(submit.body.reasons).toContain("too_blurry");
    expect(await s3.objectExists(presign.body.docKey)).toBe(false);

    const guestResult = await pool.query("SELECT id FROM guests WHERE phone_hash = $1", [hashPhone("7000000201")]);
    trackedGuestIds.push(guestResult.rows[0].id);
  });
});

describe("POST /kyc/submit — needs review path", () => {
  it("sends a submission with a bad checksum to NEEDS_REVIEW instead of auto-approving", async () => {
    const values = { ...GOOD_AADHAAR_VALUES(301), idNumber: "111111111111" }; // fails Verhoeff
    const { submit } = await uploadAndSubmit({ docType: "AADHAAR", values, phone: "7000000301" });

    expect(submit.status).toBe(202);
    expect(submit.body.status).toBe("NEEDS_REVIEW");
  });
});

describe("POST /kyc/submit — face match gating", () => {
  it("sends a submission to NEEDS_REVIEW when the selfie's face doesn't match the ID photo's", async () => {
    const values = GOOD_AADHAAR_VALUES(501);
    const docBuffer = await makeCardBuffer("AADHAAR", values, { faceBuffer: FACE_A });
    const { submit } = await uploadAndSubmit({
      docType: "AADHAAR",
      values,
      phone: "7000000501",
      docBuffer,
      selfieBuffer: FACE_B,
    });

    expect(submit.status).toBe(202);
    expect(submit.body.status).toBe("NEEDS_REVIEW");
  });

  it("sends a submission to NEEDS_REVIEW when no face is detected in the selfie", async () => {
    const values = GOOD_AADHAAR_VALUES(502);
    const docBuffer = await makeCardBuffer("AADHAAR", values, { faceBuffer: FACE_A });
    const sharp = require("sharp");
    const blankSelfie = await sharp({ create: { width: 200, height: 200, channels: 3, background: "#808080" } })
      .png()
      .toBuffer();
    const { submit } = await uploadAndSubmit({
      docType: "AADHAAR",
      values,
      phone: "7000000502",
      docBuffer,
      selfieBuffer: blankSelfie,
    });

    expect(submit.status).toBe(202);
    expect(submit.body.status).toBe("NEEDS_REVIEW");
  });
});

describe("duplicate document fraud signal", () => {
  it("forces NEEDS_REVIEW when the same document hash is bound to a different guest", async () => {
    const values = GOOD_AADHAAR_VALUES(401);

    const { submit: first } = await uploadAndSubmit({ docType: "AADHAAR", values, phone: "7000000401" });
    expect(first.body.status).toBe("APPROVED");

    // Same exact document bytes, different phone -> different guest.
    const { submit: second } = await uploadAndSubmit({ docType: "AADHAAR", values, phone: "7000000402" });
    expect(second.body.status).toBe("NEEDS_REVIEW");
  });
});
