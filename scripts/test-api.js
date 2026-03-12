#!/usr/bin/env node
'use strict';

const BASE = process.env.API_URL || 'http://localhost:3000';
const API_KEY = process.env.EVIDENCIA_API_KEY || '';

const results = [];

async function test(name, fn) {
  const t0 = performance.now();
  try {
    await fn();
    const ms = (performance.now() - t0).toFixed(0);
    console.log(`  PASS  ${name} (${ms}ms)`);
    results.push({ name, pass: true });
  } catch (err) {
    const ms = (performance.now() - t0).toFixed(0);
    console.log(`  FAIL  ${name} (${ms}ms)`);
    console.log(`        ${err.message}`);
    results.push({ name, pass: false });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function headers(extra = {}) {
  const h = { 'Content-Type': 'application/json', ...extra };
  if (API_KEY) h['Authorization'] = `Bearer ${API_KEY}`;
  return h;
}

// ── Shared state between tests ──────────────────────────────────────────────
let createdProofId = null;
const TEST_HASH = 'sha256:' + 'a'.repeat(64);
const BAD_HASH  = 'sha256:' + 'b'.repeat(64);

// ── Tests ───────────────────────────────────────────────────────────────────

async function run() {
  console.log(`\nEvidencia API tests — ${BASE}\n`);

  // 1. Health check
  await test('GET /health', async () => {
    const res = await fetch(`${BASE}/health`);
    assert(res.ok, `status ${res.status}`);
    const body = await res.json();
    assert(body.data && body.data.status === 'ok', `unexpected body: ${JSON.stringify(body)}`);
  });

  // 2. Get public key
  await test('GET /v1/publicKey', async () => {
    const res = await fetch(`${BASE}/v1/publicKey`);
    assert(res.ok, `status ${res.status}`);
    const body = await res.json();
    assert(body.data && body.data.publicKey, 'missing publicKey in response');
    assert(body.data.keyId, 'missing keyId in response');
    assert(body.data.algorithm.toLowerCase() === 'ed25519', `unexpected algorithm: ${body.data.algorithm}`);
  });

  // 3. Create proof with fileHash
  await test('POST /v1/proofs — create proof', async () => {
    const res = await fetch(`${BASE}/v1/proofs`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ fileHash: TEST_HASH }),
    });
    const body = await res.json();
    assert(res.status === 201, `expected 201, got ${res.status}: ${JSON.stringify(body)}`);
    assert(body.data && body.data.id, 'missing proof id');
    assert(body.data.id.startsWith('prf_'), `bad proof id format: ${body.data.id}`);
    assert(body.data.receipt, 'missing receipt');
    assert(body.data.receipt.fileHash === TEST_HASH, 'receipt fileHash mismatch');
    assert(body.data.receipt.signature, 'missing signature');
    createdProofId = body.data.id;
  });

  // 4. Verify proof by proofId
  await test('POST /v1/verify — valid proof', async () => {
    assert(createdProofId, 'no proofId from previous test');
    const res = await fetch(`${BASE}/v1/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proofId: createdProofId }),
    });
    assert(res.ok, `status ${res.status}`);
    const body = await res.json();
    assert(body.data && body.data.valid === true, `expected valid=true, got ${JSON.stringify(body.data)}`);
    assert(body.data.result === 'valid', `expected result=valid, got ${body.data.result}`);
    assert(body.data.checks.signatureValid === true, 'signature should be valid');
  });

  // 5. Verify with wrong hash — hashMatch should be false
  await test('POST /v1/verify — hash mismatch', async () => {
    assert(createdProofId, 'no proofId from previous test');
    const res = await fetch(`${BASE}/v1/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proofId: createdProofId, fileHash: BAD_HASH }),
    });
    const body = await res.json();
    assert(body.data && body.data.valid === false, `expected valid=false, got ${JSON.stringify(body.data)}`);
    assert(body.data.result === 'mismatch', `expected result=mismatch, got ${body.data.result}`);
    assert(body.data.checks.hashMatch === false, 'hashMatch should be false');
  });

  // ── Summary ─────────────────────────────────────────────────────────────
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  console.log(`\n${passed}/${results.length} passed${failed ? `, ${failed} failed` : ''}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
