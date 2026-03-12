'use strict';

/**
 * src/middleware/requestId.js
 *
 * Génère un identifiant unique par requête, attaché à req.requestId.
 * Utilise crypto.randomBytes (Node built-in) — pas de dépendance externe.
 * Cet ID est ensuite inclus dans toutes les réponses JSON via apiResponse.js.
 */

const { randomBytes } = require('crypto');

function requestId(req, _res, next) {
  req.requestId = randomBytes(12).toString('hex'); // 24 chars hex
  next();
}

module.exports = { requestId };
