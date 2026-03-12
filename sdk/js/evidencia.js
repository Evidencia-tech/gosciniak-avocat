/**
 * evidencia.js — Official JavaScript SDK for the Evidencia API
 *
 * Works in:
 *   - Node.js (≥ 18) — uses native fetch + crypto
 *   - Browsers        — uses WebCrypto API + native fetch
 *   - Bundlers        — ESM and CJS compatible (dual export via package.json)
 *
 * Install:
 *   npm install evidencia
 *
 * Usage:
 *   import { Evidencia } from 'evidencia';
 *   const client = new Evidencia({ apiKey: 'evd_sk_live_...' });
 *
 *   // Create a proof from a File or Buffer
 *   const proof = await client.proofs.create({ file: myFile });
 *
 *   // Verify a proof
 *   const result = await client.proofs.verify({ proofId: proof.id });
 */

'use strict';

// ─── Constants ────────────────────────────────────────────────────────────────

const SDK_VERSION = '1.0.0';
const DEFAULT_BASE_URL = 'https://api.evidencia.io';
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;

// ─── Errors ───────────────────────────────────────────────────────────────────

class EvidenciaError extends Error {
  constructor(message, { type, code, param, statusCode, raw } = {}) {
    super(message);
    this.name = 'EvidenciaError';
    this.type = type || 'api_error';
    this.code = code || 'unknown_error';
    this.param = param || null;
    this.statusCode = statusCode || null;
    this.raw = raw || null;
  }
}

class EvidenciaAuthError extends EvidenciaError {
  constructor(message, opts) {
    super(message, { ...opts, type: 'authentication_error' });
    this.name = 'EvidenciaAuthError';
  }
}

class EvidenciaNotFoundError extends EvidenciaError {
  constructor(message, opts) {
    super(message, { ...opts, type: 'not_found_error' });
    this.name = 'EvidenciaNotFoundError';
  }
}

class EvidenciaValidationError extends EvidenciaError {
  constructor(message, opts) {
    super(message, { ...opts, type: 'invalid_request_error' });
    this.name = 'EvidenciaValidationError';
  }
}

// ─── HTTP Client ──────────────────────────────────────────────────────────────

class HttpClient {
  constructor({ baseUrl, apiKey, timeout, userAgent }) {
    this._baseUrl = baseUrl.replace(/\/$/, '');
    this._apiKey = apiKey;
    this._timeout = timeout;
    this._userAgent = userAgent;
  }

  async request(method, path, { body, headers = {}, retries = MAX_RETRIES } = {}) {
    const url = `${this._baseUrl}${path}`;

    const reqHeaders = {
      'User-Agent': this._userAgent,
      'X-Evidencia-SDK': `js/${SDK_VERSION}`,
      ...headers,
    };
    if (this._apiKey) reqHeaders['Authorization'] = `Bearer ${this._apiKey}`;

    let bodyData = undefined;
    if (body instanceof FormData) {
      bodyData = body;
      // Let browser/Node set Content-Type with boundary
    } else if (body !== undefined) {
      bodyData = JSON.stringify(body);
      reqHeaders['Content-Type'] = 'application/json';
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this._timeout);

    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const resp = await fetch(url, {
          method,
          headers: reqHeaders,
          body: bodyData,
          signal: controller.signal,
        });

        clearTimeout(timer);

        let data;
        const ct = resp.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          data = await resp.json();
        } else {
          data = await resp.text();
        }

        if (!resp.ok) {
          const errBody = typeof data === 'object' ? data?.error : {};
          const msg = errBody?.message || `Request failed with status ${resp.status}`;
          const opts = { type: errBody?.type, code: errBody?.code, param: errBody?.param, statusCode: resp.status, raw: data };
          if (resp.status === 401 || resp.status === 403) throw new EvidenciaAuthError(msg, opts);
          if (resp.status === 404) throw new EvidenciaNotFoundError(msg, opts);
          if (resp.status === 400 || resp.status === 422) throw new EvidenciaValidationError(msg, opts);
          throw new EvidenciaError(msg, opts);
        }

        return data;

      } catch (err) {
        clearTimeout(timer);
        // Only retry on network errors, not API errors
        if (err instanceof EvidenciaError) throw err;
        lastError = err;
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, 2 ** attempt * 400));
        }
      }
    }

    throw new EvidenciaError(
      lastError?.name === 'AbortError' ? 'Request timed out.' : `Network error: ${lastError?.message}`,
      { code: lastError?.name === 'AbortError' ? 'timeout' : 'network_error' }
    );
  }

  get(path, opts) { return this.request('GET', path, opts); }
  post(path, opts) { return this.request('POST', path, opts); }
}

// ─── Hashing utilities ────────────────────────────────────────────────────────

/**
 * Compute SHA-256 of a File, Blob, ArrayBuffer, or Uint8Array.
 * Uses WebCrypto in browser, Node.js crypto in Node.
 * Returns: "sha256:<hex>"
 */
