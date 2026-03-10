![README](README_2.md)# evidencia — JavaScript SDK

Official JavaScript SDK for the [Evidencia](https://evidencia.io) proof infrastructure API.

## Install

```bash
npm install evidencia
```

## Quick Start

```javascript
import { Evidencia } from 'evidencia';

const client = new Evidencia({ apiKey: 'evd_sk_live_...' });

// Create a proof from a file upload input
const file = document.querySelector('input[type=file]').files[0];
const proof = await client.proofs.create({ file });
console.log(proof.id); // prf_01J4X9...

// Verify it
const result = await client.proofs.verify({ proofId: proof.id, file });
console.log(result.valid); // true
console.log(result.checks.signatureValid); // true
console.log(result.checks.fileHashMatch);  // true
```

## Node.js

```javascript
const { Evidencia } = require('evidencia');
const fs = require('fs');

const client = new Evidencia({ apiKey: process.env.EVIDENCIA_API_KEY });

// From a Buffer
const buffer = fs.readFileSync('./damage_photo.jpg');
const proof = await client.proofs.create({
  file: buffer,
  captureMethod: 'api_upload',
  metadata: { claimId: 'CLM-9821', adjuster: 'J. Dupont' },
});
```

## Privacy mode — hash client-side, never send file

```javascript
import { Evidencia, hashFile } from 'evidencia';

const client = new Evidencia({ apiKey: '...' });

// 1. Hash the file locally
const fileHash = await hashFile(myFile);  // "sha256:e3b0..."

// 2. Submit hash only — file never leaves the browser
const proof = await client.proofs.create({ fileHash, captureMethod: 'sdk_web' });
```

## Retrieve a proof

```javascript
const proof = await client.proofs.retrieve('prf_01J4X9K2M8N3P5Q7R9S0T1U2V3');
console.log(proof.receipt.timestamp); // "2025-08-14T10:42:00.000Z"
```

## Verify an inline receipt (fully offline)

```javascript
// receipt is a local JSON object — no server lookup, no proofId
const result = await client.proofs.verify({
  receipt: savedReceipt,
  file: originalFile,
});
```

## Error handling

```javascript
import { Evidencia, EvidenciaNotFoundError, EvidenciaAuthError } from 'evidencia';

try {
  const proof = await client.proofs.retrieve('prf_NOTEXIST');
} catch (err) {
  if (err instanceof EvidenciaNotFoundError) {
    console.log('Proof not found:', err.code);
  } else if (err instanceof EvidenciaAuthError) {
    console.log('Invalid API key');
  } else {
    console.error('Unexpected error:', err.message);
  }
}
```

## Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `apiKey` | `EVIDENCIA_API_KEY` env | Your API key |
| `baseUrl` | `https://api.evidencia.io` | API base URL |
| `timeout` | `30000` | Request timeout (ms) |

```javascript
// Development: point at local backend
const client = new Evidencia({
  apiKey: 'evd_sk_dev_changeme',
  baseUrl: 'http://localhost:3000',
});
```

## API

### `client.proofs.create(params)`
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | File / Blob / Buffer | One of file or fileHash | File to prove (hashed client-side) |
| `fileHash` | string | One of file or fileHash | Pre-computed `"sha256:..."` hash |
| `captureMethod` | string | No | Default: `"sdk_js"` |
| `metadata` | object | No | Custom key/value metadata |

### `client.proofs.retrieve(proofId)`
Returns the stored proof receipt.

### `client.proofs.verify(params)`
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `proofId` | string | One of proofId or receipt | Look up receipt from server |
| `receipt` | object | One of proofId or receipt | Inline receipt (offline) |
| `file` | File / Blob / Buffer | No | Original file for hash check |
| `fileHash` | string | No | Pre-computed hash for comparison |

### `hashFile(input)`
Compute SHA-256 of a file. Returns `"sha256:<hex>"`. Standalone helper, no client needed.
