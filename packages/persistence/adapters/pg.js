'use strict';

/**
 * packages/persistence/adapters/pg.js
 *
 * PostgreSQL adapter — implements the exact same persistence interface
 * as adapters/sqlite.js, backed by the `pg` library (node-postgres).
 *
 * All functions are async — callers must await them.
 * The interface contract is identical to the SQLite adapter:
 *   proofCreate, proofFindById, proofFindByHash,
 *   keyUpsert, keyGetActive, keyGetById,
 *   verificationLogInsert
 *
 * Schema is applied via migrations/001_initial.sql before first use.
 * This adapter does NOT auto-bootstrap the schema (unlike SQLite).
 *
 * Rules:
 *   - No ORM, no query builder — raw SQL only
 *   - Pool is shared; never create per-request connections
 *   - Return plain JS objects — no pg Row objects leave this module
 *   - JSONB columns are parsed automatically by pg driver
 */

const { getPool } = require('../client');

// ─── documents ───────────────────────────────────────────────────────────────

async function documentStore(data) {
  const pool = getPool();
  await pool.query(
    `INSERT INTO documents (proof_id, encrypted_data, iv, created_at, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (proof_id) DO UPDATE SET
       encrypted_data = EXCLUDED.encrypted_data,
       iv             = EXCLUDED.iv,
       expires_at     = EXCLUDED.expires_at`,
    [
      data.proofId,
      data.encryptedData,
      data.iv,
      data.createdAt || new Date().toISOString(),
      data.expiresAt,
    ],
  );
}

async function documentFindByProofId(proofId) {
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT proof_id, encrypted_data, iv, created_at, expires_at FROM documents WHERE proof_id = $1',
    [proofId],
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    proofId:       row.proof_id,
    encryptedData: row.encrypted_data,
    iv:            row.iv,
    createdAt:     row.created_at,
    expiresAt:     row.expires_at,
  };
}

// ─── access_requests ──────────────────────────────────────────────────────────

async function accessRequestCreate(data) {
  const pool = getPool();
  await pool.query(
    `INSERT INTO access_requests (id, name, email, organization, use_case, status, approve_token, refuse_token, api_key_id, created_at)
     VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, NULL, $8)`,
    [
      data.id,
      data.name,
      data.email,
      data.organization || null,
      data.useCase,
      data.approveToken,
      data.refuseToken,
      data.createdAt || new Date().toISOString(),
    ],
  );
}

async function accessRequestFindByApproveToken(token) {
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT * FROM access_requests WHERE approve_token = $1',
    [token],
  );
  return rows.length === 0 ? null : rowToAccessRequest(rows[0]);
}

async function accessRequestFindByRefuseToken(token) {
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT * FROM access_requests WHERE refuse_token = $1',
    [token],
  );
  return rows.length === 0 ? null : rowToAccessRequest(rows[0]);
}

async function accessRequestUpdateStatus(id, status, apiKeyId) {
  const pool = getPool();
  await pool.query(
    'UPDATE access_requests SET status = $1, api_key_id = $2 WHERE id = $3',
    [status, apiKeyId || null, id],
  );
}

async function accessRequestFindAll() {
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT * FROM access_requests ORDER BY created_at DESC',
  );
  return rows.map(rowToAccessRequest);
}

function rowToAccessRequest(row) {
  return {
    id:           row.id,
    name:         row.name,
    email:        row.email,
    organization: row.organization,
    useCase:      row.use_case,
    status:       row.status,
    approveToken: row.approve_token,
    refuseToken:  row.refuse_token,
    apiKeyId:     row.api_key_id,
    createdAt:    row.created_at,
  };
}

// ─── proofs ───────────────────────────────────────────────────────────────────

/**
 * Persist a proof.
 *
 * @param {object} data
 * @param {string} data.proofId
 * @param {string} data.fileHash       — "sha256:<hex>"
 * @param {string} data.timestamp      — ISO 8601
 * @param {string} data.captureMethod
 * @param {string} data.keyId
 * @param {object} data.receipt        — full receipt object
 * @returns {Promise<object>} the receipt as stored
 */
