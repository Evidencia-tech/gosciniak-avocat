import 'receipt.dart';

/// Response returned by [ProofsResource.create] and [ProofsResource.retrieve].
class Proof {
  const Proof({
    required this.id,
    required this.object,
    required this.status,
    required this.receipt,
    required this.createdAt,
    required this.livemode,
  });

  /// The unique proof identifier. Use this to retrieve or verify the proof.
  final String id;
  final String object;
  final String status;

  /// The full cryptographic receipt. Store this for future verification.
  final ProofReceipt receipt;

  final String createdAt;

  /// Whether this is a live-mode proof (vs. test mode).
  final bool livemode;

  factory Proof.fromJson(Map<String, dynamic> json) {
    return Proof(
      id:        json['id'] as String,
      object:    json['object'] as String,
      status:    json['status'] as String,
      receipt:   ProofReceipt.fromJson(json['receipt'] as Map<String, dynamic>),
      createdAt: json['createdAt'] as String,
      livemode:  (json['livemode'] as bool?) ?? false,
    );
  }

  Map<String, dynamic> toJson() => {
    'id':        id,
    'object':    object,
    'status':    status,
    'receipt':   receipt.toJson(),
    'createdAt': createdAt,
    'livemode':  livemode,
  };

  @override
  String toString() => 'Proof(id: $id, status: $status)';
}
