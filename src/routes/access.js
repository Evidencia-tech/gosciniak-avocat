'use strict';

/**
 * Access request and admin approval routes.
 *
 * POST /v1/access-requests         — submit a new access request (public)
 * GET  /v1/access-requests         — list all requests (admin only)
 * GET  /admin/approve?token=xxx    — approve a request, generate API key, email requester
 * GET  /admin/refuse?token=xxx     — refuse a request, email requester
 *
 * Admin routes return HTML (or JSON when ?format=json is passed).
 */

const express  = require('express');
const crypto   = require('crypto');
const { ulid } = require('ulid');

const { accessRequests, apiKeys } = require('../../packages/persistence');
const { requireApiKey, requireAdmin, hashApiKey, generateRawKey } = require('../middleware/auth');
const { ok, fail } = require('../lib/apiResponse');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function sendEmail(payload) {
  const apiKey = process.env.RESEND_API_KEY;
  const from   = process.env.CONTACT_FROM || 'Evidencia <noreply@evidencia.io>';
  if (!apiKey) {
    console.warn('[access] RESEND_API_KEY not set — email skipped');
    return;
  }
  const resp = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ from, ...payload }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    console.error('[access] Resend error:', err?.message || resp.status);
  }
}

// ── POST /v1/access-requests ──────────────────────────────────────────────────

router.post('/access-requests', async (req, res, next) => {
  try {
    const { name, email, organization, use_case } = req.body || {};

    if (!name || !name.trim())
      return fail(res, 400, 'VALIDATION_ERROR', 'Nom requis.');
    if (!email || !EMAIL_RE.test(email.trim()))
      return fail(res, 400, 'VALIDATION_ERROR', 'Adresse email invalide.');
    if (!use_case || !use_case.trim())
      return fail(res, 400, 'VALIDATION_ERROR', "Cas d'usage requis.");

    const id           = `req_${ulid()}`;
    const approveToken = crypto.randomBytes(32).toString('hex');
    const refuseToken  = crypto.randomBytes(32).toString('hex');
    const createdAt    = new Date().toISOString();

    await accessRequests.create({
      id,
      name:         name.trim(),
      email:        email.trim().toLowerCase(),
      organization: (organization || '').trim() || null,
      useCase:      use_case.trim(),
      approveToken,
      refuseToken,
      createdAt,
    });

    const adminEmail = process.env.CONTACT_TO || 'hello@evidencia.io';
    const baseUrl    = process.env.BASE_URL    || 'https://evidencia.tech';
    const approveUrl = `${baseUrl}/admin/approve?token=${approveToken}`;
    const refuseUrl  = `${baseUrl}/admin/refuse?token=${refuseToken}`;

    await sendEmail({
      to:      [adminEmail],
      subject: `[Evidencia] Nouvelle demande d'accès — ${name.trim()}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1a1814">
          <h2 style="color:#1a1814;border-bottom:2px solid #e8e4df;padding-bottom:12px">
            Nouvelle demande d'accès
          </h2>
          <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
            <tr><td style="padding:8px 0;color:#8a8580;width:140px">Nom</td><td style="padding:8px 0"><strong>${esc(name.trim())}</strong></td></tr>
            <tr><td style="padding:8px 0;color:#8a8580">Email</td><td style="padding:8px 0"><a href="mailto:${esc(email.trim())}">${esc(email.trim())}</a></td></tr>
            ${(organization || '').trim() ? `<tr><td style="padding:8px 0;color:#8a8580">Organisation</td><td style="padding:8px 0">${esc((organization || '').trim())}</td></tr>` : ''}
            <tr><td style="padding:8px 0;color:#8a8580;vertical-align:top">Cas d'usage</td><td style="padding:8px 0;white-space:pre-wrap">${esc(use_case.trim())}</td></tr>
            <tr><td style="padding:8px 0;color:#8a8580">ID</td><td style="padding:8px 0;font-family:monospace;font-size:12px">${esc(id)}</td></tr>
          </table>
          <div style="display:flex;gap:12px;flex-wrap:wrap;">
            <a href="${approveUrl}" style="display:inline-block;background:#16a34a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">✓ Approuver</a>
            <a href="${refuseUrl}"  style="display:inline-block;background:#dc2626;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">✗ Refuser</a>
          </div>
          <p style="margin-top:24px;font-size:12px;color:#b0a89e">
            Evidencia · ${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}
          </p>
        </div>
      `,
    });

    console.log(`[access] New request: ${id} — ${email.trim()}`);
    return ok(res, { id, status: 'pending' }, 201);

  } catch (err) {
    next(err);
  }
});

