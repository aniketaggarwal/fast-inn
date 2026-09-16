const crypto = require("crypto");
const { SignJWT, jwtVerify, importJWK, decodeProtectedHeader } = require("jose");

const SD_ALG = "sha-256";

class SDJWTError extends Error {}

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

// One disclosure is the triple [salt, claimName, claimValue], transmitted
// (and hashed) as base64url(JSON.stringify(triple)) — this is the IETF
// SD-JWT format (Section 3a). The salt exists so that two disclosures for
// the same name/value pair (e.g. isAdult: true on two different
// credentials) don't hash to the same digest, which would otherwise leak
// information by correlation.
function makeDisclosure(claimName, claimValue) {
  const salt = base64url(crypto.randomBytes(16));
  const disclosure = base64url(JSON.stringify([salt, claimName, claimValue]));
  return { salt, name: claimName, value: claimValue, disclosure };
}

function decodeDisclosure(disclosure) {
  const [salt, name, value] = JSON.parse(Buffer.from(disclosure, "base64url").toString("utf8"));
  return { salt, name, value, disclosure };
}

function digestDisclosure(disclosure) {
  return crypto.createHash("sha256").update(disclosure).digest("base64url");
}

// Builds the credential: a JWT whose payload holds only the *digests* of
// each claim (_sd), never the claims themselves, plus the full set of
// disclosures returned separately for the holder's wallet. Anyone who only
// sees the JWT — including this function's own caller, once it returns —
// cannot recover a claim's value from its digest.
async function issueCredential({
  claims,
  issuerPrivateKeyJwk,
  kid,
  issuer,
  subject,
  holderPublicKeyJwk,
  expiresInSeconds,
  now = Math.floor(Date.now() / 1000),
}) {
  if (!claims || typeof claims !== "object" || Array.isArray(claims) || Object.keys(claims).length === 0) {
    throw new SDJWTError("claims must be a non-empty object");
  }
  if (!Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0) {
    throw new SDJWTError("expiresInSeconds must be a positive number");
  }

  const disclosures = Object.entries(claims).map(([name, value]) => makeDisclosure(name, value));
  const sd = disclosures.map((d) => digestDisclosure(d.disclosure));

  const privateKey = await importJWK(issuerPrivateKeyJwk, "EdDSA");

  const jwt = await new SignJWT({
    _sd: sd,
    _sd_alg: SD_ALG,
    // Key binding (Section 3c): the holder's own device public key travels
    // inside the signed payload, so it can't be swapped out later. A
    // presentation is only meaningful if it's signed by the matching
    // private key — that check belongs to the presentation verifier
    // (Milestone 5), not to issuance.
    ...(holderPublicKeyJwk ? { cnf: { jwk: holderPublicKeyJwk } } : {}),
  })
    .setProtectedHeader({ alg: "EdDSA", kid, typ: "sd+jwt" })
    .setIssuer(issuer)
    .setSubject(subject)
    .setIssuedAt(now)
    .setExpirationTime(now + expiresInSeconds)
    .sign(privateKey);

  return {
    jwt,
    disclosures: disclosures.map(({ salt, name, value, disclosure }) => ({ salt, name, value, disclosure })),
  };
}

// Holder-side: narrow the full disclosure set down to what's being shared
// for one specific presentation (Section 3, the "data minimisation" demo
// beat — e.g. fullName/isAdult/idType/idLast4 and nothing else).
function selectDisclosures(disclosures, claimNames) {
  const wanted = new Set(claimNames);
  return disclosures.filter((d) => wanted.has(d.name));
}

// Verifier-side: checks the issuer's signature, then for each disclosure
// actually presented, recomputes its digest and confirms it's one of the
// digests the issuer originally signed. A disclosure whose digest isn't in
// _sd is rejected outright — it's not "unknown", it's evidence of
// tampering, so this throws rather than silently dropping it. Any claim
// never disclosed simply never appears; there is no way to derive it from
// the JWT alone, since the JWT never held anything but hashes.
async function verifyCredential({
  jwt,
  disclosures = [],
  issuerPublicKeyJwk,
  now = Math.floor(Date.now() / 1000),
}) {
  const publicKey = await importJWK(issuerPublicKeyJwk, "EdDSA");

  let payload;
  try {
    ({ payload } = await jwtVerify(jwt, publicKey, { currentDate: new Date(now * 1000) }));
  } catch (err) {
    throw new SDJWTError(`credential_invalid: ${err.message}`);
  }

  if (!Array.isArray(payload._sd) || payload._sd_alg !== SD_ALG) {
    throw new SDJWTError("credential_missing_sd_claims");
  }
  const sdSet = new Set(payload._sd);

  const claims = {};
  for (const d of disclosures) {
    const digest = digestDisclosure(d.disclosure);
    if (!sdSet.has(digest)) {
      throw new SDJWTError(`disclosure_not_in_credential: ${d.name}`);
    }
    claims[d.name] = d.value;
  }

  return { payload, claims };
}

function getJwtKid(jwt) {
  return decodeProtectedHeader(jwt).kid;
}

module.exports = {
  SDJWTError,
  issueCredential,
  selectDisclosures,
  verifyCredential,
  makeDisclosure,
  decodeDisclosure,
  digestDisclosure,
  getJwtKid,
};
