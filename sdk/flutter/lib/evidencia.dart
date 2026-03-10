/// Evidencia — Official Flutter SDK
///
/// Create cryptographically verifiable proofs for files captured
/// on iOS and Android. Integrates with insurance claim flows,
/// marketplace dispute systems, and document verification pipelines.
///
/// Usage:
/// ```dart
/// import 'package:evidencia/evidencia.dart';
///
/// final client = EvidenciaClient(apiKey: 'evd_sk_live_...');
///
/// // Prove a photo capture
/// final proof = await client.proofs.create(
///   file: File('/path/to/photo.jpg'),
///   captureMethod: CaptureMethod.camera,
/// );
///
/// // Verify a proof
/// final result = await client.proofs.verify(proofId: proof.id);
/// print(result.valid); // true
/// ```
library evidencia;

export 'src/client.dart';
export 'src/models/proof.dart';
export 'src/models/receipt.dart';
export 'src/models/verify_result.dart';
export 'src/exceptions.dart';
export 'src/capture_method.dart';
