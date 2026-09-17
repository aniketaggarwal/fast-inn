// Must be set before ../src/app (and transitively issuerClient.js) is
// first required — same reasoning as issuerReview.test.js.
process.env.ISSUER_BASE_URL = "http://localhost:4098";

const http = require("http");
const crypto = require("crypto");
const { webcrypto } = require("crypto");
const request = require("supertest");
const { SignJWT, exportJWK } = require("jose");
const { generateIssuerKeyPair, buildJWKS, issueCredential, selectDisclosures } = require("credentials");
const { createApp } = require("../src/app");
const { pool, withTenantTransaction } = require("../src/db");
const { ensureConnected } = require("../src/redis");
const { uniqueEmail, createHotel, createRoom, createUser, deleteHotel, deleteUser } = require("./helpers");

const app = createApp();
let fakeIssuerServer;
let issuerKeyPair;
let revokedIds = [];

function startFakeIssuer() {
  return new Promise((resolve) => {
    fakeIssuerServer = http.createServer((req, res) => {
      res.setHeader("Content-Type", "application/json");
      if (req.url === "/.well-known/jwks.json") {
        res.end(JSON.stringify(buildJWKS([issuerKeyPair.publicKeyJwk])));
      } else if (req.url === "/revocations") {
        res.end(JSON.stringify({ version: 1, revokedIds }));
      } else {
        res.statusCode = 404;
        res.end("{}");
      }
    });
    fakeIssuerServer.listen(4098, resolve);
  });
}

async function makeDeviceKeyPair() {
  const { publicKey, privateKey } = await webcrypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
  return { publicKey, privateKey, publicKeyJwk: await exportJWK(publicKey) };
}

async function issueTestCredential({ holderPublicKeyJwk, claims }) {
  return issueCredential({
    claims,
    issuerPrivateKeyJwk: issuerKeyPair.privateKeyJwk,
    kid: issuerKeyPair.kid,
    issuer: "https://issuer.hotelverify.test",
    subject: "guest-test",
    holderPublicKeyJwk,
    expiresInSeconds: 3600,
    credentialId: crypto.randomUUID(),
  });
}

async function buildPresentation({ credentialJwt, disclosures, privateKey, nonce, hotelId, iat }) {
  let builder = new SignJWT({ nonce, aud: hotelId }).setProtectedHeader({ alg: "ES256" });
  builder = iat ? builder.setIssuedAt(iat) : builder.setIssuedAt();
  const kbJwt = await builder.sign(privateKey);
  return [credentialJwt, ...disclosures.map((d) => d.disclosure), kbJwt].join("~");
}

let hotelA, hotelB, roomA, staffA, staffAToken, staffB, staffBToken, guest, guestToken, platformAdmin, adminToken;
const trackedGuestIds = [];

// Each call needs its own date range — room_availability's composite PK
// (room_id, stay_date) means two bookings for the same room on
// overlapping dates collide (by design, Section 9.5), and this file
// creates many bookings against the same seeded room.
let bookingDateOffset = 0;
async function createReservedBooking() {
  bookingDateOffset += 2;
  const checkIn = new Date(Date.UTC(2028, 0, 10 + bookingDateOffset)).toISOString().slice(0, 10);
  const checkOut = new Date(Date.UTC(2028, 0, 11 + bookingDateOffset)).toISOString().slice(0, 10);
  const res = await request(app)
    .post("/bookings")
    .set("Authorization", `Bearer ${guestToken}`)
    .send({ hotelId: hotelA, roomId: roomA, checkIn, checkOut });
  if (res.status !== 201) throw new Error(`booking failed: ${JSON.stringify(res.body)}`);
  return res.body.booking.id;
}

