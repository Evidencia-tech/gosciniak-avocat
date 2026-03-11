'use strict';

/**
 * demo.js — Route démo publique
 *
 * POST /v1/demo/proofs
 *
 * Identique à POST /v1/proofs MAIS :
 *   - Aucune clé API requise
 *   - Rate-limit simple par IP (max 20 req / 10 min)
 *   - La preuve est marquée demo: true dans les métadonnées
 *   - captureMethod forcé à "demo_web"
 *
 * Cette route est destinée UNIQUEMENT à la page demo.html publique.
 * Ne jamais exposer la clé API dans le frontend grâce à cette route.
 */

const express = require('express');
const multer  = require('multer');
const { ulid } = require('ulid');

const crypto      = require('../modules/crypto');
const { buildReceipt }    = require('../modules/receipt');
const { insertProof }     = require('../modules/db');
const { createError }     = require('../middleware/errorHandler');

const router = express.Router();

// Multer — mémoire seulement, 20 Mo max pour la démo
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 20 * 1024 * 1024 },
});

// ── Rate-limit maison (en mémoire, sans dépendance externe) ──────────────────
// Structure : { ip → [timestamps] }
const ipLog = new Map();
const WINDOW_MS  = 10 * 60 * 1000; // 10 minutes
const MAX_REQS   = 20;              // 20 certifications par IP par fenêtre

function rateLimit(req, res, next) {
  const ip  = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();

  const times = (ipLog.get(ip) || []).filter(t => now - t < WINDOW_MS);
  times.push(now);
  ipLog.set(ip, times);

  if (times.length > MAX_REQS) {
    return next(createError(429, 'demo_rate_limit',
      'Trop de certifications depuis cette adresse. Réessayez dans 10 minutes.'));
  }

  // Nettoyage périodique (toutes les 500 requêtes)
  if (ipLog.size > 500) {
    for (const [k, v] of ipLog) {
      if (v.every(t => now - t >= WINDOW_MS)) ipLog.delete(k);
    }
  }

  next();
}

// ── POST /v1/demo/proofs ─────────────────────────────────────────────────────
router.post('/', rateLimit, upload.single('file'), async (req, res, next) => {
  try {
    let fileHash;

    if (req.file) {
      fileHash = crypto.hashBuffer(req.file.buffer);
    } else if (req.body && req.body.fileHash) {
      const hash = req.body.fileHash;
      if (!/^(sha256|sha3-256):[a-f0-9]{64}$/i.test(hash)) {
        return next(createError(400, 'hash_format_invalid',
          'fileHash must be in format "sha256:<64-hex-chars>".', 'fileHash'));
      }
      fileHash = hash;
    } else {
      return next(createError(400, 'missing_file_or_hash',
        'Fournissez un champ "file" multipart ou un paramètre "fileHash".'));
    }

    // Métadonnées de la démo
    let extraMeta = {};
    if (req.body && req.body.metadata) {
      try { extraMeta = JSON.parse(req.body.metadata); } catch {}
    }

    const metadata = { ...extraMeta, demo: true, source: 'demo_web' };

    const proofId   = `prf_${ulid()}`;
    const timestamp = new Date().toISOString();

    const signingPayload = crypto.buildSigningPayload(
      proofId, fileHash, timestamp, 'demo_web'
    );
    const { signature, publicKey, keyId } = await crypto.sign(signingPayload);

    const receipt = buildReceipt({
      proofId,
      fileHash,
      timestamp,
      captureMethod: 'demo_web',
      signature,
      publicKey,
      publicKeyId: keyId,
      metadata,
    });

    insertProof(receipt);

    return res.status(201).json({
      id:        proofId,
      object:    'proof',
      status:    'active',
      demo:      true,
      receipt,
      createdAt: timestamp,
    });

  } catch (err) {
    next(err);
  }
});

module.exports = router;
