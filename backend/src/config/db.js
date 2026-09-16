'use strict';
/**
 * db.js — PostgreSQL connection pool
 * Uses pg.Pool for connection reuse across requests
 */
const { Pool } = require('pg');
const config = require('./env');
const logger = require('../utils/logger');

const poolConfig = config.db.connectionString
  ? { connectionString: config.db.connectionString }
  : {
      host:     config.db.host,
      port:     config.db.port,
      database: config.db.name,
      user:     config.db.user,
      password: config.db.password,
    };

const pool = new Pool({
  ...poolConfig,
  max: 20,                  // max pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('connect', () => {
  logger.debug('New DB client connected');
});

pool.on('error', (err) => {
  logger.error('Unexpected error on idle DB client', { error: err.message });
});

/**
 * Execute a parameterised query
 * @param {string} text - SQL query text
 * @param {Array}  params - Query parameters
 * @returns {Promise<pg.QueryResult>}
 */
async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    logger.debug('Executed query', { query: text, duration: `${duration}ms`, rows: result.rowCount });
    return result;
  } catch (err) {
    logger.error('Query error', { query: text, error: err.message });
    throw err;
  }
}

/**
 * Execute multiple queries in a single transaction
 * @param {Function} callback - Receives client; must not catch errors itself
 * @returns {Promise<any>}
 */
async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function connectDB() {
  const client = await pool.connect();
  client.release();
  logger.info('PostgreSQL connected successfully');
}

module.exports = { pool, query, withTransaction, connectDB };
