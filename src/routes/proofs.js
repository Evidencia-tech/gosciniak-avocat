'use strict';

/**
 * src/routes/proofs.js
 *
 * POST /v1/proofs  — create a proof (authenticated)
 * GET  /v1/proofs/:id — retrieve a proof (authenticated)
 */

const express  = require('express');
const multer   = require('multer');
const { ulid } = require('ulid');

const { computeHash, isValidHashFormat }    = require('../../packages/hashing');
const { sign }                              = require('../../packages/signing');
const { buildReceipt, buildSigningPayload } = require('../../packages/receipts');
const { proofs }                            = require('../../packages/persistence');
const { requireApiKey }                     = require('../middleware/auth');
const { createError }                       = require('../middleware/errorHandler');
const { ok }                                = require('../lib/apiResponse');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 50 * 1024 * 1024 },
});

// ---- POST /v1/proofs --------------------------------------------------------

router.post('/', requireApiKey, upload.single('file'), async (req, res, next) => {
  try {
    let fileHash;
    let metadata = {};

    if (req.file) {
      fileHash = computeHash(req.file.buffer);
      metadata = {
        filename:  req.file.originalname || null,
        mimeType:  req.file.mimetype     || null,
        sizeBytes: req.file.size,
      };
    } else if (req.body && req.body.fileHash) {
      fileHash = req.body.fileHash;
      if (!isValidHashFormat(fileHash)) {
        return next(createError(400, 'INVALID_INPUT',
          'fileHash must be in format "sha256:<64-hex-chars>".'));
      }
    } else {
      return next(createError(400, 'INVALID_INPUT',
        'Provide either a multipart "file" field or a "fileHash" body parameter.'));
    }

    if (req.body && req.body.metadata) {
      try {
        const extra = typeof req.body.metadata === 'string'
          ? JSON.parse(req.body.metadata)
          : req.body.metadata;
        metadata = { ...metadata, ...extra };
      } catch { /* ignore malformed metadata */ }
    }

    const captureMethod = (req.body && req.body.captureMethod) || 'api_upload';
    const proofId       = `prf_${ulid()}`;
    const timestamp     = new Date().toISOString();

    // Optional media reference — durable identifier controlled by the B2B client.
    const mediaRef = req.body && req.body.mediaRef !== undefined ? req.body.mediaRef : undefined;
    // Optional photo URL — display only, never stored as the certified file.
    const photoUrl = req.body && req.body.photoUrl !== undefined ? req.body.photoUrl : undefined;

    const signingPayload                  = buildSigningPayload(proofId, fileHash, timestamp, captureMethod);
    const { signature, publicKey, keyId } = await sign(signingPayload);

    const receipt = buildReceipt({
      proofId, fileHash, timestamp, captureMethod,
      signature, publicKey, publicKeyId: keyId, metadata,
      mediaRef, photoUrl,
    });

    await proofs.create({
      proofId:       receipt.proofId,
      fileHash:      receipt.fileHash,
      timestamp:     receipt.timestamp,
      captureMethod: receipt.captureMethod,
      keyId:         receipt.publicKeyId,
      receipt,
    });

    return ok(res, {
      id:       proofId,
      object:   'proof',
      status:   'active',
      receipt,
      createdAt: timestamp,
      livemode:  process.env.NODE_ENV === 'production',
    }, 201);

  } catch (err) {
    next(err);
  }
});

// ---- GET /v1/proofs ---------------------------------------------------------

router.get('/', requireApiKey, async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const [items, total] = await Promise.all([
      proofs.findRecent(limit),
      proofs.count(),
    ]);
    return ok(res, { proofs: items, total, limit });
  } catch (err) {
    next(err);
  }
});

// ---- GET /v1/proofs/:id -----------------------------------------------------

router.get('/:id', requireApiKey, async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id.startsWith('prf_')) {
      return next(createError(400, 'INVALID_INPUT',
        'Proof IDs must start with "prf_".'));
    }

    const receipt = await proofs.findById(id);

    if (!receipt) {
      return next(createError(404, 'PROOF_NOT_FOUND',
        `No proof found with id: ${id}`));
    }

    return ok(res, {
      id:       receipt.proofId,
      object:   'proof',
      status:   'active',
      receipt,
      createdAt: receipt.timestamp,
      livemode:  process.env.NODE_ENV === 'production',
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
