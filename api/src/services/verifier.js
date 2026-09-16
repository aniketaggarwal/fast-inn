const { getJwtKid, verifyPresentation } = require("credentials");
const { getIssuerPublicKeyByKid, isCredentialRevoked } = require("./issuerClient");

class VerificationError extends Error {
  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
}

// Section 3's full presentation-verification chain, minus the parts that
// need session state (nonce single-use consumption is the caller's job —
// api/src/routes/checkin.js — since that requires a database transaction
// this stateless function doesn't have).
async function verifyGuestPresentation({ presentation, expectedNonce, expectedHotelId, maxAgeSeconds = 90 }) {
  let kid;
  try {
    kid = getJwtKid(presentation.split("~")[0]);
  } catch {
    throw new VerificationError("malformed_presentation");
  }

  let issuerPublicKeyJwk;
  try {
    issuerPublicKeyJwk = await getIssuerPublicKeyByKid(kid);
  } catch (err) {
    throw new VerificationError(`issuer_key_unavailable: ${err.message}`);
  }

  let result;
  try {
    result = await verifyPresentation({
      presentation,
      issuerPublicKeyJwk,
      expectedNonce,
      expectedAudience: expectedHotelId,
      maxAgeSeconds,
    });
  } catch (err) {
    throw new VerificationError(err.message);
  }

  const credentialId = result.credentialPayload.jti;
  if (!credentialId) {
    throw new VerificationError("credential_missing_jti");
  }

  let revoked;
  try {
    revoked = await isCredentialRevoked(credentialId);
  } catch (err) {
    // Section 3e's honest tradeoff, made explicit rather than silently
    // treating "couldn't check" the same as "not revoked": if the
    // revocation list truly can't be fetched or read from cache at all,
    // verification fails closed instead of assuming the credential is
    // still valid.
    throw new VerificationError(`revocation_check_unavailable: ${err.message}`);
  }
  if (revoked) {
    throw new VerificationError("credential_revoked");
  }

  return { claims: result.claims, credentialId, credentialPayload: result.credentialPayload };
}

module.exports = { verifyGuestPresentation, VerificationError };
