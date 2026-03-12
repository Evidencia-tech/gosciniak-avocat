'use strict';

/**
 * src/routes/publicKey.js
 *
 * GET /v1/publicKey — active signing public key (public endpoint)
 */

const express = require('express');
const { getActivePublicKey } = require('../../packages/signing/keystore');
const { ok, fail }           = require('../lib/apiResponse');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { publicKey, keyId } = await getActivePublicKey();
    return ok(res, {
      keyId,
      algorithm: 'Ed25519',
      publicKey: publicKey.toString('base64'),
    });
  } catch (err) {
    return fail(res, 500, 'INTERNAL_ERROR',
      'Signing keys not initialised. Run: npm run keygen');
  }
});

module.exports = router;
