'use strict';

/**
 * src/routes/demo.js
 *
 * POST /v1/demo/proofs — public demo endpoint (no API key required)
 *
 * Rate-limited: 20 requests / 10 min / IP
 * captureMethod forced to "demo_web"
 */

const express  = require('express');
const multer   = require('multer');
const { ulid } = require('ulid');

const { computeHash }                      = require('../../packages/hashing');
const { sign }                             = require('../../packages/signing');
const { buildReceipt, buildSigningPayload } = require('../../packages/receipts');
const { proofs }                           = require('../../packages/persistence');
const { createError }                      = require('../middleware/errorHandler');
const { ok }                               = require('../lib/apiResponse');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 20 * 1024 * 1024 },
});

// ---- Rate limiter (in-memory, no external dependency) -----------------------

const ipLog     = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQS  = 20;

function rateLimit(req, res, next) {
  const ip  = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();

  const times = (ipLog.get(ip) || []).filter(t => now - t < WINDOW_MS);
  times.push(now);
  ipLog.set(ip, times);

  if (times.length > MAX_REQS) {
    return next(createError(429, 'RATE_LIMITED',
      'Too many certifications from this address. Please retry in 10 minutes.'));
  }

  if (ipLog.size > 500) {
    for (const [k, v] of ipLog) {
      if (v.every(t => now - t >= WINDOW_MS)) ipLog.delete(k);
    }
  }

  next();
}

// ---- POST /v1/demo/proofs ---------------------------------------------------

router.post('/', rateLimit, upload.single('file'), async (req, res, next) => {
  try {
    let fileHash;

    if (req.file) {
      fileHash = computeHash(req.file.buffer);
    } else if (req.body && req.body.fileHash) {
      const hash = req.body.fileHash;
      if (!/^(sha256|sha3-256):[a-f0-9]{64}$/i.test(hash)) {
        return next(createError(400, 'INVALID_INPUT',
          'fileHash must be in format "sha256:<64-hex-chars>".'));
      }
      fileHash = hash;
    } else {
      return next(createError(400, 'INVALID_INPUT',
        'Provide a multipart "file" field or a "fileHash" parameter.'));
    }

    let extraMeta = {};
    if (req.body && req.body.metadata) {
      try { extraMeta = JSON.parse(req.body.metadata); } catch { /* ignore */ }
    }

    const metadata  = { ...extraMeta, demo: true, source: 'demo_web' };
    const proofId   = `prf_${ulid()}`;
    const timestamp = new Date().toISOString();

    // Optional photo URL for demo display — display only, never the certified artefact.
    const photoUrl = req.body && req.body.photoUrl !== undefined ? req.body.photoUrl : undefined;

    const signingPayload                  = buildSigningPayload(proofId, fileHash, timestamp, 'demo_web');
    const { signature, publicKey, keyId } = await sign(signingPayload);

    const receipt = buildReceipt({
      proofId, fileHash, timestamp,
      captureMethod: 'demo_web',
      signature, publicKey, publicKeyId: keyId, metadata,
      photoUrl,
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
      id:        proofId,
      object:    'proof',
      status:    'active',
      demo:      true,
      receipt,
      createdAt: timestamp,
    }, 201);

  } catch (err) {
    next(err);
  }
});

module.exports = router;
