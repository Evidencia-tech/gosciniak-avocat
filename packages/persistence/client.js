'use strict';

/**
 * packages/persistence/client.js
 *
 * Database client initialisation — adapter-aware.
 *
 * Selected by environment variable:
 *   DB_ADAPTER=sqlite  (default) — uses better-sqlite3
 *   DB_ADAPTER=pg                — uses node-postgres (pg)
 *
 * Exports:
 *   getSQLiteDb() — returns the synchronous better-sqlite3 instance
 *   getPool()     — returns the shared pg Pool instance
 *
 * Only one client is initialised per process, determined at startup.
 * No route or business module should import this file directly.
 * All database access goes through packages/persistence/index.js.
 */

const ADAPTER = (process.env.DB_ADAPTER || 'sqlite').toLowerCase();

// ─── SQLite client ────────────────────────────────────────────────────────────

let _sqliteDb = null;

function getSQLiteDb() {
  if (_sqliteDb) return _sqliteDb;

  const Database = require('better-sqlite3');
  const path     = require('path');
  const fs       = require('fs');

  const DB_PATH = process.env.DB_PATH
    || path.resolve(__dirname, '../../db/evidencia.db');

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  _sqliteDb = new Database(DB_PATH);
  console.log('[persistence:sqlite] DB path:', DB_PATH);
  _sqliteDb.pragma('journal_mode = WAL');
  _sqliteDb.pragma('foreign_keys = ON');

  return _sqliteDb;
}

// ─── PostgreSQL client ────────────────────────────────────────────────────────

let _pgPool = null;

function getPool() {
  if (_pgPool) return _pgPool;

  const { Pool } = require('pg');

  _pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Explicit fallback to individual env vars if DATABASE_URL is not set
    host:     process.env.PGHOST,
    port:     process.env.PGPORT     ? parseInt(process.env.PGPORT, 10) : undefined,
    database: process.env.PGDATABASE,
    user:     process.env.PGUSER,
    password: process.env.PGPASSWORD,
    // Connection pool settings
    max:              parseInt(process.env.PG_POOL_MAX  || '10', 10),
    idleTimeoutMillis: parseInt(process.env.PG_IDLE_TIMEOUT || '30000', 10),
    connectionTimeoutMillis: parseInt(process.env.PG_CONNECT_TIMEOUT || '5000', 10),
    ssl: process.env.PGSSLMODE === 'require'
         ? { rejectUnauthorized: false }
         : undefined,
  });

  // Surface connection errors instead of silently failing
  _pgPool.on('error', (err) => {
    console.error('[evidencia:pg] Unexpected pool error:', err.message);
  });

  return _pgPool;
}

// ─── Health check ─────────────────────────────────────────────────────────────

/**
 * Verify that the database connection is alive.
 * Used by GET /ready.
 *
 * @returns {Promise<boolean>}
 */
async function checkHealth() {
  try {
    if (ADAPTER === 'pg') {
      const pool = getPool();
      await pool.query('SELECT 1');
      return true;
    } else {
      const db = getSQLiteDb();
      db.prepare('SELECT 1').get();
      return true;
    }
  } catch {
    return false;
  }
}

module.exports = { ADAPTER, getSQLiteDb, getPool, checkHealth };

