'use strict';

/**
 * packages/signing/index.js
 *
 * Ed25519 signing and signature verification via libsodium-wrappers.
 *
 * sign()   — loads active key from DB via keystore, signs payload
 * verify() — verifies a signature given a public key buffer
 *
 * Key loading is delegated to keystore.js.
 * No DB access directly. No receipt logic. No route logic.
 */

const _sodium = require('libsodium-wrappers');
const { getActiveKey } = require('./keystore');

let sodium = null;

/**
 * Initialise libsodium (async WASM load).
 * Must be awaited before the server accepts requests.
 * Idempotent — safe to call multiple times.
 *
 * @returns {Promise<object>}
 */
async function ready() {
  if (sodium) return sodium;
  await _sodium.ready;
  sodium = _sodium;
  return sodium;
}

/**
 * Sign a canonical payload buffer with the active Ed25519 key.
 * The active key is loaded from the DB via keystore.getActiveKey().
 *
 * @param {Buffer} payloadBuffer
 * @returns {Promise<{ signature: string, publicKey: string, keyId: string }>}
 *   signature  — base64 Ed25519 detached signature
 *   publicKey  — base64 public key (included in receipt for offline verification)
 *   keyId      — key identifier stored in receipt.publicKeyId
 */
async function sign(payloadBuffer) {
  const na = await ready();
  const { privateKey, publicKey, keyId } = await getActiveKey();

  const sigBytes = na.crypto_sign_detached(payloadBuffer, privateKey);

  return {
    signature: Buffer.from(sigBytes).toString('base64'),
    publicKey: publicKey.toString('base64'),
    keyId,
  };
}

/**
 * Verify an Ed25519 signature against a canonical payload.
 *
 * @param {Buffer} payloadBuffer
 * @param {string} signatureB64   — base64 signature from receipt
 * @param {string} publicKeyB64   — base64 public key (from DB or receipt)
 * @returns {Promise<boolean>}
 */
async function verify(payloadBuffer, signatureB64, publicKeyB64) {
  const na = await ready();
  try {
    const sigBytes    = Buffer.from(signatureB64, 'base64');
    const pubKeyBytes = Buffer.from(publicKeyB64, 'base64');
    return na.crypto_sign_verify_detached(sigBytes, payloadBuffer, pubKeyBytes);
  } catch {
    return false;
  }
}

/**
 * Generate a new Ed25519 keypair.
 * Used by scripts/keygen.js only.
 *
 * @returns {Promise<{ privateKey: string, publicKey: string }>} base64-encoded
 */
async function generateKeyPair() {
  const na = await ready();
  const keypair = na.crypto_sign_keypair();
  return {
    privateKey: Buffer.from(keypair.privateKey).toString('base64'),
    publicKey:  Buffer.from(keypair.publicKey).toString('base64'),
  };
}

module.exports = { ready, sign, verify, generateKeyPair };