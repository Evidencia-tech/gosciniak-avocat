'use strict';

/**
 * verify.js — Public proof verification route
 *
 * POST /v1/verify
 *   No authentication required — this endpoint is public.
 *
 *   Accepts:
 *     { proofId, fileHash? }
 *     OR
 *     { receipt: <full receipt object>, fileHash? }
 *
 *   Performs:
 *     1. Retrieve stored receipt (if proofId given) or use inline receipt
 *     2. Reconstruct the canonical signing payload
 *     3. Verify Ed25519 signature
 *     4. Optionally verify file hash (if caller provides fileHash)
 *
 *   Returns a structured verification result — every check is explicit.
 */

const express = require('express');
const multer = require('multer');

const crypto = require('../modules/crypto');
const { getProofById } = require('../modules/db');
const { createError } = require('../middleware/errorHandler');

const router = express.Router();

// Accept both JSON and multipart (so callers can upload the original file)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.post('/', upload.single('file'), async (req, res, next) => {
  try {
    // ── Resolve receipt ──────────────────────────────────────────────────────
    let receipt = null;

    if (req.body && req.body.proofId) {
      receipt = getProofById(req.body.proofId);
      if (!receipt) {
        return next(createError(404, 'proof_not_found',
          `No proof found with id: ${req.body.proofId}`));
      }
    } else if (req.body && req.body.receipt) {
      try {
        receipt = typeof req.body.receipt === 'string'
          ? JSON.parse(req.body.receipt)
          : req.body.receipt;
      } catch {
        return next(createError(400, 'invalid_receipt',
          'Could not parse "receipt" field as JSON.', 'receipt'));
      }
    } else {
      return next(createError(400, 'missing_proof_id_or_receipt',
        'Provide either "proofId" or a full "receipt" object.'));
    }

    // ── Check receipt structure ──────────────────────────────────────────────
    const required = ['proofId', 'fileHash', 'timestamp', 'captureMethod',
                      'signature', 'publicKey', 'schemaVersion'];
    for (const field of required) {
      if (!receipt[field]) {
        return next(createError(422, 'malformed_receipt',
          `Receipt is missing required field: ${field}`, field));
      }
    }

    const checks = {};

    // ── Check 1: Signature ───────────────────────────────────────────────────
    const signingPayload = crypto.buildSigningPayload(
      receipt.proofId,
      receipt.fileHash,
      receipt.timestamp,
      receipt.captureMethod,
    );

    checks.signatureValid = await crypto.verify(
      signingPayload,
      receipt.signature,
      receipt.publicKey,
    );

    // ── Check 2: File hash (if caller provides the original file) ─────────────
    let callerHash = req.body && req.body.fileHash ? req.body.fileHash : null;

    // If a file was uploaded, compute its hash
    if (req.file) {
      callerHash = crypto.hashBuffer(req.file.buffer);
    }

    if (callerHash) {
      checks.fileHashMatch = callerHash === receipt.fileHash;
    } else {
      checks.fileHashMatch = null; // not checked — no file provided
    }

    // ── Check 3: Timestamp plausibility ─────────────────────────────────────
    // Proof timestamp must not be in the future (more than 5 min clock drift)
    const proofTime = new Date(receipt.timestamp).getTime();
    const now = Date.now();
    checks.timestampPlausible = !isNaN(proofTime) && proofTime <= now + 5 * 60 * 1000;

    // ── Overall validity ─────────────────────────────────────────────────────
    const valid = checks.signatureValid
      && (checks.fileHashMatch === null || checks.fileHashMatch)
      && checks.timestampPlausible;

    return res.json({
      valid,
      proofId: receipt.proofId,
      checks,
      proof: {
        fileHash: receipt.fileHash,
        timestamp: receipt.timestamp,
        captureMethod: receipt.captureMethod,
        publicKeyId: receipt.publicKeyId,
        signatureAlgorithm: receipt.signatureAlgorithm,
      },
      verifiedAt: new Date().toISOString(),
    });

  } catch (err) {
    next(err);
  }
});

module.exports = router;
