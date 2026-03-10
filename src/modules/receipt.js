'use strict';

/**
 * receipt.js — Proof receipt construction
 *
 * Assembles the canonical Evidencia receipt object (v1 schema)
 * from its component parts after signing.
 */

/**
 * Build a full proof receipt object.
 *
 * @param {object} params
 * @param {string} params.proofId        — "prf_<ULID>"
 * @param {string} params.fileHash       — "sha256:<hex>"
 * @param {string} params.timestamp      — ISO 8601 UTC
 * @param {string} params.captureMethod  — e.g. "api_upload"
 * @param {string} params.signature      — base64 Ed25519 signature
 * @param {string} params.publicKey      — base64 public key
 * @param {string} params.publicKeyId    — key identifier
 * @param {object} [params.metadata]     — optional caller-supplied metadata
 * @returns {object} receipt
 */
function buildReceipt({
  proofId,
  fileHash,
  timestamp,
  captureMethod,
  signature,
  publicKey,
  publicKeyId,
  metadata = {},
}) {
  return {
    schemaVersion: '1',
    receiptFormat: 'evidencia-receipt-v1',
    issuedBy: 'evidencia.io',

    // Core proof identity
    proofId,
    fileHash,
    hashAlgorithm: fileHash.split(':')[0],  // "sha256"
    timestamp,
    captureMethod,

    // Cryptographic proof
    signatureAlgorithm: 'ed25519',
    signature,
    publicKey,
    publicKeyId,

    // Optional caller metadata (filename, mimeType, etc.)
    metadata,

    // Convenience verification link
    verificationUrl: `https://verify.evidencia.io/${proofId}`,
  };
}

module.exports = { buildReceipt };
