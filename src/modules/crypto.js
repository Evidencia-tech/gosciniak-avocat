'use strict';

/**
 * src/modules/crypto.js — DEPRECATED
 *
 * This module is no longer the source of truth for cryptographic operations.
 * All logic has moved to dedicated packages:
 *
 *   Hashing       → packages/hashing/index.js
 *   Signing       → packages/signing/index.js
 *   Key loading   → packages/signing/keystore.js
 *   Payload build → packages/receipts/index.js (buildSigningPayload)
 *
 * This file is kept only for reference and will be removed in a future step.
 * DO NOT import this module from new code.
 */
