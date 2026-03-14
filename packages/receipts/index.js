'use strict';

/**
 * packages/receipts/index.js
 *
 * Proof receipt construction and canonicalization.
 *
 * This package owns:
 *   - buildReceipt(params) — assemble the full receipt object
 *   - canonicalize(receipt) — deterministic JSON for signing
 *   - buildSigningPayload(...)  — canonical payload buffer for Ed25519
 *
 * No DB access. No signing logic. No route logic.
 *
 * The receipt shape is the public contract of Evidencia.
 * Do not change field names or structure without a schema version bump.
 */

/**
 * Build a full proof receipt object.
 * This is the authoritative V1 receipt shape.
 *
 * @param {object} params
 * @param {string} params.proofId        — "prf_<ULID>"
 * @param {string} params.fileHash       — "sha256:<hex>"
 * @param {string} params.timestamp      — ISO 8601 UTC
 * @param {string} params.captureMethod  — e.g. "api_hash_only", "demo_web"
 * @param {string} params.signature      — base64 Ed25519 signature
 * @param {string} params.publicKey      — base64 Ed25519 public key
 * @param {string} params.publicKeyId    — key identifier
 * @param {object} [params.metadata]     — optional caller-supplied metadata
 * @param {object|string} [params.mediaRef]  — optional durable media reference (B2B)
 * @param {string} [params.photoUrl]     — optional image URL for display only (demo)
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
  mediaRef,
  photoUrl,
}) {
  const receipt = {
    schemaVersion:  '1',
    receiptFormat:  'evidencia-receipt-v1',
    issuedBy:       'evidencia.tech',

    // Core proof identity
    proofId,
    fileHash,
    hashAlgorithm:  fileHash.split(':')[0],   // "sha256"
    timestamp,
    captureMethod,

    // Cryptographic proof
    signatureAlgorithm: 'ed25519',
    signature,
    publicKey,
    publicKeyId,

    // Optional caller-supplied context — never media, never PII
    metadata,

    // Convenience link for human verification
    verificationUrl: `https://verify.evidencia.tech/${proofId}`,
  };

  // Optional media reference — durable identifier controlled by the B2B client.
  // Not in the signing payload; the certified content is always the file hash.
  if (mediaRef !== undefined) receipt.mediaRef = mediaRef;

  // Optional display URL — demo/preview only, never the certified artefact.
  if (photoUrl !== undefined) receipt.photoUrl = photoUrl;

  return receipt;
}

/**
 * Build the canonical signing payload buffer.
 *
 * Keys are sorted alphabetically (RFC 8785 spirit) for determinism.
 * This is what gets signed — any change to this function breaks
 * verification of all previously issued proofs.
 *
 * @param {string} proofId
 * @param {string} fileHash
 * @param {string} timestamp
 * @param {string} captureMethod
 * @returns {Buffer}
 */
function buildSigningPayload(proofId, fileHash, timestamp, captureMethod) {
  const payload = {
    captureMethod,
    fileHash,
    proofId,
    schemaVersion: '1',
    timestamp,
  };
  // Deterministic: JSON with sorted keys, no extra whitespace
  return Buffer.from(JSON.stringify(payload, Object.keys(payload).sort()));
}

/**
 * Produce the canonical JSON string of a receipt for offline verification.
 * Keys are sorted; output is compact (no extra spaces).
 *
 * @param {object} receipt
 * @returns {string}
 */
function canonicalize(receipt) {
  return JSON.stringify(receipt, Object.keys(receipt).sort());
}

module.exports = { buildReceipt, buildSigningPayload, canonicalize };