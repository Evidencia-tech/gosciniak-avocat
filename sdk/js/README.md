# evidencia — JavaScript SDK

Official JavaScript SDK for the [Evidencia](https://evidencia.tech) proof-of-existence API.

Certify file hashes with Ed25519 signatures. Files are hashed **client-side** and never uploaded — only the SHA-256 hash is sent to the API.

## Install

```bash
npm install evidencia
```

Or load directly in a browser:

```html
<script src="https://cdn.jsdelivr.net/npm/evidencia@1/evidencia.js"></script>
```

## Browser — certify a photo

```javascript
import { Evidencia } from 'evidencia';

const client = new Evidencia({ apiKey: 'evd_sk_live_...' });

// Certify a file from an <input type="file">
const file = document.querySelector('#photo').files[0];
const proof = await client.proofs.create({ file });

console.log(proof.id);                // "prf_01J4X9..."
console.log(proof.receipt.timestamp); // "2026-03-14T12:00:00.000Z"
console.log(proof.receipt.signature); // base64 Ed25519 signature

// Verify the same file
const result = await client.proofs.verify({ proofId: proof.id, file });
console.log(result.valid);                // true
console.log(result.checks.signatureValid); // true
console.log(result.checks.fileHashMatch);  // true
```

## Node.js — verify a proof

```javascript
const { Evidencia } = require('evidencia');
const fs = require('fs');

const client = new Evidencia({ apiKey: process.env.EVIDENCIA_API_KEY });

// Retrieve an existing proof
const proof = await client.proofs.retrieve('prf_01J4X9K2M8N3P5Q7R9S0T1U2V3');
console.log(proof.receipt.fileHash); // "sha256:e3b0c4..."

// Verify with the original file
const buffer = fs.readFileSync('./photo.jpg');
const result = await client.proofs.verify({
  proofId: proof.id,
  file: buffer,
});
console.log(result.valid); // true
```

## Privacy mode — hash locally, submit hash only

```javascript
import { Evidencia, hashFile } from 'evidencia';

const client = new Evidencia({ apiKey: '...' });

// Hash the file locally
const fileHash = await hashFile(myFile); // "sha256:e3b0c4..."

// Only the hash is sent — the file never leaves the device
const proof = await client.proofs.create({ fileHash });
```

## Error handling

```javascript
import {
  Evidencia,
  EvidenciaAuthError,
  EvidenciaNotFoundError,
  EvidenciaValidationError,
} from 'evidencia';

try {
  const proof = await client.proofs.retrieve('prf_NOTEXIST');
} catch (err) {
  if (err instanceof EvidenciaNotFoundError) {
    console.log('Proof not found');
  } else if (err instanceof EvidenciaAuthError) {
    console.log('Invalid API key');
  } else if (err instanceof EvidenciaValidationError) {
    console.log('Bad request:', err.message);
  }
}
```

## Configuration

| Option    | Default                      | Description              |
|-----------|------------------------------|--------------------------|
| `apiKey`  | `EVIDENCIA_API_KEY` env var  | Your API key             |
| `baseUrl` | `https://api.evidencia.io`   | API base URL             |
| `timeout` | `30000`                      | Request timeout (ms)     |

```javascript
const client = new Evidencia({
  apiKey: 'evd_sk_dev_changeme',
  baseUrl: 'http://localhost:3000',
});
```

## API Reference

### `client.proofs.create(params)`

Create a new proof. The file is hashed client-side — never uploaded.

| Param           | Type                         | Required             | Description                          |
|-----------------|------------------------------|----------------------|--------------------------------------|
| `file`          | File / Blob / Buffer         | file or fileHash     | File to prove (hashed client-side)   |
| `fileHash`      | string                       | file or fileHash     | Pre-computed `"sha256:<hex>"` hash   |
| `captureMethod` | string                       | No                   | Default: `"sdk_js"`                  |
| `metadata`      | object                       | No                   | Custom key/value metadata            |

Returns: `Promise<ProofResponse>`

### `client.proofs.retrieve(proofId)`

Retrieve a stored proof receipt by ID.

Returns: `Promise<ProofResponse>`

### `client.proofs.verify(params)`

Verify a proof's Ed25519 signature and optionally check file hash correspondence.

| Param      | Type                         | Required               | Description                          |
|------------|------------------------------|------------------------|--------------------------------------|
| `proofId`  | string                       | proofId or receipt     | Look up receipt from server          |
| `receipt`  | object                       | proofId or receipt     | Inline receipt (offline verify)      |
| `file`     | File / Blob / Buffer         | No                     | Original file for hash check         |
| `fileHash` | string                       | No                     | Pre-computed hash for comparison     |

Returns: `Promise<VerifyResponse>`

### `client.publicKey.retrieve()`

Get the active Ed25519 public signing key.

Returns: `Promise<PublicKeyResponse>`

### `hashFile(input)`

Standalone SHA-256 hash utility. No client instance needed.

```javascript
import { hashFile } from 'evidencia';
const hash = await hashFile(file); // "sha256:e3b0c4..."
```

Accepts: `File`, `Blob`, `ArrayBuffer`, `Buffer`, `Uint8Array`

## License

MIT
