const { generateKeyPair, exportJWK, calculateJwkThumbprint } = require("jose");

// Ed25519 signing key for the issuer. Every credential is signed with this;
// the private half must never leave the issuer service (Section 9.7) — this
// function only generates and returns key material, it doesn't persist
// anything. Loading it from disk/env at boot and never hardcoding it in
// source is the issuer service's job (Milestone 4).
async function generateIssuerKeyPair() {
  const { publicKey, privateKey } = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
  const publicKeyJwk = await exportJWK(publicKey);
  const privateKeyJwk = await exportJWK(privateKey);

  // kid = the public key's own thumbprint (RFC 7638) — deterministic, so
  // two people computing it from the same public key always agree, and
  // there's nothing extra to generate or keep in sync.
  const kid = await calculateJwkThumbprint(publicKeyJwk);

  for (const jwk of [publicKeyJwk, privateKeyJwk]) {
    jwk.kid = kid;
    jwk.alg = "EdDSA";
  }
  publicKeyJwk.use = "sig";

  return { publicKeyJwk, privateKeyJwk, kid };
}

// GET /.well-known/jwks.json shape (RFC 7517). Takes a list so key
// rotation is just publishing the new key alongside the old one — a
// verifier picks whichever entry matches the kid in a given JWT's header
// (Section 9.7); nothing here forces there to be exactly one active key.
function buildJWKS(publicKeyJwks) {
  return { keys: publicKeyJwks };
}

function findKeyInJWKS(jwks, kid) {
  return jwks.keys.find((key) => key.kid === kid);
}

module.exports = { generateIssuerKeyPair, buildJWKS, findKeyInJWKS };