beforeAll(async () => {
  issuerKeyPair = await generateIssuerKeyPair();
  await startFakeIssuer();
  const redis = await ensureConnected();
  await redis.del("issuer:jwks");
  await redis.del("issuer:revocations");

  hotelA = await createHotel("Checkin Test Hotel A", "Bengaluru");
  hotelB = await createHotel("Checkin Test Hotel B", "Bengaluru");
  roomA = await createRoom(hotelA, "701");

  staffA = await createUser({ email: uniqueEmail("checkin-staff-a"), role: "HOTEL_STAFF", hotelId: hotelA });
  staffB = await createUser({ email: uniqueEmail("checkin-staff-b"), role: "HOTEL_STAFF", hotelId: hotelB });
  guest = await createUser({ email: uniqueEmail("checkin-guest"), role: "GUEST" });
  platformAdmin = await createUser({ email: uniqueEmail("checkin-admin"), role: "PLATFORM_ADMIN" });

  staffAToken = (await request(app).post("/auth/login").send({ email: staffA.email, password: staffA.password })).body
    .accessToken;
  staffBToken = (await request(app).post("/auth/login").send({ email: staffB.email, password: staffB.password })).body
    .accessToken;
  guestToken = (await request(app).post("/auth/login").send({ email: guest.email, password: guest.password })).body
    .accessToken;
  adminToken = (await request(app).post("/auth/login").send({ email: platformAdmin.email, password: platformAdmin.password }))
    .body.accessToken;
});

afterAll(async () => {
  await new Promise((resolve) => fakeIssuerServer.close(resolve));
  const redis = await ensureConnected();
  await redis.quit();
  await deleteHotel(hotelA);
  await deleteHotel(hotelB);
  await deleteUser(guest.id);
  await deleteUser(platformAdmin.id);
  for (const id of trackedGuestIds) await deleteUser(id);
  await pool.end();
});

