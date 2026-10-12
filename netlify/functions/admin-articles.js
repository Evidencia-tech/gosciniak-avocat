/* ============================================================
   ADMIN — back-office blog
   GET    /api/admin/articles
   POST   /api/admin/article
   DELETE /api/admin/article/:id
   ============================================================ */

const { readArticles, writeArticles } = require('../lib/articles');

const ADMIN_PWD = process.env.ADMIN_PASSWORD;

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
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

// "/api/admin/article/3" ou "/.netlify/functions/admin-articles/article/3" → ["article", "3"]
function routeSegments(eventPath) {
  const match = (eventPath || '').match(/(?:\/api\/admin|\/admin-articles)(?:\/(.*))?$/);
  return (match && match[1] ? match[1] : '').split('/').filter(Boolean);
}

exports.handler = async (event) => {
  if (!ADMIN_PWD) {
    return json(500, { ok: false, error: 'ADMIN_PASSWORD non configuré' });
  }
  const headers = event.headers || {};
  if ((headers.authorization || headers.Authorization) !== `Bearer ${ADMIN_PWD}`) {
    return json(401, { ok: false, error: 'Non autorisé' });
  }

  const [resource, param] = routeSegments(event.path);
  const method = event.httpMethod;

  try {
    if (method === 'GET' && resource === 'articles') {
      return json(200, { ok: true, articles: await readArticles(event) });
    }

    if (method === 'POST' && resource === 'article') {
      let body;
      try {
        body = JSON.parse(event.body || '{}');
      } catch (_err) {
        return json(400, { ok: false, error: 'JSON invalide' });
      }
      const { titre, date, categorie, extrait, contenu } = body;
      if (!titre || !date || !categorie || !extrait || !contenu) {
        return json(400, { ok: false, error: 'Champs manquants' });
      }
      const articles = await readArticles(event);
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
      await writeArticles(event, articles);
      return json(200, { ok: true, article });
    }

    if (method === 'DELETE' && resource === 'article') {
      const id = parseInt(param, 10);
      if (isNaN(id)) return json(400, { ok: false, error: 'ID invalide' });
      const articles = await readArticles(event);
      const filtered = articles.filter(a => a.id !== id);
      if (filtered.length === articles.length) {
        return json(404, { ok: false, error: 'Article non trouvé' });
      }
      await writeArticles(event, filtered);
      return json(200, { ok: true });
    }

    return json(404, { ok: false, error: 'Route inconnue' });
  } catch (err) {
    console.error(err);
    return json(500, { ok: false, error: err.message });
  }
};
