'use strict';

/**
 * packages/verification/index.js
 *
 * Verification orchestration — the authoritative verification engine.
 *
 * This package:
 *   - accepts { proofId?, fileHash? } or a raw receipt object
 *   - runs all cryptographic checks
 *   - returns a structured, explicit result
 *   - does NOT modify any state
 *   - does NOT store media
 *
 * Consumers: src/routes/verify.js
 *
 * Dependencies:
 *   - packages/persistence  — proof lookup
 *   - packages/receipts     — canonical payload construction
 *   - packages/signing      — signature verification
 *
 * similarity.js is imported but its result is advisory only and
 * does not affect the main verification result in V1.
 */

const { proofs }              = require('../persistence');
const { buildSigningPayload } = require('../receipts');
const { verify: verifySig }   = require('../signing');
const { getKeyById }          = require('../signing/keystore');

// Similarity is stubbed in V1 — imported for structure, not called in main flow
// const { similarityCheck } = require('./similarity');

// Required fields on any receipt before verification can proceed
const REQUIRED_RECEIPT_FIELDS = [
  'proofId', 'fileHash', 'timestamp', 'captureMethod',
  'signature', 'publicKey', 'schemaVersion',
];

/**
 * Verify a proof cryptographically.
 *
 * Accepts ONE of:
 *   { proofId }             — look up by ID, verify signature only
 *   { fileHash }            — look up by hash, verify most recent match
 *   { proofId, fileHash }   — look up by ID, verify signature + hash match
 *   { receipt }             — verify an inline receipt object (no DB lookup)
 *
 * Additionally, if `submittedHash` is provided, verifies hash correspondence.
 *
 * @param {object} params
 * @param {string}  [params.proofId]
 * @param {string}  [params.fileHash]      — submitted hash (optional cross-check)
 * @param {object}  [params.receipt]       — inline receipt (skips DB lookup)
 * @param {string}  [params.submittedHash] — hash computed by the caller
 * @returns {Promise<{
 *   valid:      boolean,
 *   result:     'valid'|'invalid'|'mismatch'|'not_found',
 *   checks:     object,
 *   receipt:    object|null,
 *   verifiedAt: string,
 * }>}
 */
async function verifyProof({ proofId, fileHash, receipt: inlineReceipt, submittedHash } = {}) {
  const verifiedAt = new Date().toISOString();
  const checks = {};

  // ── 0. Resolve the receipt ───────────────────────────────────────────────

  let receipt = null;

  if (inlineReceipt) {
    // Caller supplied a full receipt — no DB lookup needed
    receipt = inlineReceipt;
  } else if (proofId) {
    receipt = await proofs.findById(proofId);
  } else if (fileHash) {
    const matches = await proofs.findByHash(fileHash);
    receipt = matches.length > 0 ? matches[0] : null; // most recent
  } else {
    // Nothing to work with — caller error, handled upstream
    return { valid: false, result: 'invalid', checks, receipt: null, verifiedAt };
  }

  // ── 1. Existence check ───────────────────────────────────────────────────

  if (!receipt) {
    checks.exists = false;
    return { valid: false, result: 'not_found', checks, receipt: null, verifiedAt };
  }
  checks.exists = true;

  // ── 2. Receipt structure check ───────────────────────────────────────────

  const missingField = REQUIRED_RECEIPT_FIELDS.find(f => !receipt[f]);
  if (missingField) {
    checks.structureValid = false;
    return { valid: false, result: 'invalid', checks, receipt, verifiedAt };
  }
  checks.structureValid = true;

  // ── 3. Signature verification ────────────────────────────────────────────
  // Source of truth for the public key is the DB (signing_keys table).
  // Fall back to receipt.publicKey for receipts issued before Step 4
  // or when verifying an inline receipt without DB access.

  const payload = buildSigningPayload(
    receipt.proofId,
    receipt.fileHash,
    receipt.timestamp,
    receipt.captureMethod,
  );

  // Resolve public key: DB first, then receipt fallback
  let publicKeyB64 = receipt.publicKey; // fallback (pre-Step4 receipts / inline)

  if (receipt.publicKeyId) {
    const keyRecord = await getKeyById(receipt.publicKeyId);
    if (keyRecord) {
      publicKeyB64 = keyRecord.publicKey.toString('base64');
      checks.keySource = 'db';
    } else {
      checks.keySource = 'receipt_fallback'; // key rotated/removed, use embedded key
    }
  } else {
    checks.keySource = 'receipt_fallback';
  }

  checks.signatureValid = await verifySig(payload, receipt.signature, publicKeyB64);

  if (!checks.signatureValid) {
    return { valid: false, result: 'invalid', checks, receipt, verifiedAt };
  }

  // ── 4. Hash correspondence (if caller provides a hash) ───────────────────

  const hashToCheck = submittedHash || fileHash || null;

  if (hashToCheck) {
    checks.hashMatch = hashToCheck === receipt.fileHash;
  } else {
    checks.hashMatch = null; // not checked — no hash submitted
  }

  if (checks.hashMatch === false) {
    return { valid: false, result: 'mismatch', checks, receipt, verifiedAt };
  }

  // ── 5. Timestamp plausibility ────────────────────────────────────────────
  // Proof must not claim a future timestamp (allow 5 min clock drift)

  const proofTime = new Date(receipt.timestamp).getTime();
  const now       = Date.now();
  checks.timestampPlausible = !isNaN(proofTime) && proofTime <= now + 5 * 60 * 1000;

  if (!checks.timestampPlausible) {
    return { valid: false, result: 'invalid', checks, receipt, verifiedAt };
  }

  // ── All checks passed ────────────────────────────────────────────────────

  return { valid: true, result: 'valid', checks, receipt, verifiedAt };
}

module.exports = { verifyProof };