'use strict';

/**
 * packages/signing/keystore.js
 *
 * DB-backed signing key management.
 *
 * Invariant de sécurité fondamental :
 *   La clé privée (env/filesystem) et la clé publique active (DB)
 *   doivent TOUJOURS correspondre. Toute divergence est une erreur
 *   fatale détectée au démarrage — jamais silencieuse.
 *
 * Clé privée : jamais en DB. Source unique = env vars ou filesystem.
 * Clé publique : source de vérité = DB (signing_keys). Le receipt
 *   embarque aussi la clé publique pour la vérification hors-ligne.
 */

const fs   = require('fs');
const path = require('path');

// Lazy-loaded pour éviter les imports circulaires au démarrage.
let _persistenceKeys = null;
function getPersistenceKeys() {
  if (!_persistenceKeys) _persistenceKeys = require('../persistence').keys;
  return _persistenceKeys;
}

const KEY_DIR = path.resolve(
  process.env.KEY_DIR || path.join(__dirname, '../../keys')
);

// ---- Chargement brut de la clé (filesystem / env) ---------------------------
// La clé privée n'est JAMAIS stockée en DB. C'est l'unique source.

function loadRawKeyPair() {
  if (process.env.EVIDENCIA_PRIVATE_KEY && process.env.EVIDENCIA_PUBLIC_KEY) {
    return {
      privateKey: Buffer.from(process.env.EVIDENCIA_PRIVATE_KEY, 'base64'),
      publicKey:  Buffer.from(process.env.EVIDENCIA_PUBLIC_KEY,  'base64'),
    };
  }

  const privPath = path.join(KEY_DIR, 'private.key');
  const pubPath  = path.join(KEY_DIR, 'public.key');

  if (!fs.existsSync(privPath) || !fs.existsSync(pubPath)) {
    throw new Error(
      `Clés de signature introuvables. Exécutez : npm run keygen\n` +
      `Attendu dans : ${KEY_DIR}/private.key et public.key`
    );
  }

  return {
    privateKey: Buffer.from(fs.readFileSync(privPath, 'utf8').trim(), 'base64'),
    publicKey:  Buffer.from(fs.readFileSync(pubPath,  'utf8').trim(), 'base64'),
  };
}

function deriveKeyId(publicKey) {
  if (process.env.EVIDENCIA_KEY_ID) return process.env.EVIDENCIA_KEY_ID;

  const idPath = path.join(KEY_DIR, 'key-id.txt');
  if (fs.existsSync(idPath)) return fs.readFileSync(idPath, 'utf8').trim();

  const { createHash } = require('crypto');
  const hex = createHash('sha256').update(publicKey).digest('hex').slice(0, 16);
  return `kid_${hex}`;
}

// ---- Vérification de cohérence ----------------------------------------------

/**
 * Compare deux Buffers de clés publiques en constant-time.
 * Retourne true si identiques, false sinon.
 * Utilise timingSafeEqual pour éviter les timing attacks (bonne pratique
 * même si ce n'est pas un chemin d'authentification directe).
 */
