const { SignJWT, importJWK } = require("jose");
const { generateIssuerKeyPair } = require("../src/keys");
const {
  SDJWTError,
  issueCredential,
  selectDisclosures,
  verifyCredential,
  makeDisclosure,
  decodeDisclosure,
  digestDisclosure,
  getJwtKid,
} = require("../src/sdjwt");

const CLAIMS = {
  fullName: "Aniket S",
  dateOfBirth: "2003-05-14",
  isAdult: true,
  nationality: "IN",
  idType: "PASSPORT",
  idLast4: "4417",
};

async function issueTestCredential(overrides = {}) {
  const { publicKeyJwk, privateKeyJwk, kid } = await generateIssuerKeyPair();
  const issued = await issueCredential({
    claims: CLAIMS,
    issuerPrivateKeyJwk: privateKeyJwk,
    kid,
    issuer: "https://issuer.hotelverify.test",
    subject: "guest-123",
    expiresInSeconds: 3600,
    ...overrides,
  });
  return { ...issued, publicKeyJwk, privateKeyJwk, kid };
}

describe("issueCredential + verifyCredential round trip", () => {
  it("verifies a full-disclosure presentation and returns every claim", async () => {
    const { jwt, disclosures, publicKeyJwk } = await issueTestCredential();

    const { claims, payload } = await verifyCredential({
      jwt,
      disclosures,
      issuerPublicKeyJwk: publicKeyJwk,
    });

    expect(claims).toEqual(CLAIMS);
    expect(payload.iss).toBe("https://issuer.hotelverify.test");
    expect(payload.sub).toBe("guest-123");
  });

  it("demonstrates data minimisation: a partial disclosure reveals only the selected claims", async () => {
    const { jwt, disclosures, publicKeyJwk } = await issueTestCredential();

    // The demo beat from Section 3: a domestic guest discloses only
    // fullName/isAdult/idType/idLast4 — DOB and nationality never leave
    // the wallet.
    const shared = selectDisclosures(disclosures, ["fullName", "isAdult", "idType", "idLast4"]);
    const { claims } = await verifyCredential({ jwt, disclosures: shared, issuerPublicKeyJwk: publicKeyJwk });

    expect(claims).toEqual({
      fullName: "Aniket S",
      isAdult: true,
      idType: "PASSPORT",
      idLast4: "4417",
    });
    expect(claims.dateOfBirth).toBeUndefined();
    expect(claims.nationality).toBeUndefined();
  });

  it("verifies with zero disclosures — proves the credential exists and is signed without revealing any claim", async () => {
    const { jwt, publicKeyJwk } = await issueTestCredential();
    const { claims, payload } = await verifyCredential({ jwt, disclosures: [], issuerPublicKeyJwk: publicKeyJwk });
    expect(claims).toEqual({});
    expect(payload._sd).toHaveLength(Object.keys(CLAIMS).length);
  });
});

describe("undisclosed claims are not recoverable from the JWT", () => {
  it("the payload has no field holding any claim's plaintext value — only _sd digests", async () => {
    // Not a substring search on the compact JWT string: a short value like
    // "IN" can appear inside base64url-encoded signature bytes by pure
    // chance, which would make that assertion flaky rather than
    // meaningful. Decode the actual payload object instead and check its
    // structure and digest shape directly — deterministic, no false
    // positives from coincidental byte sequences.
    const { jwt } = await issueTestCredential();
    const payloadJson = Buffer.from(jwt.split(".")[1], "base64url").toString("utf8");
    const payload = JSON.parse(payloadJson);

    expect(Object.keys(payload).sort()).toEqual(["_sd", "_sd_alg", "exp", "iat", "iss", "sub"]);
    for (const digest of payload._sd) {
      // A SHA-256 digest, base64url-encoded with no padding, is always 43
      // characters — too long to collide with any of this test's short
      // plaintext claim values, and it's what makes it a digest and not a
      // value in the first place.
      expect(digest).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(Object.values(CLAIMS).map(String)).not.toContain(digest);
    }
  });

  it("the payload's _sd array holds exactly one digest per claim, no more information than that", async () => {
    const { jwt, publicKeyJwk } = await issueTestCredential();
    const { payload } = await verifyCredential({ jwt, disclosures: [], issuerPublicKeyJwk: publicKeyJwk });
    expect(payload._sd).toHaveLength(Object.keys(CLAIMS).length);
    expect(new Set(payload._sd).size).toBe(Object.keys(CLAIMS).length); // all distinct
  });
});

