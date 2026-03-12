'use strict';

/**
 * src/middleware/errorHandler.js
 *
 * Centralized error middleware.
 *
 * Error codes and HTTP mappings:
 *   INVALID_INPUT       -> 400
 *   PROOF_NOT_FOUND     -> 404
 *   HASH_MISMATCH       -> 400
 *   SIGNATURE_INVALID   -> 400
 *   UNSUPPORTED_MEDIA   -> 415
 *   PAYLOAD_TOO_LARGE   -> 413
 *   RATE_LIMITED        -> 429
 *   INTERNAL_ERROR      -> 500
 *
 * All error responses use the standard envelope:
 *   { "ok": false, "requestId": "...", "error": { "code": "...", "message": "..." } }
 *
 * Stack traces are never included in responses.
 * In production, internal error details are suppressed entirely.
 */

const IS_PROD = process.env.NODE_ENV === 'production';

function errorHandler(err, req, res, _next) {
  // Multer: file too large
  if (err.code === 'LIMIT_FILE_SIZE') {
    return sendError(req, res, 413, 'PAYLOAD_TOO_LARGE',
      'File exceeds the maximum allowed size.');
  }

  // Multer: unexpected field name
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return sendError(req, res, 400, 'INVALID_INPUT',
      `Unexpected multipart field "${err.field}". Use the field name "file".`);
  }

  // Express JSON body too large (body-parser)
  if (err.type === 'entity.too.large') {
    return sendError(req, res, 413, 'PAYLOAD_TOO_LARGE',
      'Request body exceeds the maximum allowed size (100kb).');
  }

  // Explicit errors thrown by routes via createError()
  if (err.statusCode) {
    const code = err.errorCode || 'INVALID_INPUT';
    return sendError(req, res, err.statusCode, code, err.message);
  }

  // Unexpected / unhandled errors — ne jamais leaker la stack en prod
  console.error('[evidencia] Unhandled error:', err);
  const message = IS_PROD
    ? 'An unexpected error occurred. Please try again.'
    : err.message || 'An unexpected error occurred.';
  return sendError(req, res, 500, 'INTERNAL_ERROR', message);
}

function sendError(req, res, status, code, message) {
  const body = {};
  if (req && req.requestId) body.requestId = req.requestId;
  body.error = { code, message };
  return res.status(status).json(body);
}

/**
 * Create a throwable API error for errorHandler.
 *
 * @param {number} statusCode
 * @param {string} errorCode    -- one of the standard codes above
 * @param {string} message
 */
function createError(statusCode, errorCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.errorCode  = errorCode;
  return err;
}

module.exports = { errorHandler, createError };
