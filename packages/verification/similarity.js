'use strict';

/**
 * packages/verification/similarity.js
 *
 * Perceptual similarity check — V1 STUB.
 *
 * This file defines the interface for future perceptual (visual) similarity
 * matching but does NOT implement it.
 *
 * When V2 activates this feature:
 *   - Replace the stub body with a pHash / dHash implementation
 *   - Add the relevant npm dependency (e.g. looks-same, sharp)
 *   - The callers in verification/index.js do not need to change
 *
 * Doctrine reminder:
 *   Perceptual similarity is NOT a legal proof.
 *   It is a UX hint only ("this file looks like a certified capture").
 *   The cryptographic verification in index.js remains authoritative.
 */

/**
 * Check if two files are perceptually similar.
 * V1: always returns null (not implemented).
 *
 * @param {Buffer} _submittedBuffer  — the file submitted for verification
 * @param {string} _proofId          — the proof to compare against
 * @returns {Promise<null>}
 */
async function similarityCheck(_submittedBuffer, _proofId) {
  return null;
}

module.exports = { similarityCheck };