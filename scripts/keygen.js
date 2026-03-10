#!/usr/bin/env node
'use strict';

/**
 * keygen.js — Generate and persist an Ed25519 keypair for Evidencia.
 *
 * Writes to:
 *   keys/private.key   — base64-encoded 64-byte Ed25519 private key
 *   keys/public.key    — base64-encoded 32-byte Ed25519 public key
 *   keys/key-id.txt    — key identifier string
 *
 * Run: npm run keygen
 *
 * ⚠  The private key MUST be kept secret. Never commit it to git.
 *    In production, inject via EVIDENCIA_PRIVATE_KEY env var instead.
 */

const fs = require('fs');
const path = require('path');
const { generateKeyPair } = require('../src/modules/crypto');

const KEY_DIR = path.resolve(__dirname, '../keys');

async function main() {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║    Evidencia Ed25519 Key Generator   ║');
  console.log('╚══════════════════════════════════════╝\n');

  // Check if keys already exist
  const privPath = path.join(KEY_DIR, 'private.key');
  if (fs.existsSync(privPath)) {
    console.log('⚠  Keys already exist at:', KEY_DIR);
    console.log('   Delete keys/ directory to regenerate.\n');
    process.exit(0);
  }

  fs.mkdirSync(KEY_DIR, { recursive: true });

  console.log('Generating Ed25519 keypair via libsodium...');
  const { privateKey, publicKey } = await generateKeyPair();

  // Build a time-based key ID
  const now = new Date();
  const keyId = `key_${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}_A`;

  fs.writeFileSync(path.join(KEY_DIR, 'private.key'), privateKey, 'utf8');
  fs.writeFileSync(path.join(KEY_DIR, 'public.key'), publicKey, 'utf8');
  fs.writeFileSync(path.join(KEY_DIR, 'key-id.txt'), keyId, 'utf8');

  // .gitignore to protect the private key
  const gitignore = path.join(KEY_DIR, '.gitignore');
  fs.writeFileSync(gitignore, 'private.key\n', 'utf8');

  console.log('✓ Keys written to:', KEY_DIR);
  console.log('  private.key  — Ed25519 private key (64 bytes, base64)');
  console.log('  public.key   — Ed25519 public key  (32 bytes, base64)');
  console.log('  key-id.txt   —', keyId);
  console.log('  .gitignore   — protects private.key from git\n');

  console.log('Public key (base64):');
  console.log(' ', publicKey);
  console.log('\n⚠  NEVER commit private.key to git.');
  console.log('   In production: use EVIDENCIA_PRIVATE_KEY env var.\n');
}

main().catch(err => {
  console.error('Key generation failed:', err);
  process.exit(1);
});
