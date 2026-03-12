'use strict';

/**
 * POST /v1/contact
 * Reçoit le formulaire de contact et envoie un email via Resend.
 *
 * Variables d'environnement requises :
 *   RESEND_API_KEY   — clé API Resend (https://resend.com)
 *   CONTACT_TO       — adresse de destination (ex: hello@evidencia.io)
 *   CONTACT_FROM     — adresse expéditeur vérifiée sur Resend (ex: noreply@evidencia.io)
 *                      ⚠ doit appartenir à un domaine vérifié dans Resend
 */

const express = require('express');
const { ok, fail } = require('../lib/apiResponse');

const router = express.Router();

// ── Validation basique ────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(body) {
  const { prenom, nom, email, message } = body;
  if (!prenom || !prenom.trim()) return 'Prénom manquant.';
  if (!nom    || !nom.trim())    return 'Nom manquant.';
  if (!email  || !EMAIL_RE.test(email.trim())) return 'Adresse email invalide.';
  if (!message || !message.trim()) return 'Message manquant.';
  return null;
}

// ── Envoi via Resend (fetch natif Node 18+) ───────────────────────────────────

async function sendViaResend({ prenom, nom, email, societe, sujet, message }) {
  const apiKey = process.env.RESEND_API_KEY;
  const to     = process.env.CONTACT_TO   || 'hello@evidencia.io';
  const from   = process.env.CONTACT_FROM || 'Evidencia Contact <noreply@evidencia.io>';

  if (!apiKey) {
    console.warn('[contact] RESEND_API_KEY non configurée — email non envoyé');
    throw new Error('Service email non configuré.');
  }

  const subject = `[Evidencia Contact] ${sujet || 'Demande de contact'} — ${prenom} ${nom}`;

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1a1814">
      <h2 style="color:#1a1814;border-bottom:2px solid #e8e4df;padding-bottom:12px">
        Nouveau message — Evidencia Contact
      </h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <tr><td style="padding:8px 0;color:#8a8580;width:120px">Prénom</td><td style="padding:8px 0"><strong>${esc(prenom)}</strong></td></tr>
        <tr><td style="padding:8px 0;color:#8a8580">Nom</td><td style="padding:8px 0"><strong>${esc(nom)}</strong></td></tr>
        <tr><td style="padding:8px 0;color:#8a8580">Email</td><td style="padding:8px 0"><a href="mailto:${esc(email)}">${esc(email)}</a></td></tr>
        ${societe ? `<tr><td style="padding:8px 0;color:#8a8580">Société</td><td style="padding:8px 0">${esc(societe)}</td></tr>` : ''}
        <tr><td style="padding:8px 0;color:#8a8580">Sujet</td><td style="padding:8px 0">${esc(sujet || '—')}</td></tr>
      </table>
      <div style="background:#f8f6f3;border-radius:8px;padding:20px;white-space:pre-wrap;line-height:1.6">${esc(message)}</div>
      <p style="margin-top:24px;font-size:12px;color:#b0a89e">
        Envoyé via le formulaire evidencia.io · ${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}
      </p>
    </div>
  `;

  const resp = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      from,
      to:      [to],
      reply_to: email,
      subject,
      html,
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err?.message || `Resend error ${resp.status}`);
  }
}

function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Route ─────────────────────────────────────────────────────────────────────

router.post('/', async (req, res) => {
  const { prenom, nom, email, societe, sujet, message } = req.body;

  const err = validate(req.body);
  if (err) return fail(res, 400, 'VALIDATION_ERROR', err);

  try {
    await sendViaResend({
      prenom: prenom.trim(),
      nom:    nom.trim(),
      email:  email.trim().toLowerCase(),
      societe: (societe || '').trim(),
      sujet:   (sujet   || '').trim(),
      message: message.trim(),
    });

    console.log(`[contact] Message envoyé — ${email} — "${sujet}"`);
    return ok(res, { sent: true });

  } catch (e) {
    console.error('[contact] Erreur envoi email:', e.message);
    return fail(res, 503, 'EMAIL_ERROR', 'L\'email n\'a pas pu être envoyé. Réessayez dans quelques instants.');
  }
});

module.exports = router;
