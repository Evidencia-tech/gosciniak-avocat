'use strict';

/**
 * errorHandler.js — centralised error response middleware
 *
 * All thrown errors in routes are caught here and formatted as
 * structured Evidencia API error objects (Stripe-style).
 */

function errorHandler(err, req, res, _next) {
  // multer file-size or unexpected-field errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json(apiError('invalid_request_error', 'file_too_large',
      'File exceeds the maximum allowed size of 50 MB.', 'file'));
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json(apiError('invalid_request_error', 'unexpected_field',
      `Unexpected multipart field: ${err.field}. Use the field name "file".`, 'file'));
  }

  // Explicit API errors thrown by routes
  if (err.statusCode) {
    return res.status(err.statusCode).json(apiError(
      err.errorType || 'api_error',
      err.code || 'internal_error',
      err.message,
      err.param,
    ));
  }

  // Unexpected / unhandled errors
  console.error('[evidencia] Unhandled error:', err);
  return res.status(500).json(apiError(
    'api_error', 'internal_error',
    'An unexpected error occurred. Please try again.',
  ));
}

/**
 * Construct a structured API error object.
 */
function apiError(type, code, message, param) {
  const err = { type, code, message };
  if (param) err.param = param;
  err.docUrl = `https://docs.evidencia.io/errors/${code}`;
  return { error: err };
}

/**
 * Create a throwable API error with metadata attached.
 */
function createError(statusCode, code, message, param) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  err.param = param;
  return err;
}

module.exports = { errorHandler, apiError, createError };
