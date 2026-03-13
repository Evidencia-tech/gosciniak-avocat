'use strict';

/**
 * src/middleware/auth.js
 *
 * Multi-tenant API key authentication.
 *
 * Lookup flow:
 *   1. Extract Bearer token from Authorization header
 *   2. Load all active keys from DB, compare scrypt hashes
 *   3. On match: attach req.apiKey = { id, label, environment }
 *   4. Fallback: if EVIDENCIA_ADMIN_KEY env var matches, grant admin access
 *
 * Key format: evd_sk_live_<32 hex> or evd_sk_test_<32 hex>
 * Storage: only scrypt hash is persisted, never the raw key.
 */

const crypto = require('crypto');
const { apiKeys } = require('../../packages/persistence');
const { createError } = require('./errorHandler');

// ── Scrypt helpers ──────────────────────────────────────────────────────────

const SCRYPT_KEYLEN = 64;
const SCRYPT_COST   = { N: 16384, r: 8, p: 1 };

/**
 * Hash a raw API key with scrypt.
 * Format: <salt_hex>:<derived_hex>
 */
function hashApiKey(rawKey) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16);
    crypto.scrypt(rawKey, salt, SCRYPT_KEYLEN, SCRYPT_COST, (err, derived) => {
      if (err) return reject(err);
      resolve(`${salt.toString('hex')}:${derived.toString('hex')}`);
    });
  });
}

/**
 * Verify a raw key against a stored hash.
 * Uses timingSafeEqual to prevent timing attacks.
 */
function verifyApiKey(rawKey, storedHash) {
  return new Promise((resolve, reject) => {
    const [saltHex, expectedHex] = storedHash.split(':');
    const salt = Buffer.from(saltHex, 'hex');
    crypto.scrypt(rawKey, salt, SCRYPT_KEYLEN, SCRYPT_COST, (err, derived) => {
      if (err) return reject(err);
      const expected = Buffer.from(expectedHex, 'hex');
      resolve(crypto.timingSafeEqual(derived, expected));
    });
  });
}

// ── Key generation ──────────────────────────────────────────────────────────

/**
 * Generate a new API key in the format evd_sk_{env}_{32 hex chars}.
 * @param {'live'|'test'} environment
 * @returns {string}
 */
function generateRawKey(environment = 'live') {
  const random = crypto.randomBytes(32).toString('hex');
  return `evd_sk_${environment}_${random}`;
}

// ── Middleware ────────────────────────────────────────────────────────────────

/**
 * Middleware: require a valid API key (multi-tenant or admin).
 * On success, sets req.apiKey with key metadata.
 */
function requireApiKey(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  // Dev mode fallback: no admin key configured and NODE_ENV !== production
  const adminKey = process.env.EVIDENCIA_ADMIN_KEY || process.env.EVIDENCIA_API_KEY;
  if (!adminKey && process.env.NODE_ENV !== 'production') {
    return next(); // dev mode — no keys configured → open access
  }

  if (!token) {
    return next(createError(401, 'AUTH_REQUIRED',
      'Authorization header required: "Bearer <api_key>"'));
  }

  // Check admin key first (fast path, no DB)
  if (adminKey && token === adminKey) {
    req.apiKey = { id: 'admin', label: 'admin', environment: 'live', isAdmin: true };
    return next();
  }

  // Check multi-tenant keys from DB
  _verifyMultiTenantKey(token, req, next);
}

async function _verifyMultiTenantKey(token, req, next) {
  try {
    const activeKeys = await apiKeys.findAllActive();

    for (const key of activeKeys) {
      const match = await verifyApiKey(token, key.keyHash);
      if (match) {
        req.apiKey = {
          id:          key.id,
          label:       key.label,
          environment: key.environment,
          isAdmin:     false,
        };
        // Fire-and-forget last_used_at update
        apiKeys.touchLastUsed(key.id).catch(() => {});
        return next();
      }
    }

    return next(createError(401, 'INVALID_API_KEY', 'Invalid API key.'));
  } catch (err) {
    return next(createError(500, 'INTERNAL_ERROR', 'Auth check failed.'));
  }
}

/**
 * Middleware: require admin access (EVIDENCIA_ADMIN_KEY or EVIDENCIA_API_KEY).
 */
function requireAdmin(req, res, next) {
  if (req.apiKey && req.apiKey.isAdmin) {
    return next();
  }
  return next(createError(403, 'FORBIDDEN', 'Admin access required.'));
}

module.exports = { requireApiKey, requireAdmin, hashApiKey, verifyApiKey, generateRawKey };