describe("POST /checkin/sessions", () => {
  it("creates a session for a reserved booking at the caller's own hotel", async () => {
    const bookingId = await createReservedBooking();
    const res = await request(app)
      .post("/checkin/sessions")
      .set("Authorization", `Bearer ${staffAToken}`)
      .send({ bookingId });

    expect(res.status).toBe(201);
    expect(res.body.hotelId).toBe(hotelA);
    expect(typeof res.body.nonce).toBe("string");
    expect(res.body.qrUrl).toContain(res.body.sessionId);
    expect(res.body.qrImageDataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it("404s a booking belonging to a different hotel", async () => {
    const bookingId = await createReservedBooking();
    const res = await request(app)
      .post("/checkin/sessions")
      .set("Authorization", `Bearer ${staffBToken}`)
      .send({ bookingId });
    expect(res.status).toBe(404);
  });

  it("rejects a GUEST token", async () => {
    const res = await request(app)
      .post("/checkin/sessions")
      .set("Authorization", `Bearer ${guestToken}`)
      .send({ bookingId: "00000000-0000-0000-0000-000000000000" });
    expect(res.status).toBe(403);
  });
});

describe("GET /checkin/sessions/:id — tenant isolation", () => {
  it("404s for staff of a different hotel", async () => {
    const bookingId = await createReservedBooking();
    const session = await request(app)
      .post("/checkin/sessions")
      .set("Authorization", `Bearer ${staffAToken}`)
      .send({ bookingId });

    const res = await request(app)
      .get(`/checkin/sessions/${session.body.sessionId}`)
      .set("Authorization", `Bearer ${staffBToken}`);
    expect(res.status).toBe(404);
  });

  it("keeps returning a working QR image on every poll while PENDING, not just in the initial POST response", async () => {
    const bookingId = await createReservedBooking();
    const created = await request(app)
      .post("/checkin/sessions")
      .set("Authorization", `Bearer ${staffAToken}`)
      .send({ bookingId });

    // Simulates the staff screen's poll loop landing a moment after the
    // session was created — this used to come back with no QR fields at
    // all, since GET never selected/returned them (only POST did).
    const polled = await request(app)
      .get(`/checkin/sessions/${created.body.sessionId}`)
      .set("Authorization", `Bearer ${staffAToken}`);

    expect(polled.body.qrImageDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(polled.body.qrUrl).toBe(created.body.qrUrl);
  });
});

describe("POST /checkin/sessions/:id/present — happy path", () => {
  it("verifies a presentation, creates a guest_register row, and lets staff see only the disclosed claims", async () => {
    const device = await makeDeviceKeyPair();
    const { jwt, disclosures } = await issueTestCredential({
      holderPublicKeyJwk: device.publicKeyJwk,
      claims: { fullName: "Priya Nair", idType: "AADHAAR", idLast4: "1234", nationality: "IN", dateOfBirth: "1998-11-22" },
    });
    const shared = selectDisclosures(disclosures, ["fullName", "idType", "idLast4", "nationality"]);

    const bookingId = await createReservedBooking();
    const session = (
      await request(app).post("/checkin/sessions").set("Authorization", `Bearer ${staffAToken}`).send({ bookingId })
    ).body;

    const presentation = await buildPresentation({
      credentialJwt: jwt,
      disclosures: shared,
      privateKey: device.privateKey,
      nonce: session.nonce,
      hotelId: session.hotelId,
    });

    const presentRes = await request(app)
      .post(`/checkin/sessions/${session.sessionId}/present`)
      .send({ presentation, hotelId: session.hotelId });

    expect(presentRes.status).toBe(200);
    expect(presentRes.body.status).toBe("VERIFIED");
    expect(presentRes.body.claims).toEqual({
      fullName: "Priya Nair",
      idType: "AADHAAR",
      idLast4: "1234",
      nationality: "IN",
    });
    expect(presentRes.body.claims.dateOfBirth).toBeUndefined(); // not disclosed, not derivable

    const statusRes = await request(app)
      .get(`/checkin/sessions/${session.sessionId}`)
      .set("Authorization", `Bearer ${staffAToken}`);
    expect(statusRes.body.status).toBe("VERIFIED");
    expect(statusRes.body.verifiedClaims.fullName).toBe("Priya Nair");

    // booking isn't CHECKED_IN until /complete — verification and
    // check-in completion are deliberately separate steps.
    const bookingRow = await pool.query("SELECT status FROM bookings WHERE id = $1", [bookingId]);
    // bookings has RLS with a guest branch too, but this pool.query has
    // no app.hotel_id/app.guest_id set — expect it to see nothing, which
    // itself is a live confirmation RLS is still enforced by default.
    expect(bookingRow.rowCount).toBe(0);

    const completeRes = await request(app)
      .post(`/checkin/sessions/${session.sessionId}/complete`)
      .set("Authorization", `Bearer ${staffAToken}`);
    expect(completeRes.status).toBe(200);
    expect(completeRes.body.status).toBe("COMPLETED");

    // Section 8 compliance side effects: a consent record for exactly the
    // disclosed claims, and an audit_log entry — both written in the same
    // transaction as the guest_register insert, not bolted on separately.
    // consents has FORCE RLS (like bookings above), so reading it back
    // needs the same tenant-scoped transaction a real request would use.
    const consentRow = await withTenantTransaction(hotelA, (client) =>
      client.query("SELECT claims_disclosed_json, purpose, withdrawn_at FROM consents WHERE booking_id = $1", [
        bookingId,
      ])
    );
    expect(consentRow.rowCount).toBe(1);
    expect(consentRow.rows[0].claims_disclosed_json.sort()).toEqual(["fullName", "idLast4", "idType", "nationality"]);
    expect(consentRow.rows[0].withdrawn_at).toBeNull();

    const auditRow = await pool.query(
      "SELECT action, entity, entity_id FROM audit_log WHERE entity = 'checkin_session' AND entity_id = $1",
      [session.sessionId]
    );
    expect(auditRow.rowCount).toBe(1);
    expect(auditRow.rows[0].action).toBe("checkin_verified");

    // No form_c_records row for an Indian national. guest_register has
    // FORCE RLS, so — like the consents/departure_at reads above — this
    // needs a tenant-scoped transaction, not a plain pool.query (which
    // would return 0 rows regardless of whether the feature under test
    // actually works, making the assertion a false positive either way).
    const formC = await withTenantTransaction(hotelA, (client) =>
      client.query(
        `SELECT f.id FROM form_c_records f
         JOIN guest_register g ON g.id = f.guest_register_id
         WHERE g.booking_id = $1`,
        [bookingId]
      )
    );
    expect(formC.rowCount).toBe(0);

    // Checkout closes the loop the retention job needs (departure_at).
    const checkoutRes = await request(app)
      .post(`/hotel/bookings/${bookingId}/checkout`)
      .set("Authorization", `Bearer ${staffAToken}`);
    expect(checkoutRes.status).toBe(200);
    expect(checkoutRes.body.status).toBe("CHECKED_OUT");

    const registerRow = await withTenantTransaction(hotelA, (client) =>
      client.query("SELECT departure_at FROM guest_register WHERE booking_id = $1", [bookingId])
    );
    expect(registerRow.rows[0].departure_at).not.toBeNull();
  });

  it("creates a form_c_records row for a non-Indian national", async () => {
    const device = await makeDeviceKeyPair();
    const { jwt, disclosures } = await issueTestCredential({
      holderPublicKeyJwk: device.publicKeyJwk,
      claims: { fullName: "Foreign Guest", idType: "PASSPORT", idLast4: "5678", nationality: "US" },
    });
    const shared = selectDisclosures(disclosures, ["fullName", "idType", "idLast4", "nationality"]);

    const bookingId = await createReservedBooking();
    const session = (
      await request(app).post("/checkin/sessions").set("Authorization", `Bearer ${staffAToken}`).send({ bookingId })
    ).body;
    const presentation = await buildPresentation({
      credentialJwt: jwt,
      disclosures: shared,
      privateKey: device.privateKey,
      nonce: session.nonce,
      hotelId: session.hotelId,
    });

    const presentRes = await request(app)
      .post(`/checkin/sessions/${session.sessionId}/present`)
      .send({ presentation, hotelId: session.hotelId });
    expect(presentRes.status).toBe(200);

    const formC = await withTenantTransaction(hotelA, (client) =>
      client.query(
        `SELECT f.passport_no_last4 FROM form_c_records f
         JOIN guest_register g ON g.id = f.guest_register_id
         WHERE g.booking_id = $1`,
        [bookingId]
      )
    );
    expect(formC.rowCount).toBe(1);
    expect(formC.rows[0].passport_no_last4).toBe("5678");
  });

  it("missing_required_claims when the guest doesn't disclose one of the four the register needs", async () => {
    const device = await makeDeviceKeyPair();
    const { jwt, disclosures } = await issueTestCredential({
      holderPublicKeyJwk: device.publicKeyJwk,
      claims: { fullName: "No Nationality", idType: "AADHAAR", idLast4: "9999", nationality: "IN" },
    });
    const shared = selectDisclosures(disclosures, ["fullName", "idType", "idLast4"]); // nationality withheld

    const bookingId = await createReservedBooking();
    const session = (
      await request(app).post("/checkin/sessions").set("Authorization", `Bearer ${staffAToken}`).send({ bookingId })
    ).body;
    const presentation = await buildPresentation({
      credentialJwt: jwt,
      disclosures: shared,
      privateKey: device.privateKey,
      nonce: session.nonce,
      hotelId: session.hotelId,
    });

    const res = await request(app)
      .post(`/checkin/sessions/${session.sessionId}/present`)
      .send({ presentation, hotelId: session.hotelId });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("missing_required_claims");
    expect(res.body.claims).toContain("nationality");
  });
});

describe("the five replay-rejection cases (Section 9.4), through the real HTTP route", () => {
  async function setupSessionAndCredential() {
    const device = await makeDeviceKeyPair();
    const { jwt, disclosures } = await issueTestCredential({
      holderPublicKeyJwk: device.publicKeyJwk,
      claims: { fullName: "Replay Test", idType: "AADHAAR", idLast4: "5555", nationality: "IN" },
    });
    const bookingId = await createReservedBooking();
    const session = (
      await request(app).post("/checkin/sessions").set("Authorization", `Bearer ${staffAToken}`).send({ bookingId })
    ).body;
    return { device, jwt, disclosures, session };
  }

  it("1. rejects an unknown/wrong nonce", async () => {
    const { device, jwt, disclosures, session } = await setupSessionAndCredential();
    const presentation = await buildPresentation({
      credentialJwt: jwt,
      disclosures,
      privateKey: device.privateKey,
      nonce: "not-the-real-nonce",
      hotelId: session.hotelId,
    });
    const res = await request(app)
      .post(`/checkin/sessions/${session.sessionId}/present`)
      .send({ presentation, hotelId: session.hotelId });
    expect(res.status).toBe(422);
    expect(res.body.reason).toMatch(/nonce_mismatch/);
  });

  it("2. rejects a nonce that's already been consumed by an earlier presentation", async () => {
    const { device, jwt, disclosures, session } = await setupSessionAndCredential();
    const presentation = await buildPresentation({
      credentialJwt: jwt,
      disclosures,
      privateKey: device.privateKey,
      nonce: session.nonce,
      hotelId: session.hotelId,
    });

    const first = await request(app)
      .post(`/checkin/sessions/${session.sessionId}/present`)
      .send({ presentation, hotelId: session.hotelId });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post(`/checkin/sessions/${session.sessionId}/present`)
      .send({ presentation, hotelId: session.hotelId });
    expect(second.status).toBe(409);
    expect(second.body.error).toBe("session_not_pending");
  });

  it("3. rejects a hotelId/audience mismatch", async () => {
    const { device, jwt, disclosures, session } = await setupSessionAndCredential();
    const presentation = await buildPresentation({
      credentialJwt: jwt,
      disclosures,
      privateKey: device.privateKey,
      nonce: session.nonce,
      hotelId: hotelB, // signed for the wrong hotel
    });
    const res = await request(app)
      .post(`/checkin/sessions/${session.sessionId}/present`)
      .send({ presentation, hotelId: session.hotelId }); // lookup still finds the real session
    expect(res.status).toBe(422);
    expect(res.body.reason).toMatch(/audience_mismatch/);
  });

  it("4. rejects a presentation older than the 90s freshness window", async () => {
    const { device, jwt, disclosures, session } = await setupSessionAndCredential();
    const staleIat = Math.floor(Date.now() / 1000) - 200;
    const presentation = await buildPresentation({
      credentialJwt: jwt,
      disclosures,
      privateKey: device.privateKey,
      nonce: session.nonce,
      hotelId: session.hotelId,
      iat: staleIat,
    });
    const res = await request(app)
      .post(`/checkin/sessions/${session.sessionId}/present`)
      .send({ presentation, hotelId: session.hotelId });
    expect(res.status).toBe(422);
    expect(res.body.reason).toMatch(/presentation_stale/);
  });

  it("5. rejects a key-binding JWT signed by a device key that isn't the one bound to the credential", async () => {
    const { jwt, disclosures, session } = await setupSessionAndCredential();
    const impostor = await makeDeviceKeyPair();
    const presentation = await buildPresentation({
      credentialJwt: jwt,
      disclosures,
      privateKey: impostor.privateKey, // wrong key
      nonce: session.nonce,
      hotelId: session.hotelId,
    });
    const res = await request(app)
      .post(`/checkin/sessions/${session.sessionId}/present`)
      .send({ presentation, hotelId: session.hotelId });
    expect(res.status).toBe(422);
    expect(res.body.reason).toMatch(/presentation_signature_invalid/);
  });

  it("also rejects a session that's outright expired (separate from a stale presentation timestamp)", async () => {
    const { device, jwt, disclosures, session } = await setupSessionAndCredential();
    // checkin_sessions has FORCE ROW LEVEL SECURITY — a plain pool.query
    // with no app.hotel_id set would silently update 0 rows, not error,
    // so this has to go through the same tenant-scoped helper the real
    // routes use.
    await withTenantTransaction(session.hotelId, (client) =>
      client.query("UPDATE checkin_sessions SET expires_at = now() - interval '1 second' WHERE id = $1", [
        session.sessionId,
      ])
    );
    const presentation = await buildPresentation({
      credentialJwt: jwt,
      disclosures,
      privateKey: device.privateKey,
      nonce: session.nonce,
      hotelId: session.hotelId,
    });
    const res = await request(app)
      .post(`/checkin/sessions/${session.sessionId}/present`)
      .send({ presentation, hotelId: session.hotelId });
    expect(res.status).toBe(410);
    expect(res.body.error).toBe("session_expired");
  });
});

describe("revocation", () => {
  it("rejects a presentation whose credential is revoked", async () => {
    const device = await makeDeviceKeyPair();
    const credentialId = crypto.randomUUID();
    const { jwt, disclosures } = await issueCredential({
      claims: { fullName: "Revoked Guest", idType: "AADHAAR", idLast4: "6666", nationality: "IN" },
      issuerPrivateKeyJwk: issuerKeyPair.privateKeyJwk,
      kid: issuerKeyPair.kid,
      issuer: "https://issuer.hotelverify.test",
      subject: "guest-revoked",
      holderPublicKeyJwk: device.publicKeyJwk,
      expiresInSeconds: 3600,
      credentialId,
    });

    revokedIds = [credentialId];
    const redis = await ensureConnected();
    await redis.del("issuer:revocations"); // force a fresh fetch instead of a stale cached "not revoked"

    const bookingId = await createReservedBooking();
    const session = (
      await request(app).post("/checkin/sessions").set("Authorization", `Bearer ${staffAToken}`).send({ bookingId })
    ).body;
    const presentation = await buildPresentation({
      credentialJwt: jwt,
      disclosures,
      privateKey: device.privateKey,
      nonce: session.nonce,
      hotelId: session.hotelId,
    });

    const res = await request(app)
      .post(`/checkin/sessions/${session.sessionId}/present`)
      .send({ presentation, hotelId: session.hotelId });
    expect(res.status).toBe(422);
    expect(res.body.reason).toBe("credential_revoked");

    revokedIds = [];
    await redis.del("issuer:revocations");
  });
});

describe("Section 3e demo toggle: offline verification", () => {
  it("still verifies successfully using cached JWKS/revocations when live fetch is disabled", async () => {
    // Warm the cache with one real, online presentation first — the
    // revocation test just deleted issuer:revocations as part of its own
    // cleanup, so this test can't assume a previous test already
    // populated it.
    const warmupDevice = await makeDeviceKeyPair();
    const warmup = await issueTestCredential({
      holderPublicKeyJwk: warmupDevice.publicKeyJwk,
      claims: { fullName: "Cache Warmup", idType: "AADHAAR", idLast4: "0000", nationality: "IN" },
    });
    const warmupBookingId = await createReservedBooking();
    const warmupSession = (
      await request(app)
        .post("/checkin/sessions")
        .set("Authorization", `Bearer ${staffAToken}`)
        .send({ bookingId: warmupBookingId })
    ).body;
    const warmupPresentation = await buildPresentation({
      credentialJwt: warmup.jwt,
      disclosures: warmup.disclosures,
      privateKey: warmupDevice.privateKey,
      nonce: warmupSession.nonce,
      hotelId: warmupSession.hotelId,
    });
    const warmupRes = await request(app)
      .post(`/checkin/sessions/${warmupSession.sessionId}/present`)
      .send({ presentation: warmupPresentation, hotelId: warmupSession.hotelId });
    expect(warmupRes.status).toBe(200); // confirms the cache really is warm before we go offline

    const device = await makeDeviceKeyPair();
    const { jwt, disclosures } = await issueTestCredential({
      holderPublicKeyJwk: device.publicKeyJwk,
      claims: { fullName: "Offline Test", idType: "AADHAAR", idLast4: "7777", nationality: "IN" },
    });

    const toggleOn = await request(app)
      .post("/admin/network/offline")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ offline: true });
    expect(toggleOn.body.offline).toBe(true);

    try {
      const bookingId = await createReservedBooking();
      const session = (
        await request(app).post("/checkin/sessions").set("Authorization", `Bearer ${staffAToken}`).send({ bookingId })
      ).body;
      const presentation = await buildPresentation({
        credentialJwt: jwt,
        disclosures,
        privateKey: device.privateKey,
        nonce: session.nonce,
        hotelId: session.hotelId,
      });

      const res = await request(app)
        .post(`/checkin/sessions/${session.sessionId}/present`)
        .send({ presentation, hotelId: session.hotelId });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("VERIFIED");
    } finally {
      const toggleOff = await request(app)
        .post("/admin/network/offline")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ offline: false });
      expect(toggleOff.body.offline).toBe(false);
    }
  });

  it("rejects a non-admin toggling the offline flag", async () => {
    const res = await request(app)
      .post("/admin/network/offline")
      .set("Authorization", `Bearer ${staffAToken}`)
      .send({ offline: true });
    expect(res.status).toBe(403);
  });
});