describe("tamper resistance", () => {
  it("rejects a disclosure whose value was changed after issuance", async () => {
    const { jwt, disclosures, publicKeyJwk } = await issueTestCredential();
    const tampered = disclosures.map((d) =>
      d.name === "isAdult" ? { ...decodeDisclosure(makeDisclosure("isAdult", false).disclosure) } : d
    );

    await expect(
      verifyCredential({ jwt, disclosures: tampered, issuerPublicKeyJwk: publicKeyJwk })
    ).rejects.toThrow(SDJWTError);
    await expect(
      verifyCredential({ jwt, disclosures: tampered, issuerPublicKeyJwk: publicKeyJwk })
    ).rejects.toThrow(/disclosure_not_in_credential/);
  });

  it("rejects a disclosure string edited byte-for-byte (not just re-derived)", async () => {
    const { jwt, disclosures, publicKeyJwk } = await issueTestCredential();
    const [first, ...rest] = disclosures;
    const corrupted = { ...first, disclosure: first.disclosure.slice(0, -2) + "xx" };

    await expect(
      verifyCredential({ jwt, disclosures: [corrupted, ...rest], issuerPublicKeyJwk: publicKeyJwk })
    ).rejects.toThrow(SDJWTError);
  });

  it("rejects a JWT whose signature was flipped", async () => {
    const { jwt, disclosures, publicKeyJwk } = await issueTestCredential();
    const parts = jwt.split(".");
    const flippedChar = parts[2][0] === "A" ? "B" : "A";
    parts[2] = flippedChar + parts[2].slice(1);
    const tamperedJwt = parts.join(".");

    await expect(
      verifyCredential({ jwt: tamperedJwt, disclosures, issuerPublicKeyJwk: publicKeyJwk })
    ).rejects.toThrow(SDJWTError);
  });

  it("rejects a JWT whose payload was edited (e.g. to add a forged digest)", async () => {
    const { jwt, disclosures, publicKeyJwk } = await issueTestCredential();
    const [header, payload, signature] = jwt.split(".");
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    decoded._sd.push("forged-digest-not-signed-by-issuer");
    const forgedPayload = Buffer.from(JSON.stringify(decoded)).toString("base64url");
    const forgedJwt = `${header}.${forgedPayload}.${signature}`;

    await expect(
      verifyCredential({ jwt: forgedJwt, disclosures, issuerPublicKeyJwk: publicKeyJwk })
    ).rejects.toThrow(SDJWTError);
  });

  it("rejects a credential verified against a different issuer's public key", async () => {
    const { jwt, disclosures } = await issueTestCredential();
    const impostor = await generateIssuerKeyPair();

    await expect(
      verifyCredential({ jwt, disclosures, issuerPublicKeyJwk: impostor.publicKeyJwk })
    ).rejects.toThrow(SDJWTError);
  });
});

describe("expiry", () => {
  it("rejects a credential presented after its expiry", async () => {
    const issuedAt = 1_000_000;
    const { jwt, disclosures, publicKeyJwk } = await issueTestCredential({
      now: issuedAt,
      expiresInSeconds: 60,
    });

    await expect(
      verifyCredential({ jwt, disclosures, issuerPublicKeyJwk: publicKeyJwk, now: issuedAt + 61 })
    ).rejects.toThrow(SDJWTError);
  });

  it("accepts a credential presented just before its expiry", async () => {
    const issuedAt = 1_000_000;
    const { jwt, disclosures, publicKeyJwk } = await issueTestCredential({
      now: issuedAt,
      expiresInSeconds: 60,
    });

    await expect(
      verifyCredential({ jwt, disclosures, issuerPublicKeyJwk: publicKeyJwk, now: issuedAt + 59 })
    ).resolves.toBeDefined();
  });
});

