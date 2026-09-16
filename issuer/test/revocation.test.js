const request = require("supertest");
const { createApp } = require("../src/app");
const { pool } = require("../src/db");
const s3 = require("../src/storage/s3");
const { loadOrCreateKeys, getJWKS } = require("../src/keys");
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

async function issueApprovedCredential(phone, seed) {
  const values = GOOD_AADHAAR_VALUES(seed);
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

  const guestResult = await pool.query("SELECT id FROM guests WHERE phone_hash = $1", [hashPhone(phone)]);
  trackedGuestIds.push(guestResult.rows[0].id);

  return submit.body.credential.id;
}

describe("GET /.well-known/jwks.json", () => {
  it("publishes the active issuer public key", async () => {
    const res = await request(app).get("/.well-known/jwks.json");
    expect(res.status).toBe(200);
    expect(res.body).toEqual(getJWKS());
    expect(res.body.keys[0].kty).toBe("OKP");
    expect(res.body.keys[0].d).toBeUndefined(); // never the private key
  });
});

describe("revocation", () => {
  it("GET /revocations is public and starts a credential off un-revoked", async () => {
    const credentialId = await issueApprovedCredential("7000000701", 701);
    const res = await request(app).get("/revocations");
    expect(res.status).toBe(200);
    expect(res.body.revokedIds).not.toContain(credentialId);
  });

  it("POST /admin/revoke requires the service token", async () => {
    const credentialId = await issueApprovedCredential("7000000702", 702);
    const res = await request(app).post(`/admin/revoke/${credentialId}`).send({ reason: "test" });
    expect(res.status).toBe(401);
  });

  it("revokes a credential, which then appears in /revocations with an incremented version", async () => {
    const credentialId = await issueApprovedCredential("7000000703", 703);

    const before = await request(app).get("/revocations");
    const versionBefore = before.body.version;

    const revoke = await request(app)
      .post(`/admin/revoke/${credentialId}`)
      .set("X-Issuer-Service-Token", SERVICE_TOKEN)
      .send({ reason: "guest reported device lost", actorId: "00000000-0000-0000-0000-000000000099" });

    expect(revoke.status).toBe(200);
    expect(revoke.body.version).toBe(versionBefore + 1);

    const after = await request(app).get("/revocations");
    expect(after.body.revokedIds).toContain(credentialId);
    expect(after.body.version).toBe(versionBefore + 1);
  });

  it("404s revoking a credential that doesn't exist", async () => {
    const res = await request(app)
      .post("/admin/revoke/00000000-0000-0000-0000-000000000000")
      .set("X-Issuer-Service-Token", SERVICE_TOKEN)
      .send({});
    expect(res.status).toBe(404);
  });

  it("409s revoking an already-revoked credential", async () => {
    const credentialId = await issueApprovedCredential("7000000704", 704);
    await request(app).post(`/admin/revoke/${credentialId}`).set("X-Issuer-Service-Token", SERVICE_TOKEN).send({});

    const second = await request(app)
      .post(`/admin/revoke/${credentialId}`)
      .set("X-Issuer-Service-Token", SERVICE_TOKEN)
      .send({});
    expect(second.status).toBe(409);
  });
});
