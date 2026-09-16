const { findKeyInJWKS } = require("credentials");
const { ensureConnected } = require("../redis");

const ISSUER_BASE_URL = process.env.ISSUER_BASE_URL || "http://localhost:4001";
const JWKS_CACHE_KEY = "issuer:jwks";
const JWKS_TTL_SECONDS = 60 * 60; // keys rotate rarely
const REVOCATIONS_CACHE_KEY = "issuer:revocations";
const REVOCATIONS_TTL_SECONDS = 5 * 60; // Section 3d: 5-minute cache

// Demo toggle (Section 3e: "add a demo toggle that simulates network
// loss"). Process-local and in-memory on purpose — this is for showing
// the offline-verification tradeoff live in a demo, not a real feature
// flag system.
let simulateOffline = false;
function setSimulateOffline(value) {
  simulateOffline = Boolean(value);
}
function isSimulatingOffline() {
  return simulateOffline;
}

async function cachedFetch({ cacheKey, ttlSeconds, url }) {
  const redis = await ensureConnected();

  if (!simulateOffline) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`issuer_fetch_failed_${res.status}`);
      const data = await res.json();
      await redis.set(cacheKey, JSON.stringify(data), { EX: ttlSeconds });
      return { data, source: "live" };
    } catch (err) {
      // Falls through to the cache below — Section 3e's honest tradeoff:
      // verification keeps working offline, but on cached (possibly
      // stale) data. Logged so the tradeoff is visible, not silent.
      console.warn(`issuer fetch failed (${err.message}), falling back to cache for ${cacheKey}`);
    }
  }

  const cached = await redis.get(cacheKey);
  if (!cached) {
    throw new Error(`no_cached_data_available: ${cacheKey}`);
  }
  return { data: JSON.parse(cached), source: "cache" };
}

async function getJWKS() {
  return cachedFetch({ cacheKey: JWKS_CACHE_KEY, ttlSeconds: JWKS_TTL_SECONDS, url: `${ISSUER_BASE_URL}/.well-known/jwks.json` });
}

async function getRevocations() {
  return cachedFetch({
    cacheKey: REVOCATIONS_CACHE_KEY,
    ttlSeconds: REVOCATIONS_TTL_SECONDS,
    url: `${ISSUER_BASE_URL}/revocations`,
  });
}

async function getIssuerPublicKeyByKid(kid) {
  const { data: jwks } = await getJWKS();
  const key = findKeyInJWKS(jwks, kid);
  if (!key) {
    throw new Error(`unknown_kid: ${kid}`);
  }
  return key;
}

async function isCredentialRevoked(credentialId) {
  const { data } = await getRevocations();
  return data.revokedIds.includes(credentialId);
}

module.exports = {
  getJWKS,
  getRevocations,
  getIssuerPublicKeyByKid,
  isCredentialRevoked,
  setSimulateOffline,
  isSimulatingOffline,
};
