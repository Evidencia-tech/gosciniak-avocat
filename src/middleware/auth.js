'use strict';

/**
 * src/middleware/auth.js
 *
 * Middleware d'authentification par clé API.
 *
 * La clé est lue depuis la variable d'environnement EVIDENCIA_API_KEY.
 * Les endpoints publics (GET /v1/publicKey, POST /v1/verify) ne passent
 * pas par ce middleware.
 *
 * Codes d'erreur normalisés (STEP 5) :
 *   INVALID_INPUT → 401 si clé manquante ou invalide
 *   INTERNAL_ERROR → 500 si serveur mal configuré en production
 */

const { createError } = require('./errorHandler');

function requireApiKey(req, res, next) {
  const apiKey = process.env.EVIDENCIA_API_KEY;

  if (!apiKey) {
    if (process.env.NODE_ENV !== 'production') {
      return next(); // dev mode — pas de clé configurée → accès libre
    }
    return next(createError(500, 'INTERNAL_ERROR',
      'EVIDENCIA_API_KEY is not configured on this server.'));
  }

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return next(createError(401, 'INVALID_INPUT',
      'En-tête Authorization requis : "Bearer <api_key>"'));
  }

  if (token !== apiKey) {
    return next(createError(401, 'INVALID_INPUT',
      'Clé API invalide.'));
  }

  next();
}

module.exports = { requireApiKey };
