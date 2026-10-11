const express = require('express');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

app.post('/api/contact', async (req, res) => {
  const { nom, societe, email, objet, message } = req.body;

  try {
    await resend.emails.send({
      from: process.env.CONTACT_FROM,
      to: process.env.CONTACT_TO,
      subject: `[Gosciniak Avocat] ${objet} — ${nom}`,
      html: `
        <h2>Nouvelle demande de contact</h2>
        <p><strong>Nom :</strong> ${nom}</p>
        <p><strong>Société :</strong> ${societe || 'Non renseigné'}</p>
        <p><strong>Email :</strong> ${email}</p>
        <p><strong>Objet :</strong> ${objet}</p>
        <p><strong>Message :</strong></p>
        <p>${message}</p>
      `
    });
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/* ============================================================
   ADMIN — back-office blog
   ============================================================ */

const BLOG_DATA_PATH = path.join(__dirname, 'blog-data.js');
const ADMIN_PWD      = 'Gosciniak2026!';

function adminAuth(req, res) {
  if (req.headers['authorization'] !== `Bearer ${ADMIN_PWD}`) {
    res.status(401).json({ ok: false, error: 'Non autorisé' });
    return false;
  }
  return true;
}

function readArticles() {
  const code    = fs.readFileSync(BLOG_DATA_PATH, 'utf8');
  const sandbox = {};
  vm.runInNewContext(code, sandbox);
  return Array.isArray(sandbox.articles) ? sandbox.articles : [];
}

function writeArticles(articles) {
  const header = `/* ============================================================
   BLOG ARTICLES — blog-data.js
   Pour publier un nouvel article : copier un objet, modifier
   les champs, incrémenter l'id. Aucune autre manipulation.
   ============================================================ */\n\n`;
  fs.writeFileSync(BLOG_DATA_PATH, header + `var articles = ${JSON.stringify(articles, null, 2)};\n`, 'utf8');
}

function formatDateFr(isoDate) {
  const months = ['janvier','février','mars','avril','mai','juin',
                  'juillet','août','septembre','octobre','novembre','décembre'];
  const [year, month, day] = isoDate.split('-').map(Number);
  return `${day} ${months[month - 1]} ${year}`;
}

function convertToParagraphs(text) {
  return text
    .split(/\n[ \t]*\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0)
    .map(p => `<p>${p.replace(/\n/g, ' ')}</p>`)
    .join('\n');
}

app.get('/admin', (_req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/api/admin/articles', (req, res) => {
  if (!adminAuth(req, res)) return;
  try {
    res.json({ ok: true, articles: readArticles() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/admin/article', (req, res) => {
  if (!adminAuth(req, res)) return;
  const { titre, date, categorie, extrait, contenu } = req.body;
  if (!titre || !date || !categorie || !extrait || !contenu) {
    return res.status(400).json({ ok: false, error: 'Champs manquants' });
  }
  try {
    const articles = readArticles();
    const maxId    = articles.reduce((m, a) => Math.max(m, a.id || 0), 0);
    const article  = {
      id:        maxId + 1,
      titre:     titre.trim(),
      date:      formatDateFr(date),
      categorie,
      extrait:   extrait.trim(),
      contenu:   convertToParagraphs(contenu),
    };
    articles.unshift(article);
    writeArticles(articles);
    res.json({ ok: true, article });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete('/api/admin/article/:id', (req, res) => {
  if (!adminAuth(req, res)) return;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ ok: false, error: 'ID invalide' });
  try {
    const articles = readArticles();
    const filtered = articles.filter(a => a.id !== id);
    if (filtered.length === articles.length) {
      return res.status(404).json({ ok: false, error: 'Article non trouvé' });
    }
    writeArticles(filtered);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