// ── GET /v1/access-requests (admin) ───────────────────────────────────────────

router.get('/access-requests', requireApiKey, requireAdmin, async (req, res, next) => {
  try {
    const requests = await accessRequests.findAll();
    return ok(res, { requests });
  } catch (err) {
    next(err);
  }
});

// ── GET /admin/approve ────────────────────────────────────────────────────────

router.get('/admin/approve', async (req, res, next) => {
  const jsonMode = req.query.format === 'json';
  try {
    const { token } = req.query;
    if (!token) {
      return jsonMode
        ? res.status(400).json({ error: 'Token manquant.' })
        : res.status(400).send(adminPage('Erreur', 'Token manquant.', 'error'));
    }

    const request = await accessRequests.findByApproveToken(token);
    if (!request) {
      return jsonMode
        ? res.status(404).json({ error: 'Demande introuvable ou déjà traitée.' })
        : res.status(404).send(adminPage('Introuvable', 'Demande introuvable ou déjà traitée.', 'error'));
    }
    if (request.status !== 'pending') {
      const msg = `Cette demande a déjà été ${request.status === 'approved' ? 'approuvée' : 'refusée'}.`;
      return jsonMode
        ? res.json({ status: request.status, message: msg })
        : res.send(adminPage('Déjà traitée', msg, request.status === 'approved' ? 'approved' : 'refused'));
    }

    const rawKey  = generateRawKey('live');
    const keyHash = await hashApiKey(rawKey);
    const keyId   = `key_${ulid()}`;

    await apiKeys.create({
      id:          keyId,
      keyHash,
      label:       `Accès ${request.name} (${request.email})`,
      environment: 'live',
    });

    await accessRequests.updateStatus(request.id, 'approved', keyId);

    await sendEmail({
      to:      [request.email],
      subject: '[Evidencia] Votre accès a été accordé',
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1a1814">
          <h2 style="color:#1a1814;border-bottom:2px solid #e8e4df;padding-bottom:12px">Votre accès Evidencia est prêt</h2>
          <p>Bonjour ${esc(request.name)},</p>
          <p>Votre demande d'accès a été approuvée. Voici votre clé API&nbsp;:</p>
          <div style="background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:8px;padding:16px 20px;margin:20px 0">
            <div style="font-family:monospace;font-size:13px;font-weight:600;color:#166534;word-break:break-all">${esc(rawKey)}</div>
          </div>
          <p style="color:#dc2626;font-weight:600">⚠ Conservez cette clé en lieu sûr. Elle ne sera plus affichée.</p>
          <p>Pour l'utiliser :</p>
          <ul style="line-height:1.8">
            <li>Rendez-vous sur <a href="https://evidencia.tech/depot">evidencia.tech/depot</a></li>
            <li>Via l'API : en-tête <code>Authorization: Bearer &lt;votre_clé&gt;</code></li>
            <li>Via le <a href="https://evidencia.tech/dashboard.html">dashboard</a> pour gérer vos preuves</li>
          </ul>
          <p>Pour toute question : <a href="mailto:hello@evidencia.tech">hello@evidencia.tech</a></p>
          <p style="margin-top:24px;font-size:12px;color:#b0a89e">Evidencia · Infrastructure de preuve numérique</p>
        </div>
      `,
    });

    console.log(`[access] Approved: ${request.id} — ${request.email} — key ${keyId}`);

    const msg = `Accès accordé à ${request.name} (${request.email}). La clé API lui a été envoyée par email.`;
    return jsonMode
      ? res.json({ status: 'approved', message: msg })
      : res.send(adminPage('Demande approuvée', msg, 'approved'));

  } catch (err) {
    if (jsonMode) return res.status(500).json({ error: 'Erreur interne.' });
    next(err);
  }
});

// ── GET /admin/refuse ─────────────────────────────────────────────────────────

router.get('/admin/refuse', async (req, res, next) => {
  const jsonMode = req.query.format === 'json';
  try {
    const { token } = req.query;
    if (!token) {
      return jsonMode
        ? res.status(400).json({ error: 'Token manquant.' })
        : res.status(400).send(adminPage('Erreur', 'Token manquant.', 'error'));
    }

    const request = await accessRequests.findByRefuseToken(token);
    if (!request) {
      return jsonMode
        ? res.status(404).json({ error: 'Demande introuvable ou déjà traitée.' })
        : res.status(404).send(adminPage('Introuvable', 'Demande introuvable ou déjà traitée.', 'error'));
    }
    if (request.status !== 'pending') {
      const msg = `Cette demande a déjà été ${request.status === 'approved' ? 'approuvée' : 'refusée'}.`;
      return jsonMode
        ? res.json({ status: request.status, message: msg })
        : res.send(adminPage('Déjà traitée', msg, request.status === 'approved' ? 'approved' : 'refused'));
    }

    await accessRequests.updateStatus(request.id, 'refused', null);

    await sendEmail({
      to:      [request.email],
      subject: "[Evidencia] Votre demande d'accès",
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1a1814">
          <h2 style="color:#1a1814;border-bottom:2px solid #e8e4df;padding-bottom:12px">Demande d'accès</h2>
          <p>Bonjour ${esc(request.name)},</p>
          <p>Nous avons bien reçu votre demande d'accès à Evidencia. Après examen, nous ne sommes pas en mesure d'y répondre favorablement pour le moment.</p>
          <p>Si vous souhaitez plus d'informations ou discuter de votre cas d'usage, n'hésitez pas à nous contacter&nbsp;: <a href="mailto:hello@evidencia.tech">hello@evidencia.tech</a></p>
          <p style="margin-top:24px;font-size:12px;color:#b0a89e">Evidencia · Infrastructure de preuve numérique</p>
        </div>
      `,
    });

    console.log(`[access] Refused: ${request.id} — ${request.email}`);

    const msg = `La demande de ${request.name} (${request.email}) a été refusée. Un email lui a été envoyé.`;
    return jsonMode
      ? res.json({ status: 'refused', message: msg })
      : res.send(adminPage('Demande refusée', msg, 'refused'));

  } catch (err) {
    if (jsonMode) return res.status(500).json({ error: 'Erreur interne.' });
    next(err);
  }
});

