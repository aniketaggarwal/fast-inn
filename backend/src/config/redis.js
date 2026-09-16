'use strict';
/**
 * redis.js — Redis client using ioredis
 * Provides typed helpers for session/OTP/cache operations
 */
const Redis = require('ioredis');
const config = require('./env');
const logger = require('../utils/logger');

const redisOptions = config.redis.url
  ? { lazyConnect: true }
  : {};

const client = config.redis.url
  ? new Redis(config.redis.url, { ...redisOptions, maxRetriesPerRequest: 3 })
  : new Redis({ ...redisOptions, maxRetriesPerRequest: 3 });

client.on('connect', () => logger.info('Redis connected'));
client.on('error', (err) => logger.error('Redis error', { error: err.message }));
client.on('reconnecting', () => logger.warn('Redis reconnecting...'));

async function connectRedis() {
  await client.connect();
}

// ── Typed helpers ────────────────────────────────────────────

/** Set a key with TTL (seconds) */
async function setex(key, seconds, value) {
  const serialized = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return client.setex(key, seconds, serialized);
}

/** Get a key (auto-parses JSON if applicable) */
async function get(key) {
  const val = await client.get(key);
  if (val === null) return null;
  try {
    return JSON.parse(val);
  } catch {
    return val;
  }
}

/** Delete one or more keys */
async function del(...keys) {
  return client.del(...keys);
}

/** Check if key exists */
async function exists(key) {
  return (await client.exists(key)) === 1;
}

/** Get TTL of a key in seconds */
async function ttl(key) {
  return client.ttl(key);
}

/** Increment a counter (for rate limiting) */
async function incr(key) {
  return client.incr(key);
}

/** Set expiry on existing key */
async function expire(key, seconds) {
  return client.expire(key, seconds);
}

module.exports = { client, connectRedis, setex, get, del, exists, ttl, incr, expire };
