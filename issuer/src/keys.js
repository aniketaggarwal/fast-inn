const fs = require("fs");
const path = require("path");
const { generateIssuerKeyPair, buildJWKS } = require("credentials");

const KEYS_DIR = process.env.ISSUER_KEYS_DIR || path.join(__dirname, "..", "keys");
const PUBLIC_KEY_PATH = path.join(KEYS_DIR, "public.jwk.json");
const PRIVATE_KEY_PATH = path.join(KEYS_DIR, "private.jwk.json");

// Loaded once at boot and kept in memory — never a constant in source
// (Section 9.7). Supports rotation trivially: PUBLIC_KEY_PATH could become
// a directory of one file per kid, all published in the JWKS, with only
// the newest used to sign. Not implemented (no rotation has happened
// yet), but the JWKS shape already supports it (see credentials/keys.js).
let activeKeyPair = null;

function keysExist() {
  return fs.existsSync(PUBLIC_KEY_PATH) && fs.existsSync(PRIVATE_KEY_PATH);
}

async function generateAndPersistKeys() {
  const keyPair = await generateIssuerKeyPair();
  fs.mkdirSync(KEYS_DIR, { recursive: true });
  fs.writeFileSync(PUBLIC_KEY_PATH, JSON.stringify(keyPair.publicKeyJwk, null, 2));
  fs.writeFileSync(PRIVATE_KEY_PATH, JSON.stringify(keyPair.privateKeyJwk, null, 2));
  return keyPair;
}

// Called once at server boot. If keys are missing (first run, fresh
// `docker compose up`), generates and persists them with a loud log —
// convenient for a cold-start demo — rather than failing hard and forcing
// a separate manual step every time. `npm run keygen` remains available
// for generating keys explicitly ahead of time.
async function loadOrCreateKeys() {
  if (keysExist()) {
    activeKeyPair = {
      publicKeyJwk: JSON.parse(fs.readFileSync(PUBLIC_KEY_PATH, "utf8")),
      privateKeyJwk: JSON.parse(fs.readFileSync(PRIVATE_KEY_PATH, "utf8")),
    };
    activeKeyPair.kid = activeKeyPair.publicKeyJwk.kid;
    return activeKeyPair;
  }

  console.warn(`No issuer signing key found at ${KEYS_DIR} — generating one now.`);
  console.warn("Run `npm run keygen` ahead of time to avoid this on every fresh environment.");
  activeKeyPair = await generateAndPersistKeys();
  return activeKeyPair;
}

function getActiveKeyPair() {
  if (!activeKeyPair) {
    throw new Error("issuer signing key not loaded yet — call loadOrCreateKeys() at boot first");
  }
  return activeKeyPair;
}

function getJWKS() {
  return buildJWKS([getActiveKeyPair().publicKeyJwk]);
}

module.exports = {
  KEYS_DIR,
  keysExist,
  generateAndPersistKeys,
  loadOrCreateKeys,
  getActiveKeyPair,
  getJWKS,
};