async function proofCreate(data) {
  const pool = getPool();

  // Derive proof_mode and capture_source from captureMethod for V1 compatibility.
  // When routes pass proof_mode/capture_source explicitly, use those.
  const proofMode     = data.proofMode     || (data.captureMethod === 'demo_web' ? 'demo' : 'production');
  const captureSource = data.captureSource || data.captureMethod || 'api_hash_only';

  await pool.query(
    `INSERT INTO proofs
       (id, file_hash, algorithm, key_id, receipt, proof_mode, capture_source, metadata, created_at, api_key_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9)`,
    [
      data.proofId,
      data.fileHash,
      'sha256',
      data.keyId,
      JSON.stringify(data.receipt),   // pg stores as JSONB
      proofMode,
      captureSource,
      data.receipt.metadata ? JSON.stringify(data.receipt.metadata) : null,
      data.apiKeyId || null,
    ],
  );

  return data.receipt;
}

/**
 * Find a proof by its proofId.
 *
 * @param {string} id
 * @returns {Promise<object|null>} receipt object, or null
 */
async function proofFindById(id, apiKeyId = null) {
  const pool = getPool();
  const { rows } = apiKeyId
    ? await pool.query('SELECT receipt FROM proofs WHERE id = $1 AND api_key_id = $2', [id, apiKeyId])
    : await pool.query('SELECT receipt FROM proofs WHERE id = $1', [id]);
  if (rows.length === 0) return null;
  return rows[0].receipt;
}

/**
 * Find all proofs matching a file hash.
 * Always returns an array (may be empty).
 *
 * @param {string} hash — "sha256:<hex>"
 * @returns {Promise<object[]>} array of receipt objects, newest first
 */
async function proofFindByHash(hash) {
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT receipt FROM proofs WHERE file_hash = $1 ORDER BY created_at DESC',
    [hash],
  );
  return rows.map(r => r.receipt);
}

async function proofFindRecent(limit = 20, apiKeyId = null) {
  const pool = getPool();
  const { rows } = apiKeyId
    ? await pool.query('SELECT receipt FROM proofs WHERE api_key_id = $1 ORDER BY created_at DESC LIMIT $2', [apiKeyId, limit])
    : await pool.query('SELECT receipt FROM proofs ORDER BY created_at DESC LIMIT $1', [limit]);
  return rows.map(r => r.receipt);
}

async function proofCount(apiKeyId = null) {
  const pool = getPool();
  const { rows } = apiKeyId
    ? await pool.query('SELECT COUNT(*) AS n FROM proofs WHERE api_key_id = $1', [apiKeyId])
    : await pool.query('SELECT COUNT(*) AS n FROM proofs');
  return parseInt(rows[0].n, 10);
}

// ─── signing_keys ─────────────────────────────────────────────────────────────

/**
 * Upsert a signing key record.
 *
 * @param {object} data
 * @param {string} data.id
 * @param {string} data.publicKey   — base64
 * @param {string} [data.algorithm] — default 'ed25519'
 * @param {string} [data.status]    — default 'active'
 * @returns {Promise<object>} the key record
 */
async function keyUpsert(data) {
  const pool = getPool();
  const record = {
    id:        data.id,
    publicKey: data.publicKey,
    algorithm: data.algorithm || 'ed25519',
    status:    data.status    || 'active',
  };

  await pool.query(
    `INSERT INTO signing_keys (id, public_key, algorithm, status, created_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (id) DO UPDATE SET
       public_key = EXCLUDED.public_key,
       algorithm  = EXCLUDED.algorithm,
       status     = EXCLUDED.status`,
    [record.id, record.publicKey, record.algorithm, record.status],
  );

  return record;
}

/**
 * Get the currently active signing key.
 *
 * @returns {Promise<object|null>}
 */
