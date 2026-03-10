// evidencia — TypeScript definitions
// SDK version 1.0.0

export interface EvidenciaConfig {
  /** Your Evidencia API key (evd_sk_live_...). Falls back to EVIDENCIA_API_KEY env var in Node. */
  apiKey?: string;
  /** API base URL. Default: https://api.evidencia.io */
  baseUrl?: string;
  /** Request timeout in milliseconds. Default: 30000 */
  timeout?: number;
}

// ─── Receipt ──────────────────────────────────────────────────────────────────

export interface DeviceAttestation {
  platform: string;
  model?: string;
  osVersion?: string;
  attestationToken?: string;
  attestationProvider?: string;
}

export interface LocationClaim {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  provider?: string;
}

export interface ProofReceipt {
  schemaVersion: '1';
  receiptFormat: 'evidencia-receipt-v1';
  issuedBy: string;
  proofId: string;
  fileHash: string;
  hashAlgorithm: 'sha256' | 'sha3-256';
  timestamp: string;       // ISO 8601 UTC
  captureMethod: string;
  signatureAlgorithm: 'ed25519' | 'ecdsa-p256';
  signature: string;       // base64
  publicKey: string;       // base64
  publicKeyId: string;
  metadata: Record<string, unknown>;
  deviceAttestation?: DeviceAttestation;
  locationClaim?: LocationClaim;
  rfcTimestamp?: string;
  rfcTimestampAuthority?: string;
  anchorTxId?: string;
  anchorChain?: string;
  verificationUrl: string;
}

// ─── API responses ────────────────────────────────────────────────────────────

export interface ProofResponse {
  id: string;
  object: 'proof';
  status: 'active';
  receipt: ProofReceipt;
  createdAt: string;
  livemode: boolean;
}

export interface VerifyChecks {
  signatureValid: boolean;
  /** null if no file or hash was provided for comparison */
  fileHashMatch: boolean | null;
  timestampPlausible: boolean;
  rfc3161Valid?: boolean;
  blockchainConfirmed?: boolean;
}

export interface VerifyResponse {
  valid: boolean;
  proofId: string;
  checks: VerifyChecks;
  proof: {
    fileHash: string;
    timestamp: string;
    captureMethod: string;
    publicKeyId: string;
    signatureAlgorithm: string;
  };
  verifiedAt: string;
}

export interface PublicKeyResponse {
  object: 'public_key';
  keyId: string;
  algorithm: 'ed25519';
  publicKey: string;  // base64
  format: 'base64';
  usage: string;
  verificationGuide: string;
}

// ─── Parameters ───────────────────────────────────────────────────────────────

export type FileInput = File | Blob | ArrayBuffer | Uint8Array | Buffer;

export interface CreateProofParams {
  /** File to prove. Hashed client-side — never uploaded. Provide file or fileHash. */
  file?: FileInput;
  /** Pre-computed "sha256:<hex>" hash. Use for maximum privacy. */
  fileHash?: string;
  /** How the file was captured. Default: "sdk_js" */
  captureMethod?: string;
  /** Optional key/value metadata stored with the proof */
  metadata?: Record<string, unknown>;
}

export interface VerifyProofParams {
  /** Proof ID to verify (server looks up receipt) */
  proofId?: string;
  /** Full inline receipt object (for offline-style verification) */
  receipt?: ProofReceipt;
  /** Original file to check hash against */
  file?: FileInput;
  /** Pre-computed hash to check against receipt */
  fileHash?: string;
}

// ─── Resources ────────────────────────────────────────────────────────────────

export interface ProofsResource {
  /** Create a new proof. File is hashed client-side and never sent to the server. */
  create(params: CreateProofParams): Promise<ProofResponse>;
  /** Retrieve a stored proof receipt by ID. */
  retrieve(proofId: string): Promise<ProofResponse>;
  /** Verify a proof's signature and optionally check file hash. */
  verify(params: VerifyProofParams): Promise<VerifyResponse>;
}

export interface PublicKeyResource {
  retrieve(): Promise<PublicKeyResponse>;
}

// ─── Client ───────────────────────────────────────────────────────────────────

export declare class Evidencia {
  constructor(config?: EvidenciaConfig);
  proofs: ProofsResource;
  publicKey: PublicKeyResource;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/**
 * Hash a file, Blob, ArrayBuffer, Buffer, or Uint8Array with SHA-256.
 * Returns: "sha256:<64-hex-chars>"
 * Uses WebCrypto in browser, Node.js crypto in Node.
 */
export declare function hashFile(input: FileInput): Promise<string>;

// ─── Errors ───────────────────────────────────────────────────────────────────

export interface ErrorOptions {
  type?: string;
  code?: string;
  param?: string | null;
  statusCode?: number | null;
  raw?: unknown;
}

export declare class EvidenciaError extends Error {
  type: string;
  code: string;
  param: string | null;
  statusCode: number | null;
  raw: unknown;
  constructor(message: string, options?: ErrorOptions);
}

export declare class EvidenciaAuthError extends EvidenciaError {}
export declare class EvidenciaNotFoundError extends EvidenciaError {}
export declare class EvidenciaValidationError extends EvidenciaError {}