// ── HTML page helper ──────────────────────────────────────────────────────────

function adminPage(title, message, type) {
  const colors = {
    approved: { bg: '#f0fdf4', border: '#bbf7d0', icon: '✓', iconColor: '#16a34a' },
    refused:  { bg: '#fef2f2', border: '#fecaca', icon: '✗', iconColor: '#dc2626' },
    error:    { bg: '#fffbeb', border: '#fde68a', icon: '!', iconColor: '#d97706' },
  };
  const c = colors[type] || colors.error;
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Evidencia — ${esc(title)}</title>
  <link rel="icon" type="image/png" href="/icon-evidencia.png">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#fafaf9;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}
    .card{background:#fff;border:1.5px solid #e8e4df;border-radius:16px;padding:40px 36px;max-width:480px;width:100%;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,0.06)}
    .icon{width:56px;height:56px;border-radius:50%;background:${c.bg};border:2px solid ${c.border};display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-size:24px;color:${c.iconColor}}
    h1{font-size:22px;color:#1a1814;margin-bottom:12px;font-family:Georgia,serif;letter-spacing:-0.01em}
    p{font-size:14px;color:#5a5550;line-height:1.6;margin-bottom:20px}
    a.home{display:inline-block;margin-top:4px;font-size:13px;color:#2563eb;text-decoration:none}
    a.home:hover{text-decoration:underline}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${c.icon}</div>
    <h1>${esc(title)}</h1>
    <p>${message}</p>
    <a class="home" href="/">← Retour à l'accueil</a>
  </div>
</body>
</html>`;
}

module.exports = router;
