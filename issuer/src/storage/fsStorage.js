const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

// Filesystem-backed drop-in for storage/s3.js, selected with
// STORAGE_DRIVER=fs (the one-container deployment, scripts/serve.js). MinIO
// no longer publishes binaries, and bundling a third-party object store just
// to hold images for the few seconds between upload and credential issuance
// (Section 9.6 deletes them right after) isn't worth the dependency.
//
// The security model is the same as the S3 one: nothing is public, and every
// access is a short-lived URL for one specific operation on one specific key
// — here an HMAC over (operation, key, expiry) instead of a SigV4 signature.
// routes/storage.js verifies it before touching the disk.
const DIR = process.env.STORAGE_DIR || path.join(os.tmpdir(), "hotelverify-storage");
const URL_PREFIX = process.env.STORAGE_URL_PREFIX || "";
// Random per boot unless pinned: signed URLs live for seconds, so losing them
// on restart costs nothing.
const SECRET = process.env.STORAGE_SIGNING_SECRET || crypto.randomBytes(32).toString("hex");

// The only shape newObjectKey() ever produces. Enforced on every access so a
// crafted key can never traverse out of DIR.
const KEY_RE = /^kyc\/(docs|selfies)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/;

function assertKey(key) {
  if (!KEY_RE.test(key)) throw new Error("invalid_storage_key");
}

const fileFor = (key) => path.join(DIR, ...key.split("/"));

function sign(op, key, expires) {
  return crypto.createHmac("sha256", SECRET).update(`${op}\n${key}\n${expires}`).digest("hex");
}

// Constant-time check; also rejects expired and malformed input.
function verifySignature(op, key, expires, signature) {
  if (!KEY_RE.test(key) || !/^\d+$/.test(String(expires)) || Number(expires) < Math.floor(Date.now() / 1000)) return false;
  const expected = Buffer.from(sign(op, key, expires));
  const given = Buffer.from(String(signature));
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

function presignedUrl(op, key, expiresInSeconds, origin) {
  assertKey(key);
  const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const base = origin || `http://localhost:${process.env.PORT || 4001}`;
  const query = new URLSearchParams({ op, key, expires: String(expires), sig: sign(op, key, expires) });
  return `${base}${URL_PREFIX}/storage/object?${query}`;
}

const BUCKET = "local-fs";

async function ensureBucket() {
  fs.mkdirSync(DIR, { recursive: true });
}

function newObjectKey(prefix, extension) {
  return `${prefix}/${crypto.randomUUID()}.${extension}`;
}

async function presignedPutUrl(key, contentType, expiresInSeconds = 300, origin = null) {
  return presignedUrl("put", key, expiresInSeconds, origin);
}

async function presignedGetUrl(key, expiresInSeconds = 60, origin = null) {
  return presignedUrl("get", key, expiresInSeconds, origin);
}

async function putObjectBuffer(key, buffer) {
  assertKey(key);
  fs.mkdirSync(path.dirname(fileFor(key)), { recursive: true });
  await fs.promises.writeFile(fileFor(key), buffer);
}

async function getObjectBuffer(key) {
  assertKey(key);
  return fs.promises.readFile(fileFor(key));
}

async function deleteObject(key) {
  assertKey(key);
  await fs.promises.rm(fileFor(key), { force: true });
}

async function objectExists(key) {
  try {
    assertKey(key);
    await fs.promises.access(fileFor(key));
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  BUCKET,
  ensureBucket,
  newObjectKey,
  presignedPutUrl,
  presignedGetUrl,
  putObjectBuffer,
  getObjectBuffer,
  deleteObject,
  objectExists,
  verifySignature,
};
