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
  if (event.httpMethod !== 'POST') {
    return json(405, { ok: false, error: 'Méthode non autorisée' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (_err) {
    return json(400, { ok: false, error: 'JSON invalide' });
  }

  const { nom, societe, email, objet, message } = body;
  if (!nom || !email || !objet || !message) {
    return json(400, { ok: false, error: 'Champs manquants' });
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
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
    if (error) throw new Error(error.message);
    return json(200, { ok: true });
  } catch (error) {
    console.error(error);
    return json(500, { ok: false, error: error.message });
  }
};