function publicKeysMatch(bufA, bufB) {
  const { timingSafeEqual } = require('crypto');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Vérifie que la clé publique active en DB correspond exactement
 * à la clé publique chargée depuis env/filesystem.
 *
 * @param {Buffer} localPublicKey  — clé publique lue localement
 * @param {string} dbPublicKeyB64  — clé publique stockée en DB (base64)
 * @param {string} dbKeyId         — id de la clé en DB (pour le message d'erreur)
 * @throws si les clés ne correspondent pas
 */
function assertKeysMatch(localPublicKey, dbPublicKeyB64, dbKeyId) {
  const dbPublicKey = Buffer.from(dbPublicKeyB64, 'base64');

  if (!publicKeysMatch(localPublicKey, dbPublicKey)) {
    throw new Error(
      `[keystore] INCOHÉRENCE FATALE : la clé publique active en DB (${dbKeyId}) ` +
      `ne correspond pas à la clé publique locale (env/filesystem).\n` +
      `\n` +
      `DB        : ${dbPublicKeyB64.slice(0, 20)}...\n` +
      `Local     : ${localPublicKey.toString('base64').slice(0, 20)}...\n` +
      `\n` +
      `Causes possibles :\n` +
      `  - Rotation de clé incomplète (nouvelle clé locale, ancienne clé en DB)\n` +
      `  - Mauvais KEY_DIR ou variables d'environnement incorrectes\n` +
      `  - Restauration de DB depuis un backup avec des clés différentes\n` +
      `\n` +
      `Action requise : vérifier la cohérence de KEY_DIR / EVIDENCIA_PUBLIC_KEY ` +
      `avec la clé active en DB, ou effectuer une rotation de clé proprement.`
    );
  }
}

// ---- API publique ------------------------------------------------------------

/**
 * Garantit qu'une clé active est enregistrée en DB ET cohérente
 * avec la clé locale. À appeler une fois au démarrage (après libsodium ready).
 *
 * Cas 1 — Aucune clé active en DB :
 *   → charge la clé publique locale, l'enregistre en DB. OK.
 *
 * Cas 2 — Clé active en DB, correspond à la clé locale :
 *   → no-op. OK.
 *
 * Cas 3 — Clé active en DB, ne correspond PAS à la clé locale :
 *   → ERREUR FATALE. Refuse le démarrage.
 *
 * @returns {Promise<void>}
 * @throws  si incohérence DB / clé locale détectée
 */
async function ensureActiveKey() {
  console.log('[keystore] ensureActiveKey called');
  const keys = getPersistenceKeys();

  // Charger la clé locale en premier — échec rapide si absente
  let localPublicKey;
  try {
    ({ publicKey: localPublicKey } = loadRawKeyPair());
  } catch (err) {
    throw new Error(
      `[keystore] ensureActiveKey() impossible : clé locale introuvable.\n${err.message}`
    );
  }

  const existing = await keys.getActive();

  if (!existing) {
    // Cas 1 : première utilisation — enregistrer la clé locale en DB
    const keyId = deriveKeyId(localPublicKey);
    console.log('[keystore] registering signing key', keyId);
    await keys.upsert({
      id:        keyId,
      publicKey: localPublicKey.toString('base64'),
      algorithm: 'ed25519',
      status:    'active',
    });
    console.log('[keystore] signing key registered in DB:', keyId);
    return;
  }

  // Cas 2 / 3 : clé existante en DB — vérification de cohérence obligatoire
  console.log('[keystore] active key already in DB', existing.id);
  assertKeysMatch(localPublicKey, existing.publicKey, existing.id);
  // Si on arrive ici : les clés correspondent → OK, no-op.
}

/**
 * Retourne le keypair actif pour la signature.
 * La clé privée vient de l'env/filesystem.
 * La clé publique et le keyId viennent de la DB.
 * La cohérence est garantie par le check intégré.
 *
 * @returns {Promise<{ privateKey: Buffer, publicKey: Buffer, keyId: string }>}
 * @throws  si aucune clé active en DB
 * @throws  si incohérence DB / clé locale
 */
async function getActiveKey() {
  const keys = getPersistenceKeys();
  const record = await keys.getActive();

  if (!record) {
    throw new Error(
      '[keystore] Aucune clé de signature active en DB. ' +
      'Vérifiez que ensureActiveKey() a été appelé au démarrage.'
    );
  }

  const { privateKey, publicKey: localPublicKey } = loadRawKeyPair();

  // Vérification de cohérence à chaque appel de signe
  // Coût : timingSafeEqual sur 32 octets — négligeable
  assertKeysMatch(localPublicKey, record.publicKey, record.id);

  return {
    privateKey,
    publicKey: localPublicKey,  // identique à Buffer.from(record.publicKey, 'base64')
    keyId:     record.id,
  };
}

/**
 * Retourne la clé publique d'un keyId donné (pour la vérification).
 * Permet de résoudre des clés historiques après rotation.
 *
 * @param {string} kid
 * @returns {Promise<{ keyId: string, publicKey: Buffer, algorithm: string } | null>}
 */
async function getKeyById(kid) {
  const keys = getPersistenceKeys();
  const record = await keys.getById(kid);
  if (!record) return null;

  return {
    keyId:     record.id,
    publicKey: Buffer.from(record.publicKey, 'base64'),
    algorithm: record.algorithm,
  };
}

/**
 * Retourne la clé publique active uniquement (sans matériel privé).
 * Utilisé par GET /v1/public-key.
 *
 * @returns {Promise<{ publicKey: Buffer, keyId: string }>}
 */
async function getActivePublicKey() {
  const keys = getPersistenceKeys();
  const record = await keys.getActive();

  if (record) {
    return {
      publicKey: Buffer.from(record.publicKey, 'base64'),
      keyId:     record.id,
    };
  }

  // Fallback avant la première preuve (GET /v1/public-key avant boot complet)
  const { publicKey } = loadRawKeyPair();
  const keyId = deriveKeyId(publicKey);
  return { publicKey, keyId };
}

module.exports = {
  ensureActiveKey,
  getActiveKey,
  getKeyById,
  getActivePublicKey,
  loadRawKeyPair,
};
