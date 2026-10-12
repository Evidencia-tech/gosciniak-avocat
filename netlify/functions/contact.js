const { Resend } = require('resend');

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

exports.handler = async (event) => {
  console.log('[contact] requête reçue', {
    method: event.httpMethod,
    path: event.path,
    contentType: (event.headers || {})['content-type'],
    isBase64Encoded: event.isBase64Encoded,
  });
  // Présence des variables uniquement — la clé n'est jamais loguée
  console.log('[contact] configuration', {
    RESEND_API_KEY: process.env.RESEND_API_KEY ? 'définie' : 'MANQUANTE',
    CONTACT_FROM: process.env.CONTACT_FROM || 'MANQUANTE',
    CONTACT_TO: process.env.CONTACT_TO || 'MANQUANTE',
  });

  if (event.httpMethod !== 'POST') {
    return json(405, { ok: false, error: 'Méthode non autorisée' });
  }

  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf8')
    : event.body;
  console.log('[contact] body reçu', rawBody);

  let body;
  try {
    body = JSON.parse(rawBody || '{}');
  } catch (err) {
    console.error('[contact] JSON invalide', err);
    return json(400, { ok: false, error: 'JSON invalide' });
  }

  const { nom, societe, email, objet, message } = body;
  if (!nom || !email || !objet || !message) {
    console.error('[contact] champs manquants', {
      nom: !!nom, email: !!email, objet: !!objet, message: !!message,
    });
    return json(400, { ok: false, error: 'Champs manquants' });
  }

  const missing = ['RESEND_API_KEY', 'CONTACT_FROM', 'CONTACT_TO'].filter(k => !process.env[k]);
  if (missing.length) {
    console.error('[contact] variables d\'environnement manquantes', missing);
    return json(500, { ok: false, error: `Configuration manquante : ${missing.join(', ')}` });
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from: process.env.CONTACT_FROM,
      to: process.env.CONTACT_TO,
      replyTo: email,
      subject: `[Gosciniak Avocat] ${objet} — ${nom}`,
      html: `
        <h2>Nouvelle demande de contact</h2>
        <p><strong>Nom :</strong> ${esc(nom)}</p>
        <p><strong>Société :</strong> ${esc(societe) || 'Non renseigné'}</p>
        <p><strong>Email :</strong> ${esc(email)}</p>
        <p><strong>Objet :</strong> ${esc(objet)}</p>
        <p><strong>Message :</strong></p>
        <p>${esc(message).replace(/\n/g, '<br>')}</p>
      `,
    });
    if (error) {
      console.error('[contact] erreur Resend', JSON.stringify(error, null, 2));
      return json(502, { ok: false, error: error.message, code: error.name });
    }
    console.log('[contact] e-mail envoyé', data);
    return json(200, { ok: true });
  } catch (error) {
    console.error('[contact] exception', error && error.stack ? error.stack : error);
    return json(500, { ok: false, error: error.message });
  }
};
