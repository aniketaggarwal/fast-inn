// The guest app generates its own keypair on first run (Section 3c). Its
// public half is embedded in the credential as cnf.jwk at issuance; the
// private half is generated non-extractable and stored as a CryptoKey
// object directly via IndexedDB structured clone — the raw key bytes
// never exist anywhere JS code could read them out, even in this tab.
// Presenting a credential by actually signing with this key (proving
// whoever's presenting it holds the same device that received it) is
// Milestone 5's job; this module only covers key generation at
// issuance time.
const DB_NAME = "hotelverify-device-key";
const STORE_NAME = "keys";
const RECORD_KEY = "keypair";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet(db, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db, key, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getOrCreateDeviceKey() {
  const db = await openDb();
  const existing = await idbGet(db, RECORD_KEY);
  if (existing) return existing;

  const keyPair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, [
    "sign",
    "verify",
  ]);
  const publicKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const record = { privateKey: keyPair.privateKey, publicKeyJwk };

  await idbPut(db, RECORD_KEY, record);
  return record;
}
