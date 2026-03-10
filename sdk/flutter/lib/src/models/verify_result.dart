/// The result of a proof verification operation.
class VerifyResult {
  const VerifyResult({
    required this.valid,
    required this.proofId,
    required this.checks,
    required this.proof,
    required this.verifiedAt,
  });

  /// Whether the proof is fully valid (all required checks passed).
  final bool valid;

  final String proofId;
  final VerifyChecks checks;
  final VerifyProofInfo proof;
  final String verifiedAt;

  factory VerifyResult.fromJson(Map<String, dynamic> json) {
    return VerifyResult(
      valid:      (json['valid'] as bool?) ?? false,
      proofId:    json['proofId'] as String,
      checks:     VerifyChecks.fromJson(json['checks'] as Map<String, dynamic>),
      proof:      VerifyProofInfo.fromJson(json['proof'] as Map<String, dynamic>),
      verifiedAt: json['verifiedAt'] as String,
    );
  }

  @override
  String toString() => 'VerifyResult(proofId: $proofId, valid: $valid, checks: $checks)';
}

/// Individual check results from a verification operation.
class VerifyChecks {
  const VerifyChecks({
    required this.signatureValid,
    required this.fileHashMatch,
    required this.timestampPlausible,
    this.rfc3161Valid,
    this.blockchainConfirmed,
  });

  /// Ed25519 signature is valid against the published public key.
  final bool signatureValid;

  /// SHA-256 of the provided file matches the receipt hash.
  /// null if no file or fileHash was provided for comparison.
  final bool? fileHashMatch;

  /// The proof timestamp is not in the future.
  final bool timestampPlausible;

  /// RFC 3161 timestamp token is valid (optional, only if present in receipt).
  final bool? rfc3161Valid;

  /// Proof is confirmed on-chain (optional, only if anchored).
  final bool? blockchainConfirmed;

  factory VerifyChecks.fromJson(Map<String, dynamic> json) {
    return VerifyChecks(
      signatureValid:     (json['signatureValid'] as bool?) ?? false,
      fileHashMatch:      json['fileHashMatch'] as bool?,
      timestampPlausible: (json['timestampPlausible'] as bool?) ?? false,
      rfc3161Valid:       json['rfc3161Valid'] as bool?,
      blockchainConfirmed: json['blockchainConfirmed'] as bool?,
    );
  }

  @override
  String toString() =>
    'VerifyChecks(sig: $signatureValid, hash: $fileHashMatch, ts: $timestampPlausible)';
}

/// Summary of proof details returned alongside verification results.
class VerifyProofInfo {
  const VerifyProofInfo({
    required this.fileHash,
    required this.timestamp,
    required this.captureMethod,
    required this.publicKeyId,
    required this.signatureAlgorithm,
  });

  final String fileHash;
  final String timestamp;
  final String captureMethod;
  final String publicKeyId;
  final String signatureAlgorithm;

  factory VerifyProofInfo.fromJson(Map<String, dynamic> json) {
    return VerifyProofInfo(
      fileHash:           json['fileHash'] as String,
      timestamp:          json['timestamp'] as String,
      captureMethod:      json['captureMethod'] as String,
      publicKeyId:        json['publicKeyId'] as String,
      signatureAlgorithm: json['signatureAlgorithm'] as String,
    );
  }
}
