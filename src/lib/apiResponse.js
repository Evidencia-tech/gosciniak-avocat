'use strict';

/**
 * src/lib/apiResponse.js
 *
 * Centralized API response helpers.
 * All JSON responses from Evidencia routes must go through these helpers
 * to guarantee a consistent envelope.
 *
 * Success:
 *   { "requestId": "...", "data": { ... } }
 *
 * Error:
 *   { "requestId": "...", "error": { "code": "...", "message": "..." } }
 *
 * requestId est lu depuis res.req.requestId (injecté par middleware/requestId.js).
 * Si absent (cas rares), requestId est omis silencieusement sans erreur.
 */

function ok(res, data, status = 200) {
  const body = {};
  if (res.req && res.req.requestId) body.requestId = res.req.requestId;
  body.data = data;
  return res.status(status).json(body);
}

function fail(res, status, code, message) {
  const body = {};
  if (res.req && res.req.requestId) body.requestId = res.req.requestId;
  body.error = { code, message };
  return res.status(status).json(body);
}

module.exports = { ok, fail };
