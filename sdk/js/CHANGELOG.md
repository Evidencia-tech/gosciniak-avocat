# Changelog

## 1.0.0 (2026-03-14)

Initial public release.

- `Evidencia` client with API key authentication
- `client.proofs.create()` — certify a file hash with Ed25519 signature
- `client.proofs.retrieve()` — fetch a proof receipt by ID
- `client.proofs.verify()` — verify signature and optional file hash match
- `client.publicKey.retrieve()` — get the active signing public key
- `hashFile()` — standalone SHA-256 utility (WebCrypto in browser, Node.js crypto in Node)
- Typed error classes: `EvidenciaAuthError`, `EvidenciaNotFoundError`, `EvidenciaValidationError`
- Full TypeScript definitions (`index.d.ts`)
- Works in Node.js >= 18 and modern browsers
- Automatic retry with exponential backoff on network errors
- 30s default timeout with AbortController
