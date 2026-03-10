'use strict';

/**
 * publicKey.js — Public key distribution endpoint
 *
 * GET /v1/public-key
 *   Returns the currently active public signing key.
 *   No authentication required — this is a public trust anchor.
 *
 * This is what independent verifiers use to verify receipts
 * without trusting Evidencia's verification API.
 */

const express = require('express');
const crypto = require('../modules/crypto');

const router = express.Router();

router.get('/', (req, res) => {
  try {
    const { publicKey, keyId } = crypto.loadKeyPair();
    return res.json({
      object: 'public_key',
      keyId,
      algorithm: 'ed25519',
      publicKey: publicKey.toString('base64'),
      format: 'base64',
      // How to use this key:
      usage: 'Verify Ed25519 signatures on Evidencia proof receipts.',
      verificationGuide: 'https://docs.evidencia.io/verification',
    });
  } catch (err) {
    return res.status(500).json({
      error: {
        type: 'api_error',
        code: 'keys_unavailable',
        message: 'Signing keys not initialised. Run: npm run keygen',
      },
    });
  }
});

module.exports = router;
