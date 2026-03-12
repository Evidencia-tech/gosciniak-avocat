'use strict';

/**
 * packages/persistence/index.js
 *
 * The stable persistence interface for the Evidencia application.
 *
 * This is the ONLY file routes and business modules should import.
 * The underlying adapter (SQLite or PostgreSQL) is an internal detail,
 * selected by the DB_ADAPTER environment variable.
 *
 *   DB_ADAPTER=sqlite  (default) -- uses better-sqlite3
 *   DB_ADAPTER=pg                -- uses node-postgres
 *
 * All interface methods return Promises -- callers must await them.
 * This is consistent regardless of which adapter is active.
 *
 * Interface contract:
 *
 *   proofs.create(data)          -> Promise<receipt>
 *   proofs.findById(id)          -> Promise<receipt | null>
 *   proofs.findByHash(hash)      -> Promise<receipt[]>   (always an array)
 *
 *   keys.getActive()             -> Promise<signingKey | null>
 *   keys.getById(kid)            -> Promise<signingKey | null>
 *   keys.upsert(data)            -> Promise<signingKey>
 *
 *   verificationLog.insert(data) -> Promise<void>
 *
 * Swapping adapters requires only a change to DB_ADAPTER env var.
 * No route or business package needs to change.
 */

const { ADAPTER } = require('./client');

// Select the adapter once at module load time
const adapter = ADAPTER === 'pg'
  ? require('./adapters/pg')
  : require('./adapters/sqlite');

// ---- proofs ------------------------------------------------------------------

const proofs = {
  /**
   * Persist a new proof.
   * @param {object} data
   * @param {string} data.proofId
   * @param {string} data.fileHash       "sha256:<hex>"
   * @param {string} data.timestamp      ISO 8601
   * @param {string} data.captureMethod
   * @param {string} data.keyId
   * @param {object} data.receipt        full receipt object
   * @returns {Promise<object>} the persisted receipt
   */
  async create(data) {
    return adapter.proofCreate(data);
  },

  /**
   * Find a proof by its unique proofId.
   * @param {string} id  "prf_<ULID>"
   * @returns {Promise<object|null>}
   */
  async findById(id) {
    return adapter.proofFindById(id);
  },

  /**
   * Find all proofs matching a file hash.
   * Always returns an array -- the same file may be certified multiple times.
   * @param {string} hash  "sha256:<hex>"
   * @returns {Promise<object[]>} newest first, may be empty
   */
  async findByHash(hash) {
    return adapter.proofFindByHash(hash);
  },
};

// ---- keys --------------------------------------------------------------------

const keys = {
  /**
   * Get the currently active signing key.
   * @returns {Promise<{id, publicKey, algorithm, status, createdAt}|null>}
   */
  async getActive() {
    return adapter.keyGetActive();
  },

  /**
   * Find a signing key by its id.
   * Rotated keys must remain retrievable for historical verification.
   * @param {string} kid
   * @returns {Promise<{id, publicKey, algorithm, status, createdAt}|null>}
   */
  async getById(kid) {
    return adapter.keyGetById(kid);
  },

  /**
   * Insert or update a signing key record.
   * @param {object} data
   * @param {string} data.id
   * @param {string} data.publicKey   base64
   * @param {string} [data.algorithm] default 'ed25519'
   * @param {string} [data.status]    default 'active'
   * @returns {Promise<{id, publicKey, algorithm, status, createdAt}>}
   */
  async upsert(data) {
    return adapter.keyUpsert(data);
  },
};

// ---- verificationLog ---------------------------------------------------------

const verificationLog = {
  /**
   * Record a verification attempt (append-only).
   * @param {object}      data
   * @param {string|null} data.proofId
   * @param {string|null} data.submittedHash
   * @param {string}      data.result            'valid'|'invalid'|'mismatch'|'not_found'
   * @param {object|null} data.checks
   * @param {string|null} data.verificationMode  'hash_direct'|'upload_computed'|'proof_id_only'
   * @param {string|null} data.ipHash            SHA-256 of IP, never raw IP
   * @returns {Promise<void>}
   */
  async insert(data) {
    return adapter.verificationLogInsert(data);
  },
};

module.exports = { proofs, keys, verificationLog };
