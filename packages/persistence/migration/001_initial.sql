-- ============================================================
-- Evidencia V1 — Initial PostgreSQL Schema
-- Migration: 001_initial.sql
-- ============================================================
-- Run with:
--   psql $DATABASE_URL -f packages/persistence/migrations/001_initial.sql
-- Or via: npm run db:migrate
-- ============================================================

-- Required extension for UUID helpers (not used for IDs, but useful for future)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── signing_keys ─────────────────────────────────────────────────────────────
-- Must exist before proofs (foreign key target).
-- Rotated keys are kept indefinitely — required for historical proof verification.

CREATE TABLE IF NOT EXISTS signing_keys (
  id          TEXT        NOT NULL PRIMARY KEY,
  -- Format: kid_ULID — matches keystore.js output

  public_key  TEXT        NOT NULL,
  -- base64url Ed25519 public key (32 bytes encoded)

  algorithm   TEXT        NOT NULL DEFAULT 'ed25519',

  status      TEXT        NOT NULL DEFAULT 'active',
  -- Allowed values: 'active' | 'rotated' | 'revoked'
  -- Only one key should have status='active' at a time (enforced by application)

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rotated_at  TIMESTAMPTZ
  -- NULL while active; set when key is rotated
);

CREATE INDEX IF NOT EXISTS idx_signing_keys_status
  ON signing_keys (status);

-- ─── proofs ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS proofs (
  id              TEXT        NOT NULL PRIMARY KEY,
  -- Format: prf_ULID — chronologically sortable, URL-safe

  file_hash       TEXT        NOT NULL,
  -- Format: "sha256:<hex>" — indexed but NOT UNIQUE
  -- The same file may be certified multiple times in different contexts

  algorithm       TEXT        NOT NULL DEFAULT 'sha256',

  key_id          TEXT        NOT NULL REFERENCES signing_keys(id),
  -- The signing key used — preserved for historical verification after rotation

  receipt         JSONB       NOT NULL,
  -- Complete canonical receipt — self-contained for offline verification

  proof_mode      TEXT        NOT NULL DEFAULT 'production',
  -- 'production' | 'sandbox' | 'demo'
  -- Indicates contractual value of the proof

  capture_source  TEXT        NOT NULL DEFAULT 'api_hash_only',
  -- 'api_hash_only' | 'sdk_mobile' | 'demo_upload' | 'sandbox_upload'
  -- Traces the technical origin of the hash

  metadata        JSONB,
  -- Optional caller-supplied context (reference numbers, etc.)
  -- Never media. Never PII. Caller's responsibility.

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  expires_at      TIMESTAMPTZ
  -- NULL = permanent proof
  -- Non-null reserved for sandbox/demo (e.g. 30-day TTL)
);

-- file_hash lookup (most frequent query path — not unique by design)
CREATE INDEX IF NOT EXISTS idx_proofs_file_hash
  ON proofs (file_hash);

-- Chronological ordering
CREATE INDEX IF NOT EXISTS idx_proofs_created_at
  ON proofs (created_at DESC);

-- Key tracking (useful for rotation audits)
CREATE INDEX IF NOT EXISTS idx_proofs_key_id
  ON proofs (key_id);

-- Mode/source filtering
CREATE INDEX IF NOT EXISTS idx_proofs_proof_mode
  ON proofs (proof_mode);

-- ─── api_keys ─────────────────────────────────────────────────────────────
-- Multi-tenant API keys. Only the scrypt hash is stored, never the raw key.

CREATE TABLE IF NOT EXISTS api_keys (
  id              TEXT        NOT NULL PRIMARY KEY,
  key_hash        TEXT        NOT NULL,
  label           TEXT,
  environment     TEXT        NOT NULL DEFAULT 'live',
  -- 'live' or 'test'
  status          TEXT        NOT NULL DEFAULT 'active',
  -- 'active' | 'revoked'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_api_keys_status
  ON api_keys (status);

-- ─── verification_log ─────────────────────────────────────────────────────────
-- Append-only. Never updated. Used for audit and analytics.

CREATE TABLE IF NOT EXISTS verification_log (
  id                BIGSERIAL   NOT NULL PRIMARY KEY,

  proof_id          TEXT        REFERENCES proofs(id) ON DELETE SET NULL,
  -- NULL if no proof was found (invalid attempt)

  submitted_hash    TEXT,
  -- Hash submitted by the verifier — may differ from proof.file_hash (mismatch case)

  result            TEXT        NOT NULL,
  -- 'valid' | 'invalid' | 'mismatch' | 'not_found'

  checks            JSONB,
  -- Explicit check results: { exists, signatureValid, hashMatch, timestampPlausible }

  verification_mode TEXT,
  -- 'hash_direct' | 'upload_computed' | 'proof_id_only'

  ip_hash           TEXT,
  -- SHA-256 of the verifier's IP address — GDPR compliant (not reversible)

  verified_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vlog_proof_id
  ON verification_log (proof_id);

CREATE INDEX IF NOT EXISTS idx_vlog_result
  ON verification_log (result);

CREATE INDEX IF NOT EXISTS idx_vlog_verified_at
  ON verification_log (verified_at DESC);
