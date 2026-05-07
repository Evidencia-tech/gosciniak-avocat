'use strict';

/**
 * src/routes/keys.js
 *
 * POST   /v1/keys       — generate a new API key (admin only)
 * DELETE /v1/keys/:id   — revoke an API key (admin only)
 *
 * The raw key is returned ONCE on creation — it is never stored.
 * Only the scrypt hash is persisted in the api_keys table.
 */

const express = require('express');
const { ulid } = require('ulid');

const { apiKeys }    = require('../../packages/persistence');
const { requireApiKey, requireAdmin, hashApiKey, generateRawKey } = require('../middleware/auth');
const { createError } = require('../middleware/errorHandler');
const { ok }          = require('../lib/apiResponse');

const router = express.Router();

// ── GET /v1/keys ─────────────────────────────────────────────────────────────

router.get('/', requireApiKey, requireAdmin, async (req, res, next) => {
  try {
    const activeKeys = await apiKeys.findAllWithStats();
    return ok(res, { keys: activeKeys });
  } catch (err) {
    next(err);
  }
});

// ── POST /v1/keys ────────────────────────────────────────────────────────────

router.post('/', requireApiKey, requireAdmin, async (req, res, next) => {
  try {
    const { label, environment } = req.body || {};

    const env = (environment === 'test') ? 'test' : 'live';
    const rawKey  = generateRawKey(env);
    const keyHash = await hashApiKey(rawKey);
    const keyId   = `key_${ulid()}`;

    const record = await apiKeys.create({
      id:          keyId,
      keyHash,
      label:       label || null,
      environment: env,
    });

    return ok(res, {
      id:          record.id,
      object:      'api_key',
      key:         rawKey,   // shown ONCE — never stored or retrievable again
      label:       record.label,
      environment: record.environment,
      status:      record.status,
      createdAt:   record.createdAt,
    }, 201);

  } catch (err) {
    next(err);
  }
});

// ── DELETE /v1/keys/:id ──────────────────────────────────────────────────────

router.delete('/:id', requireApiKey, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await apiKeys.findById(id);

    if (!existing) {
      return next(createError(404, 'NOT_FOUND', `API key not found: ${id}`));
    }

    await apiKeys.revoke(id);
    return ok(res, { id, status: 'revoked' });

  } catch (err) {
    next(err);
  }
});

module.exports = router;
