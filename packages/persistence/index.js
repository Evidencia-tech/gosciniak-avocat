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
 *   apiKeys.create(data)         -> Promise<apiKey>
 *   apiKeys.findAllActive()      -> Promise<apiKey[]>
 *   apiKeys.findById(id)         -> Promise<apiKey | null>
 *   apiKeys.touchLastUsed(id)    -> Promise<void>
 *   apiKeys.revoke(id)           -> Promise<void>
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
  /**
   * @param {object} data
   * @param {string} [data.apiKeyId]  The client API key that created this proof.
   */
  async create(data) {
    return adapter.proofCreate(data);
  },

  /**
   * Find a proof by its unique proofId.
   * @param {string} id  "prf_<ULID>"
   * @param {string|null} [apiKeyId]  If provided, only return if owned by this key.
   * @returns {Promise<object|null>}
   */
  async findById(id, apiKeyId = null) {
    return adapter.proofFindById(id, apiKeyId);
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

  /**
   * Return the N most recent proofs, newest first.
   * @param {number} [limit=20]
   * @param {string|null} [apiKeyId]  If provided, filter to this key's proofs.
   * @returns {Promise<object[]>}
   */
  async findRecent(limit = 20, apiKeyId = null) {
    return adapter.proofFindRecent(limit, apiKeyId);
  },

  /**
   * Total number of proofs.
   * @param {string|null} [apiKeyId]  If provided, count only this key's proofs.
   */
  async count(apiKeyId = null) {
    return adapter.proofCount(apiKeyId);
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

// ---- apiKeys -----------------------------------------------------------------

const apiKeys = {
  async create(data) {
    return adapter.apiKeyCreate(data);
  },
  async findAllActive() {
    return adapter.apiKeyFindAllActive();
  },
  async findAllWithStats() {
    return adapter.apiKeyFindAllWithStats();
  },
  async findById(id) {
    return adapter.apiKeyFindById(id);
  },
  async touchLastUsed(id) {
    return adapter.apiKeyTouchLastUsed(id);
  },
  async revoke(id) {
    return adapter.apiKeyRevoke(id);
  },
};

// ---- documents ---------------------------------------------------------------

const documents = {
  /**
   * Store an encrypted document linked to a proof.
   * @param {object} data
   * @param {string} data.proofId
   * @param {string} data.encryptedData  base64-encoded AES-GCM ciphertext
   * @param {string} data.iv             base64-encoded 12-byte IV
   * @param {string} [data.createdAt]    ISO 8601 (defaults to now)
   * @param {string} data.expiresAt      ISO 8601 expiry
   */
  async store(data) {
    return adapter.documentStore(data);
  },

  /**
   * Retrieve an encrypted document by its proofId.
   * @param {string} proofId
   * @returns {Promise<{proofId, encryptedData, iv, createdAt, expiresAt}|null>}
   */
  async findByProofId(proofId) {
    return adapter.documentFindByProofId(proofId);
  },
};

// ---- accessRequests ----------------------------------------------------------

const accessRequests = {
  async create(data) {
    return adapter.accessRequestCreate(data);
  },
  async findByApproveToken(token) {
    return adapter.accessRequestFindByApproveToken(token);
  },
  async findByRefuseToken(token) {
    return adapter.accessRequestFindByRefuseToken(token);
  },
  async updateStatus(id, status, apiKeyId) {
    return adapter.accessRequestUpdateStatus(id, status, apiKeyId);
  },
  async findAll() {
    return adapter.accessRequestFindAll();
  },
};

module.exports = { proofs, keys, verificationLog, apiKeys, documents, accessRequests };
