'use strict';

/**
 * proofs.js — Proof creation and retrieval routes
 *
 * POST /v1/proofs
 *   Accepts a multipart file upload OR a pre-computed hash.
 *   Hashes the file, signs the canonical payload, stores the receipt.
 *
 * GET /v1/proofs/:id
 *   Returns the stored receipt by proofId.
 */

const express = require('express');
const multer = require('multer');
const { ulid } = require('ulid');

const crypto = require('../modules/crypto');
const { buildReceipt } = require('../modules/receipt');
const { insertProof, getProofById } = require('../modules/db');
const { requireApiKey } = require('../middleware/auth');
const { createError } = require('../middleware/errorHandler');

const router = express.Router();

// Multer: memory storage (never write uploads to disk)
// Max file size: 50 MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// ─── POST /v1/proofs ─────────────────────────────────────────────────────────

router.post('/', requireApiKey, upload.single('file'), async (req, res, next) => {
  try {
    let fileHash;
    let metadata = {};

    // ── Determine file hash ──────────────────────────────────────────────────
    if (req.file) {
      // A file was uploaded — hash it server-side
      fileHash = crypto.hashBuffer(req.file.buffer);
      metadata = {
        filename: req.file.originalname || null,
        mimeType: req.file.mimetype || null,
        sizeBytes: req.file.size,
      };
    } else if (req.body && req.body.fileHash) {
      // Caller pre-computed the hash client-side (privacy mode)
      fileHash = req.body.fileHash;
      validateHashFormat(fileHash, next);
    } else {
      return next(createError(400, 'missing_file_or_hash',
        'Provide either a multipart "file" field or a "fileHash" body parameter.',
        'file'));
    }

    // Merge any caller-supplied metadata
    if (req.body && req.body.metadata) {
      try {
        const extra = typeof req.body.metadata === 'string'
          ? JSON.parse(req.body.metadata)
          : req.body.metadata;
        metadata = { ...metadata, ...extra };
      } catch {
        // ignore malformed metadata
      }
    }

    const captureMethod = (req.body && req.body.captureMethod) || 'api_upload';
    const proofId = `prf_${ulid()}`;
    const timestamp = new Date().toISOString();

    // ── Build signing payload and sign ───────────────────────────────────────
    const signingPayload = crypto.buildSigningPayload(proofId, fileHash, timestamp, captureMethod);
    const { signature, publicKey, keyId } = await crypto.sign(signingPayload);

    // ── Assemble receipt ─────────────────────────────────────────────────────
    const receipt = buildReceipt({
      proofId,
      fileHash,
      timestamp,
      captureMethod,
      signature,
      publicKey,
      publicKeyId: keyId,
      metadata,
    });

    // ── Persist ──────────────────────────────────────────────────────────────
    insertProof(receipt);

    // ── Respond ──────────────────────────────────────────────────────────────
    return res.status(201).json({
      id: proofId,
      object: 'proof',
      status: 'active',
      receipt,
      createdAt: timestamp,
      livemode: process.env.NODE_ENV === 'production',
    });

  } catch (err) {
    next(err);
  }
});

// ─── GET /v1/proofs/:id ──────────────────────────────────────────────────────

router.get('/:id', requireApiKey, (req, res, next) => {
  const { id } = req.params;

  if (!id.startsWith('prf_')) {
    return next(createError(400, 'invalid_proof_id',
      'Proof IDs must start with "prf_".', 'id'));
  }

  const receipt = getProofById(id);

  if (!receipt) {
    return next(createError(404, 'proof_not_found',
      `No proof found with id: ${id}`));
  }

  return res.json({
    id: receipt.proofId,
    object: 'proof',
    status: 'active',
    receipt,
    createdAt: receipt.timestamp,
    livemode: process.env.NODE_ENV === 'production',
  });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function validateHashFormat(hash, next) {
  const valid = /^(sha256|sha3-256):[a-f0-9]{64}$/i.test(hash);
  if (!valid) {
    next(createError(400, 'hash_format_invalid',
      'fileHash must be in format "sha256:<64-hex-chars>".', 'fileHash'));
    return false;
  }
  return true;
}

module.exports = router;