async function keyGetActive() {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, public_key, algorithm, status, created_at
     FROM signing_keys
     WHERE status = 'active'
     ORDER BY created_at DESC
     LIMIT 1`,
  );
  if (rows.length === 0) return null;
  return rowToKey(rows[0]);
}

/**
 * Find a signing key by its id.
 *
 * @param {string} kid
 * @returns {Promise<object|null>}
 */
async function keyGetById(kid) {
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT id, public_key, algorithm, status, created_at FROM signing_keys WHERE id = $1',
    [kid],
  );
  if (rows.length === 0) return null;
  return rowToKey(rows[0]);
}

// ─── verification_log ─────────────────────────────────────────────────────────

/**
 * Insert a verification log entry.
 *
 * @param {object} data
 * @param {string|null} data.proofId
 * @param {string|null} data.submittedHash
 * @param {string}      data.result
 * @param {object|null} data.checks
 * @param {string|null} data.verificationMode
 * @param {string|null} data.ipHash
 * @returns {Promise<void>}
 */
async function verificationLogInsert(data) {
  const pool = getPool();
  await pool.query(
    `INSERT INTO verification_log
       (proof_id, submitted_hash, result, checks, verification_mode, ip_hash, verified_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [
      data.proofId          || null,
      data.submittedHash    || null,
      data.result,
      data.checks           ? JSON.stringify(data.checks) : null,
      data.verificationMode || null,
      data.ipHash           || null,
    ],
  );
}

// ─── api_keys ─────────────────────────────────────────────────────────────

async function apiKeyCreate(data) {
  const pool = getPool();
  await pool.query(
    `INSERT INTO api_keys (id, key_hash, label, environment, status, created_at)
     VALUES ($1, $2, $3, $4, 'active', NOW())`,
    [data.id, data.keyHash, data.label || null, data.environment || 'live'],
  );
  return {
    id:          data.id,
    keyHash:     data.keyHash,
    label:       data.label || null,
    environment: data.environment || 'live',
    status:      'active',
    createdAt:   new Date(),
    lastUsedAt:  null,
  };
}

async function apiKeyFindAllActive() {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, key_hash, label, environment, status, created_at, last_used_at
     FROM api_keys WHERE status = 'active'`,
  );
  return rows.map(rowToApiKey);
}

async function apiKeyFindById(id) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, key_hash, label, environment, status, created_at, last_used_at
     FROM api_keys WHERE id = $1`,
    [id],
  );
  if (rows.length === 0) return null;
  return rowToApiKey(rows[0]);
}

async function apiKeyTouchLastUsed(id) {
  const pool = getPool();
  await pool.query('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [id]);
}

async function apiKeyRevoke(id) {
  const pool = getPool();
  await pool.query(`UPDATE api_keys SET status = 'revoked' WHERE id = $1`, [id]);
}

async function apiKeyFindAllWithStats() {
  const pool = getPool();
  const { rows } = await pool.query(`
    SELECT ak.id, ak.key_hash, ak.label, ak.environment, ak.status,
           ak.created_at, ak.last_used_at, COUNT(p.id)::int AS proof_count,
           ar.name AS requester_name, ar.email AS requester_email,
           ar.organization AS requester_organization
    FROM api_keys ak
    LEFT JOIN proofs p ON p.api_key_id = ak.id
    LEFT JOIN access_requests ar ON ar.api_key_id = ak.id AND ar.status = 'approved'
    WHERE ak.status = 'active'
    GROUP BY ak.id, ar.name, ar.email, ar.organization
    ORDER BY ak.created_at DESC
  `);
  return rows.map(row => ({
    ...rowToApiKey(row),
    proofCount:            row.proof_count,
    requesterName:         row.requester_name         || null,
    requesterEmail:        row.requester_email        || null,
    requesterOrganization: row.requester_organization || null,
  }));
}

function rowToApiKey(row) {
  return {
    id:          row.id,
    keyHash:     row.key_hash,
    label:       row.label,
    environment: row.environment,
    status:      row.status,
    createdAt:   row.created_at,
    lastUsedAt:  row.last_used_at,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rowToKey(row) {
  return {
    id:        row.id,
    publicKey: row.public_key,
    algorithm: row.algorithm,
    status:    row.status,
    createdAt: row.created_at,
  };
}

module.exports = {
  documentStore,
  documentFindByProofId,
  accessRequestCreate,
  accessRequestFindByApproveToken,
  accessRequestFindByRefuseToken,
  accessRequestUpdateStatus,
  accessRequestFindAll,
  proofCreate,
  proofFindById,
  proofFindByHash,
  proofFindRecent,
  proofCount,
  keyUpsert,
  keyGetActive,
  keyGetById,
  verificationLogInsert,
  apiKeyCreate,
  apiKeyFindAllActive,
  apiKeyFindAllWithStats,
  apiKeyFindById,
  apiKeyTouchLastUsed,
  apiKeyRevoke,
};
