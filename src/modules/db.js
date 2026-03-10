'use strict';

/**
 * db.js — SQLite persistence layer
 *
 * Schema:
 *   proofs  — one row per proof, stores the full receipt JSON plus
 *             indexed columns for fast lookups.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '../../db/evidencia.db');

// Ensure db directory exists
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── Schema ──────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS proofs (
    id            TEXT PRIMARY KEY,          -- proofId (ULID-based, prefixed "prf_")
    file_hash     TEXT NOT NULL,             -- "sha256:<hex>" — indexed for duplicate detection
    timestamp     TEXT NOT NULL,             -- ISO 8601 UTC
    capture_method TEXT NOT NULL,
    key_id        TEXT NOT NULL,             -- which signing key was used
    receipt_json  TEXT NOT NULL,             -- full receipt, serialised JSON
    created_at    INTEGER NOT NULL           -- Unix ms, for ordering
  );

  CREATE INDEX IF NOT EXISTS idx_proofs_file_hash ON proofs(file_hash);
  CREATE INDEX IF NOT EXISTS idx_proofs_created_at ON proofs(created_at);
`);

// ─── Operations ──────────────────────────────────────────────────────────────

const stmtInsert = db.prepare(`
  INSERT INTO proofs (id, file_hash, timestamp, capture_method, key_id, receipt_json, created_at)
  VALUES (@id, @fileHash, @timestamp, @captureMethod, @keyId, @receiptJson, @createdAt)
`);

const stmtGetById = db.prepare(`
  SELECT receipt_json FROM proofs WHERE id = ?
`);

const stmtGetByHash = db.prepare(`
  SELECT receipt_json FROM proofs WHERE file_hash = ? ORDER BY created_at DESC
`);

/**
 * Persist a proof record.
 * @param {object} receipt — full receipt object (will be JSON-serialised)
 */
function insertProof(receipt) {
  stmtInsert.run({
    id: receipt.proofId,
    fileHash: receipt.fileHash,
    timestamp: receipt.timestamp,
    captureMethod: receipt.captureMethod,
    keyId: receipt.publicKeyId,
    receiptJson: JSON.stringify(receipt),
    createdAt: Date.now(),
  });
}

/**
 * Retrieve a proof receipt by proofId.
 * @returns {object|null} receipt object, or null if not found
 */
function getProofById(proofId) {
  const row = stmtGetById.get(proofId);
  return row ? JSON.parse(row.receipt_json) : null;
}

/**
 * Retrieve all proof receipts matching a file hash.
 * @returns {object[]} array of receipt objects
 */
function getProofsByHash(fileHash) {
  const rows = stmtGetByHash.all(fileHash);
  return rows.map(r => JSON.parse(r.receipt_json));
}

module.exports = { insertProof, getProofById, getProofsByHash };
