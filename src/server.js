'use strict';

/**
 * server.js — Evidencia API server
 *
 * Starts the Express application with all routes and middleware.
 * Environment variables:
 *   PORT                 — HTTP port (default: 3000)
 *   NODE_ENV             — "development" | "production"
 *   EVIDENCIA_API_KEY    — API key for authenticated endpoints
 *   EVIDENCIA_PRIVATE_KEY — base64 Ed25519 private key (or use keys/ dir)
 *   EVIDENCIA_PUBLIC_KEY  — base64 Ed25519 public key (or use keys/ dir)
 *   EVIDENCIA_KEY_ID      — key identifier (default: key_env)
 *   KEY_DIR              — path to keys directory (default: ./keys)
 *   DB_PATH              — path to SQLite database (default: ./db/evidencia.db)
 */

const path = require('path');
const express = require('express');
const { errorHandler } = require('./middleware/errorHandler');
const { ready } = require('./modules/crypto');

// Routes
const proofsRouter    = require('./routes/proofs');
const verifyRouter    = require('./routes/verify');
const publicKeyRouter = require('./routes/publicKey');
const demoRouter      = require('./routes/demo');

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// ─── Global middleware ───────────────────────────────────────────────────────

// Serve the public verification portal
app.use(express.static(path.join(__dirname, '../public')));

// Parse JSON bodies (for non-multipart requests)
app.use(express.json());

// Parse URL-encoded bodies
app.use(express.urlencoded({ extended: true }));

// Request logger (compact, structured)
app.use((req, _res, next) => {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${req.method} ${req.path}`);
  next();
});

// ─── Routes ──────────────────────────────────────────────────────────────────

app.get('/api', (_req, res) => {
  res.json({
    service: 'Evidencia API',
    version: '1.0.0',
    status: 'ok',
    endpoints: {
      createProof:   'POST   /v1/proofs',
      getProof:      'GET    /v1/proofs/:id',
      verifyProof:   'POST   /v1/verify    (public)',
      publicKey:     'GET    /v1/public-key (public)',
    },
    verificationPortal: `http://localhost:${PORT}/verify.html`,
    docs: 'https://docs.evidencia.io',
  });
});

app.use('/v1/proofs',       proofsRouter);
app.use('/v1/verify',       verifyRouter);
app.use('/v1/public-key',   publicKeyRouter);
app.use('/v1/demo/proofs',  demoRouter);   // démo publique — sans clé API

// 404 for unmatched routes
app.use((req, res) => {
  res.status(404).json({
    error: {
      type: 'invalid_request_error',
      code: 'route_not_found',
      message: `No route found for ${req.method} ${req.path}`,
    },
  });
});

// ─── Error handler ───────────────────────────────────────────────────────────

app.use(errorHandler);

// ─── Boot ────────────────────────────────────────────────────────────────────

async function start() {
  // Pre-initialise libsodium (async WASM load) before accepting requests
  await ready();
  console.log('[evidencia] libsodium ready');

  app.listen(PORT, () => {
    console.log(`[evidencia] API server running on http://localhost:${PORT}`);
    console.log(`[evidencia] Verification portal: http://localhost:${PORT}/verify.html`);
    console.log(`[evidencia] Environment: ${process.env.NODE_ENV || 'development'}`);

    if (!process.env.EVIDENCIA_API_KEY) {
      console.warn('[evidencia] ⚠  EVIDENCIA_API_KEY not set — auth is DISABLED');
    }
  });
}

start().catch(err => {
  console.error('[evidencia] Failed to start:', err);
  process.exit(1);
});

module.exports = app; // for testing
