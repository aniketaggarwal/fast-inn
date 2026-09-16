const { generateKeyPair, exportJWK } = require("jose");
const { generateIssuerKeyPair } = require("../src/keys");
const {
  SDJWTError,
  issueCredential,
  selectDisclosures,
  verifyCredential,
  buildPresentation,
  decodePresentation,
  verifyPresentation,
} = require("../src/sdjwt");

async function generateHolderKeyPair() {
  const { publicKey, privateKey } = await generateKeyPair("ES256", { extractable: true });
  return { publicKeyJwk: await exportJWK(publicKey), privateKeyJwk: await exportJWK(privateKey) };
}

async function issueBoundCredential(holderPublicKeyJwk, overrides = {}) {
  const { publicKeyJwk, privateKeyJwk, kid } = await generateIssuerKeyPair();
  const issued = await issueCredential({
    claims: { fullName: "Aniket S", idLast4: "4417", nationality: "IN" },
    issuerPrivateKeyJwk: privateKeyJwk,
    kid,
    issuer: "https://issuer.hotelverify.test",
    subject: "guest-1",
    holderPublicKeyJwk,
    expiresInSeconds: 3600,
    ...overrides,
  });
  return { ...issued, issuerPublicKeyJwk: publicKeyJwk };
}

describe("buildPresentation + verifyPresentation round trip", () => {
  it("verifies a presentation signed by the credential's own bound device key", async () => {
    const holder = await generateHolderKeyPair();
    const { jwt, disclosures, issuerPublicKeyJwk } = await issueBoundCredential(holder.publicKeyJwk);
    const shared = selectDisclosures(disclosures, ["fullName", "idLast4"]);

    const now = 1_000_000;
    const presentation = await buildPresentation({
      jwt,
      disclosures: shared,
      holderPrivateKeyJwk: holder.privateKeyJwk,
      nonce: "nonce-abc",
      audience: "hotel-1",
      now,
    });

    const { claims } = await verifyPresentation({
      presentation,
      issuerPublicKeyJwk,
      expectedNonce: "nonce-abc",
      expectedAudience: "hotel-1",
      now: now + 5,
    });

    expect(claims).toEqual({ fullName: "Aniket S", idLast4: "4417" });
    expect(claims.nationality).toBeUndefined();
  });

  it("verifies with zero disclosed claims — proves possession without revealing anything", async () => {
    const holder = await generateHolderKeyPair();
    const { jwt, issuerPublicKeyJwk } = await issueBoundCredential(holder.publicKeyJwk);
    const now = 1_000_000;

    const presentation = await buildPresentation({
      jwt,
      disclosures: [],
      holderPrivateKeyJwk: holder.privateKeyJwk,
      nonce: "n1",
      audience: "hotel-1",
      now,
    });

    const { claims } = await verifyPresentation({
      presentation,
      issuerPublicKeyJwk,
      expectedNonce: "n1",
      expectedAudience: "hotel-1",
      now,
    });
    expect(claims).toEqual({});
  });
});

describe("the five replay-rejection cases (Section 9.4)", () => {
  let holder, jwt, disclosures, issuerPublicKeyJwk;

  beforeAll(async () => {
    holder = await generateHolderKeyPair();
    ({ jwt, disclosures, issuerPublicKeyJwk } = await issueBoundCredential(holder.publicKeyJwk));
  });

  async function makePresentation(overrides = {}) {
    return buildPresentation({
      jwt,
      disclosures: selectDisclosures(disclosures, ["fullName"]),
      holderPrivateKeyJwk: holder.privateKeyJwk,
      nonce: "the-real-nonce",
      audience: "hotel-1",
      now: 1_000_000,
      ...overrides,
    });
  }

  it("1. rejects an unknown/wrong nonce", async () => {
    const presentation = await makePresentation();
    await expect(
      verifyPresentation({
        presentation,
        issuerPublicKeyJwk,
        expectedNonce: "a-different-nonce",
        expectedAudience: "hotel-1",
        now: 1_000_000,
      })
    ).rejects.toThrow(/nonce_mismatch/);
  });

  it("2. a nonce reused for a second presentation is rejected by the caller's own single-use tracking, not this function", async () => {
    // verifyPresentation is stateless by design — it has no notion of
    // "already used". Single-use enforcement is Section 9.4's job for
    // whoever owns the session (api/src/routes/checkin.js), verified
    // there via the checkin_sessions status transition, not here.
    const presentation = await makePresentation();
    const first = await verifyPresentation({
      presentation,
      issuerPublicKeyJwk,
      expectedNonce: "the-real-nonce",
      expectedAudience: "hotel-1",
      now: 1_000_000,
    });
    const second = await verifyPresentation({
      presentation,
      issuerPublicKeyJwk,
      expectedNonce: "the-real-nonce",
      expectedAudience: "hotel-1",
      now: 1_000_001,
    });
    expect(first.claims).toEqual(second.claims); // both succeed at this layer — by design
  });

  it("3. rejects a hotelId/audience mismatch", async () => {
    const presentation = await makePresentation();
    await expect(
      verifyPresentation({
        presentation,
        issuerPublicKeyJwk,
        expectedNonce: "the-real-nonce",
        expectedAudience: "a-different-hotel",
        now: 1_000_000,
      })
    ).rejects.toThrow(/audience_mismatch/);
  });

  it("4. rejects a presentation older than the freshness window", async () => {
    const presentation = await makePresentation({ now: 1_000_000 });
    await expect(
      verifyPresentation({
        presentation,
        issuerPublicKeyJwk,
        expectedNonce: "the-real-nonce",
        expectedAudience: "hotel-1",
        maxAgeSeconds: 90,
        now: 1_000_000 + 91,
      })
    ).rejects.toThrow(/presentation_stale/);
  });

  it("4b. rejects a presentation timestamped implausibly in the future", async () => {
    const presentation = await makePresentation({ now: 1_000_000 });
    await expect(
      verifyPresentation({
        presentation,
        issuerPublicKeyJwk,
        expectedNonce: "the-real-nonce",
        expectedAudience: "hotel-1",
        now: 1_000_000 - 10,
      })
    ).rejects.toThrow(/presentation_stale/);
  });

  it("5. rejects a key-binding JWT signed by a device key that isn't the one bound to the credential", async () => {
    const impostorHolder = await generateHolderKeyPair();
    const presentation = await buildPresentation({
      jwt,
      disclosures: selectDisclosures(disclosures, ["fullName"]),
      holderPrivateKeyJwk: impostorHolder.privateKeyJwk, // wrong key
      nonce: "the-real-nonce",
      audience: "hotel-1",
      now: 1_000_000,
    });

    await expect(
      verifyPresentation({
        presentation,
        issuerPublicKeyJwk,
        expectedNonce: "the-real-nonce",
        expectedAudience: "hotel-1",
        now: 1_000_000,
      })
    ).rejects.toThrow(/presentation_signature_invalid/);
  });
});

