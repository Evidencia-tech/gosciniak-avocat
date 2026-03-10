import 'dart:convert';

/// The canonical Evidencia proof receipt (schema v1).
///
/// This object is the core deliverable of every proof operation.
/// It contains everything needed to independently verify the proof
/// without relying on Evidencia's servers.
class ProofReceipt {
  const ProofReceipt({
    required this.schemaVersion,
    required this.receiptFormat,
    required this.issuedBy,
    required this.proofId,
    required this.fileHash,
    required this.hashAlgorithm,
    required this.timestamp,
    required this.captureMethod,
    required this.signatureAlgorithm,
    required this.signature,
    required this.publicKey,
    required this.publicKeyId,
    required this.verificationUrl,
    this.metadata = const {},
    this.rfcTimestamp,
    this.rfcTimestampAuthority,
    this.anchorTxId,
    this.anchorChain,
  });

  final String schemaVersion;
  final String receiptFormat;
  final String issuedBy;

  /// The unique proof identifier. Format: "prf_<ULID>".
  final String proofId;

  /// SHA-256 hash of the file. Format: "sha256:<64-hex-chars>".
  final String fileHash;

  /// Hash algorithm identifier (e.g. "sha256").
  final String hashAlgorithm;

  /// ISO 8601 UTC timestamp of when the proof was created.
  final String timestamp;

  /// How the file was captured (e.g. "sdk_flutter_camera").
  final String captureMethod;

  /// Signature algorithm used (e.g. "ed25519").
  final String signatureAlgorithm;

  /// Base64-encoded Ed25519 signature over the canonical signing payload.
  final String signature;

  /// Base64-encoded Ed25519 public key used to sign this receipt.
  final String publicKey;

  /// Identifier of the signing key (e.g. "key_2025_08_A").
  final String publicKeyId;

  /// URL to the public verification portal for this proof.
  final String verificationUrl;

  /// Optional caller-supplied metadata.
  final Map<String, dynamic> metadata;

  /// RFC 3161 timestamp token (optional, enhanced trust tier).
  final String? rfcTimestamp;
  final String? rfcTimestampAuthority;

  /// Blockchain anchor transaction ID (optional, maximum trust tier).
  final String? anchorTxId;
  final String? anchorChain;

  factory ProofReceipt.fromJson(Map<String, dynamic> json) {
    return ProofReceipt(
      schemaVersion:       json['schemaVersion'] as String,
      receiptFormat:       json['receiptFormat'] as String,
      issuedBy:            json['issuedBy'] as String,
      proofId:             json['proofId'] as String,
      fileHash:            json['fileHash'] as String,
      hashAlgorithm:       json['hashAlgorithm'] as String,
      timestamp:           json['timestamp'] as String,
      captureMethod:       json['captureMethod'] as String,
      signatureAlgorithm:  json['signatureAlgorithm'] as String,
      signature:           json['signature'] as String,
      publicKey:           json['publicKey'] as String,
      publicKeyId:         json['publicKeyId'] as String,
      verificationUrl:     json['verificationUrl'] as String,
      metadata:            (json['metadata'] as Map<String, dynamic>?) ?? {},
      rfcTimestamp:        json['rfcTimestamp'] as String?,
      rfcTimestampAuthority: json['rfcTimestampAuthority'] as String?,
      anchorTxId:          json['anchorTxId'] as String?,
      anchorChain:         json['anchorChain'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
    'schemaVersion':       schemaVersion,
    'receiptFormat':       receiptFormat,
    'issuedBy':            issuedBy,
    'proofId':             proofId,
    'fileHash':            fileHash,
    'hashAlgorithm':       hashAlgorithm,
    'timestamp':           timestamp,
    'captureMethod':       captureMethod,
    'signatureAlgorithm':  signatureAlgorithm,
    'signature':           signature,
    'publicKey':           publicKey,
    'publicKeyId':         publicKeyId,
    'verificationUrl':     verificationUrl,
    'metadata':            metadata,
    if (rfcTimestamp != null) 'rfcTimestamp': rfcTimestamp,
    if (rfcTimestampAuthority != null) 'rfcTimestampAuthority': rfcTimestampAuthority,
    if (anchorTxId != null) 'anchorTxId': anchorTxId,
    if (anchorChain != null) 'anchorChain': anchorChain,
  };

  /// Serialise the receipt to a JSON string for storage or transmission.
  String toJsonString() => jsonEncode(toJson());

  @override
  String toString() => 'ProofReceipt(proofId: $proofId, fileHash: $fileHash)';
}
