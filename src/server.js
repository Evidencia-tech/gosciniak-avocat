'use strict';

const path    = require('path');
const express = require('express');
const helmet  = require('helmet'); // npm install helmet (déjà dans package.json)

const { errorHandler } = require('./middleware/errorHandler');
const { requestId }    = require('./middleware/requestId');
const { ok, fail }     = require('./lib/apiResponse');
const { ready }        = require('../packages/signing');
const { ensureActiveKey } = require('../packages/signing/keystore');
const { ADAPTER, getPool } = require('../packages/persistence/client');

// Routes
const proofsRouter    = require('./routes/proofs');
const verifyRouter    = require('./routes/verify');
const publicKeyRouter = require('./routes/publicKey');
const demoRouter      = require('./routes/demo');
const contactRouter   = require('./routes/contact');
const keysRouter      = require('./routes/keys');
const documentsRouter = require('./routes/documents');

const app  = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// ── 1. Security headers ──────────────────────────────────────────────────────
// helmet() pose les headers de sécurité recommandés (HSTS, nosniff, CSP, etc.)
// crossOriginResourcePolicy: false permet aux assets statiques (demo, verify)
// d'être chargés normalement depuis le navigateur.
app.disable('x-powered-by');
app.use(helmet({
  crossOriginResourcePolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", 'https://cdnjs.cloudflare.com', 'https://cdn.jsdelivr.net'],
      styleSrc:    ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com'],
      fontSrc:     ["'self'", 'https://fonts.gstatic.com'],
      imgSrc:      ["'self'", 'data:', 'blob:'],
      mediaSrc:    ["'self'", 'blob:'],
      connectSrc:  ["'self'"],
      workerSrc:   ["'self'", 'blob:'],
      frameSrc:    ["'self'", 'blob:'],
    },
  },
}));

// ── 1b. Docs subdomain redirect ─────────────────────────────────────────────
app.use((req, res, next) => {
  if (req.hostname === 'docs.evidencia.tech' && req.path === '/') {
    return res.redirect('/docs.html');
  }
  next();
});

// ── 1c. API subdomain guard ──────────────────────────────────────────────────
// On api.evidencia.tech, only /v1/* and /health are reachable — everything else is 404
app.use((req, res, next) => {
  if (req.hostname === 'api.evidencia.tech') {
    if (req.path === '/' && req.method === 'GET') {
      return res.redirect('/api-client.html');
    }
    const allowed = ['/health', '/api-client.html', '/api-client.js', '/ev-system.css', '/nav.js', '/icon-evidencia.png', '/depot', '/depot.html', '/depot.js', '/verify', '/verify.html'];
    if (!req.path.startsWith('/v1/') && !allowed.includes(req.path)) {
      return fail(res, 404, 'NOT_FOUND',
        `No route found for ${req.method} ${req.path}`);
    }
  }
  next();
});

// ── 2. Request ID ────────────────────────────────────────────────────────────
// Généré avant tout traitement — inclus dans chaque réponse JSON via apiResponse.js
app.use(requestId);

// ── 2b. Documents router (before global body parsers — needs 20 MB for encrypted PDFs)
app.use('/v1', documentsRouter);

// ── 3. Static files & body parsers ──────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Limite à 100kb : l'API ne traite que des hashes et métadonnées, jamais des médias
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// ── 4. Request logger ────────────────────────────────────────────────────────
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} rid=${req.requestId}`);
  next();
});

// ── 4b. Legal page routes ────────────────────────────────────────────────────
app.get('/privacy', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/privacy.html'));
});
app.get('/legal', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/legal.html'));
});
app.get('/depot', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/depot.html'));
});
app.get('/verify', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/verify.html'));
});

// ── 5. Routes système ────────────────────────────────────────────────────────

// Endpoint léger — aucune requête DB
app.get('/health', (req, res) => {
  return ok(res, {
    status:    'ok',
    service:   'evidencia-api',
    version:   '0.1',
    timestamp: new Date().toISOString(),
  });
});

// Métadonnées publiques — ne jamais exposer les clés privées
app.get('/v1/info', (req, res) => {
  return ok(res, {
    service: 'Evidencia API',
    version: '0.1',
    proof: {
      hashAlgorithm:      'SHA-256',
      signatureAlgorithm: 'Ed25519',
      receiptVersion:     '1.0',
    },
    verification: {
      publicKeyEndpoint: '/v1/publicKey',
    },
  });
});

// ── 6. API routes ────────────────────────────────────────────────────────────
app.use('/v1/proofs',      proofsRouter);
app.use('/v1/verify',      verifyRouter);
app.use('/v1/publicKey',   publicKeyRouter);
app.use('/v1/demo/proofs', demoRouter);
app.use('/v1/contact',     contactRouter);
app.use('/v1/keys',        keysRouter);

// ── 7. 404 ───────────────────────────────────────────────────────────────────
app.use((req, res) => {
  return fail(res, 404, 'NOT_FOUND',
    `No route found for ${req.method} ${req.path}`);
});

// ── 8. Error handler ─────────────────────────────────────────────────────────
app.use(errorHandler);

// ── Auto-migrate (PG only) ───────────────────────────────────────────────────
async function autoMigrate() {
  if (ADAPTER !== 'pg') return;

  const fs   = require('fs');
  const pool = getPool();

  // Check if tables already exist
  const { rows } = await pool.query(
    `SELECT COUNT(*) AS c FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'proofs'`
  );
  if (parseInt(rows[0].c, 10) > 0) {
    console.log('[evidencia] PG tables already exist — skipping migration');
    return;
  }

  const sqlPath = path.join(__dirname, '../packages/persistence/migration/001_initial.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  await pool.query(sql);
  console.log('[evidencia] PG migration 001_initial.sql applied');
}

// ── Boot ─────────────────────────────────────────────────────────────────────
async function start() {
  await autoMigrate();

  await ready();
  console.log('[evidencia] libsodium ready');

  await ensureActiveKey();
  console.log('[evidencia] signing key registered');

  app.listen(PORT, () => {
    console.log(`[evidencia] API running on http://localhost:${PORT}`);
    console.log(`[evidencia] Verification portal: http://localhost:${PORT}/verify.html`);
    console.log(`[evidencia] Storage adapter: ${ADAPTER}`);

    const adminKey = process.env.EVIDENCIA_ADMIN_KEY || process.env.EVIDENCIA_API_KEY;
    if (!adminKey) {
      console.warn('[evidencia] WARNING: EVIDENCIA_ADMIN_KEY not set — auth DISABLED');
    }
  });
}

start().catch(err => {
  console.error('[evidencia] Failed to start:', err);
  process.exit(1);
});

module.exports = app;