describe("additional tamper/error cases", () => {
  it("rejects a credential with no key binding at all", async () => {
    const { publicKeyJwk, privateKeyJwk, kid } = await generateIssuerKeyPair();
    const holder = await generateHolderKeyPair();
    const { jwt, disclosures } = await issueCredential({
      claims: { fullName: "No Binding" },
      issuerPrivateKeyJwk: privateKeyJwk,
      kid,
      issuer: "iss",
      subject: "sub",
      expiresInSeconds: 60,
      // no holderPublicKeyJwk
    });

    const presentation = await buildPresentation({
      jwt,
      disclosures,
      holderPrivateKeyJwk: holder.privateKeyJwk,
      nonce: "n",
      audience: "hotel-1",
    });

    await expect(
      verifyPresentation({ presentation, issuerPublicKeyJwk: publicKeyJwk, expectedNonce: "n", expectedAudience: "hotel-1" })
    ).rejects.toThrow(/credential_missing_key_binding/);
  });

  it("propagates credential-level tampering (a forged disclosure string) through verifyPresentation", async () => {
    const holder = await generateHolderKeyPair();
    const { jwt, disclosures, issuerPublicKeyJwk } = await issueBoundCredential(holder.publicKeyJwk);
    // Corrupt the actual disclosure string, not just its cosmetic .value —
    // verifyCredential derives the claim from .disclosure itself (a
    // mismatched .value alone is inert, by design; see sdjwt.js).
    const tampered = disclosures.map((d) =>
      d.name === "fullName" ? { ...d, disclosure: d.disclosure.slice(0, -2) + "xx" } : d
    );

    const presentation = await buildPresentation({
      jwt,
      disclosures: tampered,
      holderPrivateKeyJwk: holder.privateKeyJwk,
      nonce: "n",
      audience: "hotel-1",
    });

    await expect(
      verifyPresentation({ presentation, issuerPublicKeyJwk, expectedNonce: "n", expectedAudience: "hotel-1" })
    ).rejects.toThrow(SDJWTError);
  });

  it("verifyCredential ignores a caller-supplied .value that disagrees with the actual .disclosure — the value always comes from the disclosure itself, never trusted separately", async () => {
    const holder = await generateHolderKeyPair();
    const { jwt, disclosures, issuerPublicKeyJwk } = await issueBoundCredential(holder.publicKeyJwk);
    const fullNameDisclosure = disclosures.find((d) => d.name === "fullName");
    const spoofedValue = { ...fullNameDisclosure, value: "Someone Else" }; // .disclosure itself is untouched

    const { claims } = await verifyCredential({
      jwt,
      disclosures: [spoofedValue],
      issuerPublicKeyJwk,
    });
    expect(claims.fullName).toBe("Aniket S"); // not "Someone Else"
  });

  it("decodePresentation rejects a malformed (unseparated) string", () => {
    expect(() => decodePresentation("not-a-real-presentation")).toThrow(/malformed_presentation/);
  });

  it("decodePresentation splits a well-formed presentation into its three parts", async () => {
    const holder = await generateHolderKeyPair();
    const { jwt, disclosures } = await issueBoundCredential(holder.publicKeyJwk);
    const shared = selectDisclosures(disclosures, ["fullName"]);
    const presentation = await buildPresentation({
      jwt,
      disclosures: shared,
      holderPrivateKeyJwk: holder.privateKeyJwk,
      nonce: "n",
      audience: "hotel-1",
    });

    const decoded = decodePresentation(presentation);
    expect(decoded.jwt).toBe(jwt);
    expect(decoded.disclosures).toHaveLength(1);
    expect(decoded.disclosures[0].name).toBe("fullName");
    expect(typeof decoded.kbJwt).toBe("string");
  });
});
