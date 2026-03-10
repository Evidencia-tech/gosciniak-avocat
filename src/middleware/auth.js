'use strict';

/**
 * auth.js — API key authentication middleware
 *
 * For this minimal implementation, a single API key is loaded from
 * the environment variable EVIDENCIA_API_KEY.
 *
 * In production this would validate against a keys table in the DB,
 * support multiple keys per organisation, and check key scopes.
 *
 * The verification endpoint (POST /v1/verify) is PUBLIC — no auth.
 * The public-key endpoint (GET /v1/public-key) is PUBLIC — no auth.
 */

const { createError } = require('./errorHandler');

function requireApiKey(req, res, next) {
  const apiKey = process.env.EVIDENCIA_API_KEY;

  if (!apiKey) {
    // No key configured → open (dev mode only — warn loudly)
    if (process.env.NODE_ENV !== 'production') {
      return next();
    }
    return next(createError(500, 'server_misconfiguration',
      'EVIDENCIA_API_KEY is not set. Cannot authenticate requests.'));
  }

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return next(createError(401, 'missing_api_key',
      'Authorization header required: "Bearer <api_key>"'));
  }

  if (token !== apiKey) {
    return next(createError(401, 'invalid_api_key',
      'The API key provided is invalid.'));
  }

  next();
}

module.exports = { requireApiKey };
