'use strict';

/**
 * crypto.js — Evidencia cryptographic engine
 *
 * Responsibilities:
 *   - SHA-256 file hashing
 *   - Ed25519 key generation, signing, and verification
 *   - Canonical signing payload construction
 *   - Key loading from environment / key files
 */

const nodeCrypto = require('crypto');
const fs = require('fs');
const path = require('path');

// libsodium is async-initialised; we expose a ready() promise.
const _sodium = require('libsodium-wrappers');
let sodium = null;

async function ready() {
  if (sodium) return sodium;
  await _sodium.ready;
  sodium = _sodium;
  return sodium;
}

// ─── Hashing ────────────────────────────────────────────────────────────────

/**
 * Hash a Buffer or string with SHA-256.
 * Returns the prefixed hex string: "sha256:<hex>"
 */
function hashBuffer(buffer) {
  const hex = nodeCrypto.createHash('sha256').update(buffer).digest('hex');
  return `sha256:${hex}`;
}

/**
 * Extract the raw hex digest from a prefixed hash string.
 * "sha256:abc..." → "abc..."
 */
function rawHex(prefixedHash) {
  const parts = prefixedHash.split(':');
  if (parts.length !== 2) throw new Error(`Invalid hash format: ${prefixedHash}`);
  return parts[1];
}

// ─── Signing payload ─────────────────────────────────────────────────────────

/**
 * Build the canonical signing payload.
 * Keys are sorted alphabetically (RFC 8785 spirit) for determinism.
 * This is what gets signed — not just the file hash.
 */
function buildSigningPayload(proofId, fileHash, timestamp, captureMethod) {
  const payload = {
    captureMethod,
    fileHash,
    proofId,
    schemaVersion: '1',
    timestamp,
  };
  // JSON.stringify with sorted keys = deterministic canonical form
  return Buffer.from(JSON.stringify(payload, Object.keys(payload).sort()));
}

// ─── Key management ──────────────────────────────────────────────────────────

const KEY_DIR = path.resolve(process.env.KEY_DIR || path.join(__dirname, '../../keys'));

/**
 * Load the active Ed25519 keypair from disk.
 * Files: keys/private.key (base64), keys/public.key (base64), keys/key-id.txt
 * Falls back to env vars EVIDENCIA_PRIVATE_KEY, EVIDENCIA_PUBLIC_KEY.
 */
function loadKeyPair() {
  // Try environment variables first (production / container use)
  if (process.env.EVIDENCIA_PRIVATE_KEY && process.env.EVIDENCIA_PUBLIC_KEY) {
    return {
      privateKey: Buffer.from(process.env.EVIDENCIA_PRIVATE_KEY, 'base64'),
      publicKey: Buffer.from(process.env.EVIDENCIA_PUBLIC_KEY, 'base64'),
      keyId: process.env.EVIDENCIA_KEY_ID || 'key_env',
    };
  }

  // Try disk
  const privPath = path.join(KEY_DIR, 'private.key');
  const pubPath = path.join(KEY_DIR, 'public.key');
  const idPath = path.join(KEY_DIR, 'key-id.txt');

  if (!fs.existsSync(privPath) || !fs.existsSync(pubPath)) {
    throw new Error(
      `Signing keys not found. Run:  npm run keygen\n` +
      `Expected at: ${KEY_DIR}/private.key and public.key`
    );
  }

  return {
    privateKey: Buffer.from(fs.readFileSync(privPath, 'utf8').trim(), 'base64'),
    publicKey: Buffer.from(fs.readFileSync(pubPath, 'utf8').trim(), 'base64'),
    keyId: fs.existsSync(idPath) ? fs.readFileSync(idPath, 'utf8').trim() : 'key_default',
  };
}

// ─── Signing ─────────────────────────────────────────────────────────────────

/**
 * Sign a message Buffer with Ed25519.
 * Returns: { signature: string (base64), publicKey: string (base64), keyId: string }
 */
async function sign(messageBuffer) {
  const na = await ready();
  const { privateKey, publicKey, keyId } = loadKeyPair();

  // libsodium Ed25519 sign — returns 64-byte signature
  const sigBytes = na.crypto_sign_detached(messageBuffer, privateKey);

  return {
    signature: Buffer.from(sigBytes).toString('base64'),
    publicKey: publicKey.toString('base64'),
    keyId,
  };
}

/**
 * Verify an Ed25519 signature.
 * @param {Buffer} messageBuffer — the canonical signing payload
 * @param {string} signatureB64 — base64 signature from receipt
 * @param {string} publicKeyB64 — base64 public key from receipt
 * @returns {boolean}
 */
async function verify(messageBuffer, signatureB64, publicKeyB64) {
  const na = await ready();
  try {
    const sigBytes = Buffer.from(signatureB64, 'base64');
    const pubKeyBytes = Buffer.from(publicKeyB64, 'base64');
    return na.crypto_sign_verify_detached(sigBytes, messageBuffer, pubKeyBytes);
  } catch {
    return false;
  }
}

// ─── Key generation (used by keygen script) ──────────────────────────────────

/**
 * Generate a new Ed25519 keypair and return base64-encoded keys.
 */
async function generateKeyPair() {
  const na = await ready();
  const keypair = na.crypto_sign_keypair();
  return {
    privateKey: Buffer.from(keypair.privateKey).toString('base64'),
    publicKey: Buffer.from(keypair.publicKey).toString('base64'),
  };
}

module.exports = {
  ready,
  hashBuffer,
  rawHex,
  buildSigningPayload,
  sign,
  verify,
  generateKeyPair,
  loadKeyPair,
};
