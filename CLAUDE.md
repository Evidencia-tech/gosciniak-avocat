# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Evidencia is a proof-of-existence API that cryptographically certifies file hashes using Ed25519 signatures. Users submit files or pre-computed SHA-256 hashes, and the system returns signed receipts that can be independently verified.

## Commands

- **Start server:** `npm start` (or `node src/server.js`)
- **Dev mode (auto-reload):** `npm run dev`
- **Generate signing keys:** `npm run keygen` (writes to `keys/` directory)
- **Run API tests:** `npm test` (runs `scripts/test-api.js`)
- **DB migration (Postgres):** `npm run db:migrate`

## Architecture

**Modular monolith** — business logic lives in `packages/`, HTTP layer in `src/`.

### packages/ (domain modules, no Express dependency)

- **packages/hashing** — SHA-256 computation. Hash format: `"sha256:<64-hex-chars>"`
- **packages/signing** — Ed25519 sign/verify via libsodium-wrappers. `keystore.js` manages DB-backed key lifecycle and enforces private-key/public-key coherence at startup and on every sign operation
- **packages/receipts** — Builds the V1 receipt object and canonical signing payload (deterministic JSON with sorted keys). Changing `buildSigningPayload` breaks verification of all existing proofs
- **packages/verification** — Orchestrates proof verification: receipt lookup, structure check, signature verification, hash correspondence, timestamp plausibility
- **packages/persistence** — Adapter-based DB layer. `DB_ADAPTER=sqlite` (default) or `DB_ADAPTER=pg`. All access goes through `packages/persistence/index.js` — routes never import adapters or `client.js` directly

### src/ (HTTP layer)

- **src/server.js** — Express app setup, middleware chain, route mounting
- **src/routes/** — Route handlers mounted under `/v1/`. `proofs.js` and `demo.js` require API key auth; `verify.js` and `publicKey.js` are public
- **src/middleware/auth.js** — Bearer token auth via `EVIDENCIA_API_KEY` env var. In dev mode (no key set), auth is bypassed
- **src/middleware/errorHandler.js** — Centralized error handler with `createError()` factory
- **src/lib/apiResponse.js** — `ok(res, data)` / `fail(res, status, code, message)` — all JSON responses use this envelope: `{ requestId, data }` or `{ requestId, error: { code, message } }`

### sdk/ (client SDKs)

- **sdk/js/** — JavaScript/TypeScript SDK (`evidencia` npm package). Works in Node.js >= 18 and browsers. Dual CJS/ESM export. Files are hashed client-side via WebCrypto or Node crypto — never uploaded. Includes TypeScript definitions (`index.d.ts`).
- **sdk/flutter/** — Flutter/Dart SDK. Same client-side hashing approach using `package:crypto`. Targets Dart >= 3.0 / Flutter >= 3.10. Includes `CaptureMethod` enum for mobile capture contexts.

Both SDKs expose `proofs.create()`, `proofs.retrieve()`, `proofs.verify()`, and `publicKey.retrieve()`. Default base URL is `https://api.evidencia.io`.

### Key data flow

1. `POST /v1/proofs` — file/hash in → `hashing.computeHash()` → `receipts.buildSigningPayload()` → `signing.sign()` → `receipts.buildReceipt()` → `persistence.proofs.create()` → receipt out
2. `POST /v1/verify` — proofId/hash in → `verification.verifyProof()` (loads receipt from DB, rebuilds payload, verifies signature against DB public key) → result out

## Environment Variables

- `EVIDENCIA_API_KEY` — API auth key (if unset in dev, auth is disabled)
- `EVIDENCIA_PRIVATE_KEY` / `EVIDENCIA_PUBLIC_KEY` — base64 Ed25519 keys (alternative to filesystem `keys/` directory)
- `EVIDENCIA_KEY_ID` — override key identifier
- `DB_ADAPTER` — `sqlite` (default) or `pg`
- `DB_PATH` — SQLite file path (default: `db/evidencia.db`)
- `DATABASE_URL` — PostgreSQL connection string

## Important Conventions

- Proof IDs use format `prf_<ULID>`
- All API responses go through `ok()` / `fail()` from `src/lib/apiResponse.js` — never use `res.json()` directly in routes
- Errors in routes use `createError(status, code, message)` passed to `next()`
- The signing payload canonicalization is security-critical — keys are sorted alphabetically for determinism
- Private keys never touch the database — they live in env vars or filesystem only
- Comments and error messages are in French in some files (keystore.js, auth.js)
