import { SignJWT } from "jose";

// Compact SD-JWT+KB presentation format: <credential JWT>~<disclosure
// 1>~...~<disclosure N>~<key-binding JWT>. Matches
// packages/credentials/src/sdjwt.js's buildPresentation/decodePresentation
// exactly — duplicated here, deliberately small, rather than importing
// that package: its module also pulls in Node's `crypto` at the top level
// for issuance/hashing, which doesn't bundle for a browser target. This
// file only needs `jose` (browser-safe) and string joining, so it stays
// self-contained instead of fighting Vite over a Node built-in it doesn't
// even use.
const SEPARATOR = "~";

// privateKey: the non-extractable device CryptoKey from
// lib/deviceKey.js — jose signs with it directly via WebCrypto, without
// ever needing to read the raw key bytes out.
export async function buildPresentation({ credentialJwt, disclosures, privateKey, nonce, hotelId }) {
  const kbJwt = await new SignJWT({ nonce, aud: hotelId })
    .setProtectedHeader({ alg: "ES256" })
    .setIssuedAt()
    .sign(privateKey);

  return [credentialJwt, ...disclosures.map((d) => d.disclosure), kbJwt].join(SEPARATOR);
}