async function hashFile(input) {
  let buffer;

  if (typeof File !== 'undefined' && input instanceof File) {
    buffer = await input.arrayBuffer();
  } else if (typeof Blob !== 'undefined' && input instanceof Blob) {
    buffer = await input.arrayBuffer();
  } else if (input instanceof ArrayBuffer) {
    buffer = input;
  } else if (input instanceof Uint8Array || Buffer.isBuffer(input)) {
    buffer = input.buffer || input;
  } else {
    throw new EvidenciaValidationError('hashFile: unsupported input type. Provide a File, Blob, ArrayBuffer, Buffer, or Uint8Array.');
  }

  // Browser path — WebCrypto
  if (typeof globalThis.crypto?.subtle !== 'undefined') {
    const hashBuf = await globalThis.crypto.subtle.digest('SHA-256', buffer);
    const hex = Array.from(new Uint8Array(hashBuf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    return `sha256:${hex}`;
  }

  // Node.js path
  const nodeCrypto = await import('crypto');
  const b = Buffer.isBuffer(input) ? input : Buffer.from(buffer);
  const hex = nodeCrypto.default.createHash('sha256').update(b).digest('hex');
  return `sha256:${hex}`;
}

// ─── Proofs resource ──────────────────────────────────────────────────────────

class ProofsResource {
  constructor(http) {
    this._http = http;
  }

  /**
   * Create a new proof.
   *
   * @param {object} params
   * @param {File|Blob|Buffer}  [params.file]          — file to hash and prove (hashed client-side)
   * @param {string}            [params.fileHash]       — pre-computed "sha256:..." hash (privacy mode)
   * @param {string}            [params.captureMethod]  — default: "sdk_js"
   * @param {object}            [params.metadata]       — custom key/value metadata
   * @returns {Promise<ProofResponse>}
   */
  async create({ file, fileHash, captureMethod = 'sdk_js', metadata = {} } = {}) {
    if (!file && !fileHash) {
      throw new EvidenciaValidationError('Provide either a "file" or a "fileHash".');
    }

    // Always hash client-side — never send raw file to server
    const hash = fileHash || await hashFile(file);

    const body = {
      fileHash: hash,
      captureMethod,
      metadata: JSON.stringify(metadata),
    };

    return this._http.post('/v1/proofs', { body });
  }

  /**
   * Retrieve a proof receipt by ID.
   * @param {string} proofId — e.g. "prf_01J4..."
   * @returns {Promise<ProofResponse>}
   */
  async retrieve(proofId) {
    if (!proofId) throw new EvidenciaValidationError('"proofId" is required.');
    return this._http.get(`/v1/proofs/${proofId}`);
  }

  /**
   * Verify a proof.
   *
   * @param {object} params
   * @param {string}           [params.proofId]   — look up receipt from server
   * @param {object}           [params.receipt]   — inline receipt (offline-style)
   * @param {File|Blob|Buffer} [params.file]       — original file to check hash match
   * @param {string}           [params.fileHash]   — pre-computed hash to check
   * @returns {Promise<VerifyResponse>}
   */
  async verify({ proofId, receipt, file, fileHash } = {}) {
    if (!proofId && !receipt) {
      throw new EvidenciaValidationError('Provide either "proofId" or "receipt".');
    }

    const body = {};
    if (proofId) body.proofId = proofId;
    if (receipt) body.receipt = JSON.stringify(receipt);

    // Hash the file client-side if provided
    if (file && !fileHash) {
      body.fileHash = await hashFile(file);
    } else if (fileHash) {
      body.fileHash = fileHash;
    }

    return this._http.post('/v1/verify', { body });
  }
}

// ─── PublicKey resource ───────────────────────────────────────────────────────

class PublicKeyResource {
  constructor(http) {
    this._http = http;
  }

  /** Retrieve the active public signing key. */
  async retrieve() {
    return this._http.get('/v1/publicKey');
  }
}

// ─── Main client ──────────────────────────────────────────────────────────────

class Evidencia {
  /**
   * @param {object} config
   * @param {string}  config.apiKey   — your Evidencia API key (evd_sk_live_...)
   * @param {string}  [config.baseUrl]  — override API base URL (default: https://api.evidencia.io)
   * @param {number}  [config.timeout]  — request timeout in ms (default: 30000)
   */
  constructor({ apiKey, baseUrl, timeout } = {}) {
    if (!apiKey && typeof process !== 'undefined') {
      apiKey = process.env.EVIDENCIA_API_KEY;
    }

    const http = new HttpClient({
      baseUrl: baseUrl || DEFAULT_BASE_URL,
      apiKey,
      timeout: timeout || DEFAULT_TIMEOUT_MS,
      userAgent: `Evidencia-JS/${SDK_VERSION}`,
    });

    this.proofs = new ProofsResource(http);
    this.publicKey = new PublicKeyResource(http);
  }
}

// ─── Standalone helpers (importable without a client instance) ────────────────

/**
 * Hash a file client-side. Useful before calling client.proofs.create().
 *
 * @example
 * const hash = await hashFile(document.querySelector('input[type=file]').files[0]);
 * const proof = await client.proofs.create({ fileHash: hash });
 */

// ─── Exports ──────────────────────────────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
  // CommonJS (Node.js)
  module.exports = {
    Evidencia,
    hashFile,
    EvidenciaError,
    EvidenciaAuthError,
    EvidenciaNotFoundError,
    EvidenciaValidationError,
  };
} else if (typeof globalThis !== 'undefined') {
  // Browser global
  globalThis.Evidencia = Evidencia;
  globalThis.EvidenciaHashFile = hashFile;
}

// ESM-compatible named exports (bundlers / type: module)
// export { Evidencia, hashFile, EvidenciaError, EvidenciaAuthError, EvidenciaNotFoundError, EvidenciaValidationError };
