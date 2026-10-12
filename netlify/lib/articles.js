/* ============================================================
   Stockage des articles du blog (Netlify Blobs)
   Le système de fichiers des Functions est en lecture seule :
   les articles sont persistés dans un store Blobs, initialisé
   à partir du blog-data.js livré avec le déploiement.
   ============================================================ */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { getStore, connectLambda } = require('@netlify/blobs');

const STORE_NAME = 'blog';
const ARTICLES_KEY = 'articles';

function readSeedArticles() {
  const candidates = [
    path.join(process.cwd(), 'blog-data.js'),
    path.join(__dirname, '..', '..', 'blog-data.js'),
  ];
  const file = candidates.find(p => fs.existsSync(p));
  if (!file) return [];
  const sandbox = {};
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox);
  return Array.isArray(sandbox.articles) ? sandbox.articles : [];
}

function store(event) {
  connectLambda(event);
  return getStore({ name: STORE_NAME, consistency: 'strong' });
}

async function readArticles(event) {
  const saved = await store(event).get(ARTICLES_KEY, { type: 'json' });
  return Array.isArray(saved) ? saved : readSeedArticles();
}

async function writeArticles(event, articles) {
  await store(event).setJSON(ARTICLES_KEY, articles);
}

module.exports = { readArticles, writeArticles };
