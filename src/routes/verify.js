'use strict';

/**
 * src/routes/verify.js
 *
 * POST /v1/verify  — public proof verification
 */

const express  = require('express');
const multer   = require('multer');

const { computeHash }  = require('../../packages/hashing');
const { verifyProof }  = require('../../packages/verification');
const { createError }  = require('../middleware/errorHandler');
const { ok }           = require('../lib/apiResponse');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 50 * 1024 * 1024 },
});

router.post('/', upload.single('file'), async (req, res, next) => {
  try {
    let inlineReceipt = null;
    const proofId  = req.body && req.body.proofId  ? req.body.proofId  : null;
    const fileHash = req.body && req.body.fileHash  ? req.body.fileHash : null;

    if (!proofId && !fileHash && req.body && req.body.receipt) {
      try {
        inlineReceipt = typeof req.body.receipt === 'string'
          ? JSON.parse(req.body.receipt)
          : req.body.receipt;
      } catch {
        return next(createError(400, 'INVALID_INPUT',
          'Could not parse "receipt" field as JSON.'));
      }
    }

    if (!proofId && !fileHash && !inlineReceipt) {
      return next(createError(400, 'INVALID_INPUT',
        'Provide either "proofId", "fileHash", or a full "receipt" object.'));
    }

    let submittedHash = fileHash;
    if (req.file) {
      submittedHash = computeHash(req.file.buffer);
    }

    const result  = await verifyProof({
      proofId,
      fileHash:      submittedHash,
      receipt:       inlineReceipt,
      submittedHash: submittedHash || null,
    });

    const receipt = result.receipt;

    return ok(res, {
      valid:     result.valid,
      result:    result.result,
      proofId:   receipt ? receipt.proofId : (proofId || null),
      checks:    result.checks,
      proof:     receipt ? {
        fileHash:           receipt.fileHash,
        timestamp:          receipt.timestamp,
        captureMethod:      receipt.captureMethod,
        publicKeyId:        receipt.publicKeyId,
        signatureAlgorithm: receipt.signatureAlgorithm,
        ...(receipt.mediaRef !== undefined && { mediaRef: receipt.mediaRef }),
        ...(receipt.photoUrl !== undefined && { photoUrl: receipt.photoUrl }),
      } : null,
      verifiedAt: result.verifiedAt,
    });

  } catch (err) {
    next(err);
  }
});

module.exports = router;
