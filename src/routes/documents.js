'use strict';

const express = require('express');

const { ok, fail }          = require('../lib/apiResponse');
const { requireApiKey, verifyApiKey } = require('../middleware/auth');
const { createError }       = require('../middleware/errorHandler');
const { proofs, documents, apiKeys } = require('../../packages/persistence');

const router = express.Router();

// Per-route body parsers (mounted before global 100 kb limit in server.js)
const smallJson = express.json({ limit: '10kb' });
const largeJson = express.json({ limit: '20mb' });

// ── POST /v1/auth/depot ──────────────────────────────────────────────────────
// Validate an API key used as an access code from the depot page.
// Returns 200 on success, 401 on invalid code. No session created server-side.

router.post('/auth/depot', smallJson, async (req, res, next) => {
  try {
    const { code } = req.body || {};
    if (!code || typeof code !== 'string') {
      return fail(res, 400, 'BAD_REQUEST', 'Le champ "code" est requis.');
    }

    // Fast path: admin key
    const adminKey = process.env.EVIDENCIA_ADMIN_KEY || process.env.EVIDENCIA_API_KEY;
    if (adminKey && code === adminKey) {
      return ok(res, { success: true });
    }

    // Multi-tenant keys: verify against scrypt hashes
    const activeKeys = await apiKeys.findAllActive();
    for (const key of activeKeys) {
      const match = await verifyApiKey(code, key.keyHash);
      if (match) {
        apiKeys.touchLastUsed(key.id).catch(() => {});
        return ok(res, { success: true });
      }
    }

    return fail(res, 401, 'INVALID_CODE', 'Code invalide.');
  } catch (err) {
    next(err);
  }
});

// ── POST /v1/documents/store ─────────────────────────────────────────────────
// Store an AES-256-GCM encrypted document blob linked to a proofId.
// The decryption key is NEVER sent to the server — it lives in the URL fragment.

router.post('/documents/store', largeJson, requireApiKey, async (req, res, next) => {
  try {
    const { proofId, encryptedData, iv } = req.body || {};

    if (!proofId || !encryptedData || !iv) {
      return fail(res, 400, 'BAD_REQUEST',
        'Les champs proofId, encryptedData et iv sont requis.');
    }

    if (!proofId.startsWith('prf_')) {
      return fail(res, 400, 'INVALID_INPUT',
        'Les identifiants de preuve commencent par prf_.');
    }

    // Verify proof exists
    const receipt = await proofs.findById(proofId);
    if (!receipt) {
      return fail(res, 404, 'PROOF_NOT_FOUND',
        `Aucune preuve trouvée pour l'identifiant : ${proofId}`);
    }

    // expiresAt = now + 13 months (ordonnances renouvelables)
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 13);

    await documents.store({
      proofId,
      encryptedData,
      iv,
      createdAt:  new Date().toISOString(),
      expiresAt:  expiresAt.toISOString(),
    });

    const documentUrl = `${req.protocol}://${req.get('host')}/v1/documents/${proofId}`;
    return ok(res, { success: true, documentUrl });

  } catch (err) {
    next(err);
  }
});

// ── GET /v1/documents/:proofId ───────────────────────────────────────────────
// Public — returns the encrypted blob. The AES key is in the URL fragment and
// never reaches the server. The browser decrypts client-side.

router.get('/documents/:proofId', async (req, res, next) => {
  try {
    const { proofId } = req.params;

    if (!proofId.startsWith('prf_')) {
      return fail(res, 400, 'INVALID_INPUT',
        'Les identifiants de preuve commencent par prf_.');
    }

    const doc = await documents.findByProofId(proofId);
    if (!doc) {
      return fail(res, 404, 'NOT_FOUND',
        'Aucun document trouvé pour cet identifiant de preuve.');
    }

    if (new Date(doc.expiresAt) < new Date()) {
      return fail(res, 410, 'GONE',
        'Ce document a expiré et n\'est plus disponible.');
    }

    return ok(res, {
      encryptedData: doc.encryptedData,
      iv:            doc.iv,
      expiresAt:     doc.expiresAt,
    });

  } catch (err) {
    next(err);
  }
});

module.exports = router;
