'use strict';

/**
 * packages/persistence/adapters/sqlite.js
 *
 * SQLite adapter — implements the full persistence interface backed by
 * better-sqlite3.  This is the only file in the project allowed to
 * know about the SQLite schema and column names.
 *
 * Column mapping (current schema → V1 naming used at the interface):
 *   proofs.key_id         ↔ receipt.publicKeyId (stored as keyId internally)
 *   proofs.receipt_json   ↔ full receipt object (serialised / deserialised here)
 *   signing_keys          — managed here; not yet exposed to routes (Step 5)
 *   verification_log      — managed here; not yet exposed to routes (Step 5)
 *
 * Rules:
 *   - Preserve exact current behaviour for proofs.* operations
 *   - Return plain JS objects — no SQLite row objects leave this module
 *   - proofs.findByHash always returns an array (V1 model: hash is not unique)
 */

const { getSQLiteDb } = require('../client');

// ─── Schema bootstrap ─────────────────────────────────────────────────────────
// Run once at require-time, idempotent (CREATE … IF NOT EXISTS).

const db = getSQLiteDb();

db.exec(`
  CREATE TABLE IF NOT EXISTS proofs (
    id              TEXT    PRIMARY KEY,
    file_hash       TEXT    NOT NULL,
    timestamp       TEXT    NOT NULL,
    capture_method  TEXT    NOT NULL,
    key_id          TEXT    NOT NULL,
    receipt_json    TEXT    NOT NULL,
    created_at      INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_proofs_file_hash  ON proofs(file_hash);
  CREATE INDEX IF NOT EXISTS idx_proofs_created_at ON proofs(created_at);

  CREATE TABLE IF NOT EXISTS signing_keys (
    id          TEXT    PRIMARY KEY,
    public_key  TEXT    NOT NULL,
    algorithm   TEXT    NOT NULL DEFAULT 'ed25519',
    status      TEXT    NOT NULL DEFAULT 'active',
    created_at  INTEGER NOT NULL,
    rotated_at  INTEGER
  );

  CREATE TABLE IF NOT EXISTS verification_log (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    proof_id          TEXT,
    submitted_hash    TEXT,
    result            TEXT    NOT NULL,
    checks            TEXT,
    verification_mode TEXT,
    ip_hash           TEXT,
    verified_at       INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_vlog_proof_id ON verification_log(proof_id);
  CREATE INDEX IF NOT EXISTS idx_vlog_result   ON verification_log(result);
`);

// ─── Prepared statements ──────────────────────────────────────────────────────

const stmtProofInsert = db.prepare(`
  INSERT INTO proofs (id, file_hash, timestamp, capture_method, key_id, receipt_json, created_at)
  VALUES (@id, @fileHash, @timestamp, @captureMethod, @keyId, @receiptJson, @createdAt)
`);

const stmtProofById   = db.prepare(`SELECT receipt_json FROM proofs WHERE id = ?`);

const stmtProofByHash = db.prepare(`
  SELECT receipt_json FROM proofs WHERE file_hash = ? ORDER BY created_at DESC
`);

const stmtKeyUpsert = db.prepare(`
  INSERT INTO signing_keys (id, public_key, algorithm, status, created_at)
  VALUES (@id, @publicKey, @algorithm, @status, @createdAt)
  ON CONFLICT(id) DO UPDATE SET
    public_key = excluded.public_key,
    algorithm  = excluded.algorithm,
    status     = excluded.status
`);

const stmtKeyActive = db.prepare(`
  SELECT * FROM signing_keys WHERE status = 'active' ORDER BY created_at DESC LIMIT 1
`);

const stmtKeyById = db.prepare(`SELECT * FROM signing_keys WHERE id = ?`);

const stmtLogInsert = db.prepare(`
  INSERT INTO verification_log
    (proof_id, submitted_hash, result, checks, verification_mode, ip_hash, verified_at)
  VALUES
    (@proofId, @submittedHash, @result, @checks, @verificationMode, @ipHash, @verifiedAt)
`);

