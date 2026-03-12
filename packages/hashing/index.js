'use strict';

/**
 * packages/hashing/index.js
 *
 * SHA-256 hashing helpers.
 * No DB access. No signing logic. No route logic.
 *
 * This package is the single source of truth for hash computation
 * in the Evidencia platform.
 */

const nodeCrypto = require('crypto');

/**
 * Hash a Buffer or string with SHA-256.
 * Returns the prefixed hex string: "sha256:<hex>"
 *
 * @param {Buffer|string} input
 * @returns {string} e.g. "sha256:a3f4..."
 */
function computeHash(input) {
  const hex = nodeCrypto.createHash('sha256').update(input).digest('hex');
  return `sha256:${hex}`;
}

/**
 * Verify that an input matches an expected prefixed hash.
 *
 * @param {string}        expectedHash  — "sha256:<hex>"
 * @param {Buffer|string} input
 * @returns {boolean}
 */
function verifyHash(expectedHash, input) {
  const actual = computeHash(input);
  return actual === expectedHash;
}

/**
 * Extract the raw hex digest from a prefixed hash string.
 * "sha256:abc..." → "abc..."
 *
 * @param {string} prefixedHash
 * @returns {string}
 */
function rawHex(prefixedHash) {
  const parts = prefixedHash.split(':');
  if (parts.length !== 2) throw new Error(`Invalid hash format: ${prefixedHash}`);
  return parts[1];
}

/**
 * Validate that a string matches the expected hash format.
 * Supports sha256 and sha3-256.
 *
 * @param {string} hash
 * @returns {boolean}
 */
function isValidHashFormat(hash) {
  return /^(sha256|sha3-256):[a-f0-9]{64}$/i.test(hash);
}

module.exports = { computeHash, verifyHash, rawHex, isValidHashFormat };