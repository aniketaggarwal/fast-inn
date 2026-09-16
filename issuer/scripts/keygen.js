// npm run keygen — generates the issuer's Ed25519 signing key and writes
// it to issuer/keys/ (gitignored). Section 9.7: never a constant in
// source, and this file must never be committed.
const { keysExist, generateAndPersistKeys, KEYS_DIR } = require("../src/keys");

(async () => {
  if (keysExist()) {
    console.log(`Issuer signing key already exists at ${KEYS_DIR} — not overwriting.`);
    console.log("Delete issuer/keys/*.jwk.json first if you really want a fresh key.");
    return;
  }

  const { kid } = await generateAndPersistKeys();
  console.log(`Generated issuer signing key (kid: ${kid}) at ${KEYS_DIR}`);
})().catch((err) => {
  console.error("Key generation failed:", err);
  process.exit(1);
});