// ─── proofs ───────────────────────────────────────────────────────────────────

/**
 * Persist a proof.
 * @param {object} data
 * @param {string} data.proofId
 * @param {string} data.fileHash       — "sha256:<hex>"
 * @param {string} data.timestamp      — ISO 8601
 * @param {string} data.captureMethod
 * @param {string} data.keyId          — signing key id
 * @param {object} data.receipt        — full receipt object
 * @returns {object} the receipt as stored
 */
function proofCreate(data) {
  stmtProofInsert.run({
    id:            data.proofId,
    fileHash:      data.fileHash,
    timestamp:     data.timestamp,
    captureMethod: data.captureMethod,
    keyId:         data.keyId,
    receiptJson:   JSON.stringify(data.receipt),
    createdAt:     Date.now(),
  });
  return data.receipt;
}

/**
 * Find a proof by its proofId.
 * @param {string} id
 * @returns {object|null} receipt object, or null
 */
function proofFindById(id) {
  const row = stmtProofById.get(id);
  return row ? JSON.parse(row.receipt_json) : null;
}

/**
 * Find all proofs matching a file hash.
 * Always returns an array (may be empty).
 * V1 model: the same file may be certified multiple times.
 * @param {string} hash — "sha256:<hex>"
 * @returns {object[]} array of receipt objects, newest first
 */
function proofFindByHash(hash) {
  const rows = stmtProofByHash.all(hash);
  return rows.map(r => JSON.parse(r.receipt_json));
}

// ─── signing_keys ─────────────────────────────────────────────────────────────

/**
 * Upsert a signing key record.
 * @param {object} data
 * @param {string} data.id
 * @param {string} data.publicKey   — base64
 * @param {string} [data.algorithm] — default 'ed25519'
 * @param {string} [data.status]    — default 'active'
 * @returns {object} the key record
 */
function keyUpsert(data) {
  const record = {
    id:        data.id,
    publicKey: data.publicKey,
    algorithm: data.algorithm || 'ed25519',
    status:    data.status    || 'active',
    createdAt: Date.now(),
  };
  stmtKeyUpsert.run(record);
  return record;
}

/**
 * Get the currently active signing key.
 * @returns {object|null}
 */
function keyGetActive() {
  const row = stmtKeyActive.get();
  if (!row) return null;
  return {
    id:        row.id,
    publicKey: row.public_key,
    algorithm: row.algorithm,
    status:    row.status,
    createdAt: row.created_at,
  };
}

/**
 * Find a signing key by id.
 * @param {string} kid
 * @returns {object|null}
 */
function keyGetById(kid) {
  const row = stmtKeyById.get(kid);
  if (!row) return null;
  return {
    id:        row.id,
    publicKey: row.public_key,
    algorithm: row.algorithm,
    status:    row.status,
    createdAt: row.created_at,
  };
}

// ─── verification_log ─────────────────────────────────────────────────────────

/**
 * Insert a verification log entry.
 * @param {object} data
 * @param {string|null} data.proofId
 * @param {string|null} data.submittedHash
 * @param {string}      data.result           — 'valid' | 'invalid' | 'mismatch' | 'not_found'
 * @param {object|null} data.checks
 * @param {string|null} data.verificationMode — 'hash_direct' | 'upload_computed' | 'proof_id_only'
 * @param {string|null} data.ipHash           — SHA-256 of IP, never raw IP
 */
function verificationLogInsert(data) {
  stmtLogInsert.run({
    proofId:          data.proofId          || null,
    submittedHash:    data.submittedHash     || null,
    result:           data.result,
    checks:           data.checks ? JSON.stringify(data.checks) : null,
    verificationMode: data.verificationMode || null,
    ipHash:           data.ipHash           || null,
    verifiedAt:       Date.now(),
  });
}

module.exports = {
  proofCreate,
  proofFindById,
  proofFindByHash,
  keyUpsert,
  keyGetActive,
  keyGetById,
  verificationLogInsert,
};