describe("key binding (cnf.jwk)", () => {
  it("embeds the holder's device public key when provided at issuance", async () => {
    const holderKey = await generateIssuerKeyPair(); // reuse as a stand-in device key
    const { jwt, publicKeyJwk } = await issueTestCredential({ holderPublicKeyJwk: holderKey.publicKeyJwk });

    const { payload } = await verifyCredential({ jwt, disclosures: [], issuerPublicKeyJwk: publicKeyJwk });
    expect(payload.cnf.jwk.kid).toBe(holderKey.kid);
  });

  it("has no cnf claim when no holder key is provided", async () => {
    const { jwt, publicKeyJwk } = await issueTestCredential();
    const { payload } = await verifyCredential({ jwt, disclosures: [], issuerPublicKeyJwk: publicKeyJwk });
    expect(payload.cnf).toBeUndefined();
  });
});

describe("input validation", () => {
  it("rejects an empty claims object", async () => {
    const { privateKeyJwk, kid } = await generateIssuerKeyPair();
    await expect(
      issueCredential({
        claims: {},
        issuerPrivateKeyJwk: privateKeyJwk,
        kid,
        issuer: "iss",
        subject: "sub",
        expiresInSeconds: 60,
      })
    ).rejects.toThrow(SDJWTError);
  });

  it("rejects a non-object claims value", async () => {
    const { privateKeyJwk, kid } = await generateIssuerKeyPair();
    await expect(
      issueCredential({
        claims: ["not", "an", "object"],
        issuerPrivateKeyJwk: privateKeyJwk,
        kid,
        issuer: "iss",
        subject: "sub",
        expiresInSeconds: 60,
      })
    ).rejects.toThrow(SDJWTError);
  });

  it("rejects a zero or negative expiresInSeconds", async () => {
    const { privateKeyJwk, kid } = await generateIssuerKeyPair();
    await expect(
      issueCredential({
        claims: { a: 1 },
        issuerPrivateKeyJwk: privateKeyJwk,
        kid,
        issuer: "iss",
        subject: "sub",
        expiresInSeconds: 0,
      })
    ).rejects.toThrow(SDJWTError);
  });

  it("rejects a credential missing _sd/_sd_alg entirely (not one this library issued)", async () => {
    const { privateKeyJwk, publicKeyJwk, kid } = await generateIssuerKeyPair();
    const privateKey = await importJWK(privateKeyJwk, "EdDSA");
    const foreignJwt = await new SignJWT({ hello: "world" })
      .setProtectedHeader({ alg: "EdDSA", kid })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(privateKey);

    await expect(
      verifyCredential({ jwt: foreignJwt, disclosures: [], issuerPublicKeyJwk: publicKeyJwk })
    ).rejects.toThrow(/credential_missing_sd_claims/);
  });
});

describe("selectDisclosures", () => {
  it("returns only disclosures matching the requested claim names, in original order", async () => {
    const { disclosures } = await issueTestCredential();
    const selected = selectDisclosures(disclosures, ["idLast4", "fullName"]);
    expect(selected.map((d) => d.name)).toEqual(["fullName", "idLast4"]);
  });

  it("ignores claim names that don't exist on the credential", async () => {
    const { disclosures } = await issueTestCredential();
    const selected = selectDisclosures(disclosures, ["fullName", "passportNumber"]);
    expect(selected.map((d) => d.name)).toEqual(["fullName"]);
  });

  it("returns an empty array when nothing is selected", async () => {
    const { disclosures } = await issueTestCredential();
    expect(selectDisclosures(disclosures, [])).toEqual([]);
  });
});

describe("disclosure primitives", () => {
  it("decodeDisclosure inverts makeDisclosure", () => {
    const made = makeDisclosure("nationality", "IN");
    const decoded = decodeDisclosure(made.disclosure);
    expect(decoded.salt).toBe(made.salt);
    expect(decoded.name).toBe("nationality");
    expect(decoded.value).toBe("IN");
  });

  it("digestDisclosure is deterministic for the same input", () => {
    const disclosure = makeDisclosure("nationality", "IN").disclosure;
    expect(digestDisclosure(disclosure)).toBe(digestDisclosure(disclosure));
  });

  it("two disclosures for the same name/value get different salts and different digests", () => {
    const a = makeDisclosure("nationality", "IN");
    const b = makeDisclosure("nationality", "IN");
    expect(a.salt).not.toBe(b.salt);
    expect(digestDisclosure(a.disclosure)).not.toBe(digestDisclosure(b.disclosure));
  });
});

describe("getJwtKid", () => {
  it("reads the kid a verifier would use to pick the right JWKS entry", async () => {
    const { jwt, kid } = await issueTestCredential();
    expect(getJwtKid(jwt)).toBe(kid);
  });
});
