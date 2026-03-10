import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:http/http.dart' as http;

import 'capture_method.dart';
import 'exceptions.dart';
import 'models/proof.dart';
import 'models/receipt.dart';
import 'models/verify_result.dart';

// ─── Constants ────────────────────────────────────────────────────────────────

const String _sdkVersion = '1.0.0';
const String _defaultBaseUrl = 'https://api.evidencia.io';
const Duration _defaultTimeout = Duration(seconds: 30);

// ─── HTTP Client ──────────────────────────────────────────────────────────────

class _HttpClient {
  _HttpClient({
    required String baseUrl,
    required String? apiKey,
    required Duration timeout,
  })  : _baseUri = Uri.parse(baseUrl.endsWith('/') ? baseUrl.substring(0, baseUrl.length - 1) : baseUrl),
        _apiKey = apiKey,
        _timeout = timeout,
        _inner = http.Client();

  final Uri _baseUri;
  final String? _apiKey;
  final Duration _timeout;
  final http.Client _inner;

  Map<String, String> get _baseHeaders => {
    'User-Agent': 'Evidencia-Flutter/$_sdkVersion',
    'X-Evidencia-SDK': 'flutter/$_sdkVersion',
    if (_apiKey != null) 'Authorization': 'Bearer $_apiKey',
  };

  Future<Map<String, dynamic>> getJson(String path) async {
    final uri = _baseUri.replace(path: path);
    try {
      final resp = await _inner.get(uri, headers: _baseHeaders).timeout(_timeout);
      return _handleResponse(resp);
    } on SocketException catch (e) {
      throw EvidenciaNetworkException('Network error: ${e.message}', code: 'network_error');
    } on TimeoutException {
      throw const EvidenciaNetworkException('Request timed out.', code: 'timeout');
    }
  }

  Future<Map<String, dynamic>> postJson(String path, Map<String, dynamic> body) async {
    final uri = _baseUri.replace(path: path);
    try {
      final resp = await _inner.post(
        uri,
        headers: { ..._baseHeaders, 'Content-Type': 'application/json' },
        body: jsonEncode(body),
      ).timeout(_timeout);
      return _handleResponse(resp);
    } on SocketException catch (e) {
      throw EvidenciaNetworkException('Network error: ${e.message}', code: 'network_error');
    } on TimeoutException {
      throw const EvidenciaNetworkException('Request timed out.', code: 'timeout');
    }
  }

  Map<String, dynamic> _handleResponse(http.Response resp) {
    Map<String, dynamic> data;
    try {
      data = jsonDecode(resp.body) as Map<String, dynamic>;
    } catch (_) {
      throw EvidenciaException(
        'Unexpected server response (status ${resp.statusCode})',
        code: 'unexpected_response',
        statusCode: resp.statusCode,
      );
    }

    if (resp.statusCode >= 200 && resp.statusCode < 300) return data;

    final err = data['error'] as Map<String, dynamic>? ?? {};
    final msg = err['message'] as String? ?? 'Request failed (${resp.statusCode})';
    final code = err['code'] as String?;
    final param = err['param'] as String?;

    if (resp.statusCode == 401 || resp.statusCode == 403) {
      throw EvidenciaAuthException(msg, code: code, statusCode: resp.statusCode);
    }
    if (resp.statusCode == 404) {
      throw EvidenciaNotFoundException(msg, code: code, param: param, statusCode: resp.statusCode);
    }
    if (resp.statusCode == 400 || resp.statusCode == 422) {
      throw EvidenciaValidationException(msg, code: code, param: param, statusCode: resp.statusCode);
    }
    throw EvidenciaException(msg, code: code, param: param, statusCode: resp.statusCode);
  }

  void close() => _inner.close();
}

// ─── Hashing ──────────────────────────────────────────────────────────────────

/// Compute SHA-256 of a file's bytes.
/// Returns the prefixed string: "sha256:<hex>".
String _hashBytes(Uint8List bytes) {
  final digest = sha256.convert(bytes);
  return 'sha256:${digest.toString()}';
}

/// Hash a [File] from the filesystem.
Future<String> hashFile(File file) async {
  final bytes = await file.readAsBytes();
  return _hashBytes(bytes);
}

/// Hash raw bytes.
String hashBytes(Uint8List bytes) => _hashBytes(bytes);

// ─── ProofsResource ───────────────────────────────────────────────────────────

/// Operations on the `/v1/proofs` resource.
class ProofsResource {
  const ProofsResource(this._http);

  final _HttpClient _http;

  /// Create a new proof for a file.
  ///
  /// The file is hashed locally — it is **never** sent to Evidencia servers.
  /// Only the SHA-256 hash, timestamp, and metadata are transmitted.
  ///
  /// ```dart
  /// final proof = await client.proofs.create(
  ///   file: File('/path/to/photo.jpg'),
  ///   captureMethod: CaptureMethod.camera,
  ///   metadata: {'claimId': 'CLM-9821'},
  /// );
  /// print(proof.id);                    // prf_01J4...
  /// print(proof.receipt.fileHash);      // sha256:...
  /// print(proof.receipt.verificationUrl); // https://verify.evidencia.io/...
  /// ```
  Future<Proof> create({
    File? file,
    Uint8List? bytes,
    String? fileHash,
    CaptureMethod captureMethod = CaptureMethod.fileUpload,
    String? customCaptureMethod,
    Map<String, dynamic> metadata = const {},
  }) async {
    assert(
      file != null || bytes != null || fileHash != null,
      'Provide file, bytes, or fileHash.',
    );

    // Hash locally — file never leaves the device
    final String hash;
    if (fileHash != null) {
      hash = fileHash;
    } else if (file != null) {
      hash = await hashFile(file);
    } else {
      hash = hashBytes(bytes!);
    }

    final body = {
      'fileHash': hash,
      'captureMethod': customCaptureMethod ?? captureMethod.value,
      'metadata': jsonEncode(metadata),
    };

    final json = await _http.postJson('/v1/proofs', body);
    return Proof.fromJson(json);
  }

  /// Retrieve a stored proof receipt by ID.
  ///
  /// ```dart
  /// final proof = await client.proofs.retrieve('prf_01J4...');
  /// ```
  Future<Proof> retrieve(String proofId) async {
    if (proofId.isEmpty) throw const EvidenciaValidationException('"proofId" is required.');
    final json = await _http.getJson('/v1/proofs/$proofId');
    return Proof.fromJson(json);
  }

  /// Verify a proof.
  ///
  /// Checks: signature validity, file hash match (if file/hash provided),
  /// and timestamp plausibility.
  ///
  /// ```dart
  /// // Verify by ID (server looks up receipt)
  /// final result = await client.proofs.verify(proofId: 'prf_01J4...');
  /// print(result.valid);                     // true
  /// print(result.checks.signatureValid);     // true
  ///
  /// // Verify with original file (proves file hasn't been modified)
  /// final result = await client.proofs.verify(
  ///   proofId: 'prf_01J4...',
  ///   file: File('/path/to/original.jpg'),
  /// );
  /// print(result.checks.fileHashMatch);      // true
  ///
  /// // Verify from inline receipt (fully offline-style)
  /// final result = await client.proofs.verify(receipt: storedReceipt);
  /// ```
  Future<VerifyResult> verify({
    String? proofId,
    ProofReceipt? receipt,
    File? file,
    Uint8List? bytes,
    String? fileHash,
  }) async {
    assert(
      proofId != null || receipt != null,
      'Provide proofId or receipt.',
    );

    final body = <String, dynamic>{};
    if (proofId != null) body['proofId'] = proofId;
    if (receipt != null) body['receipt'] = receipt.toJsonString();

    // Hash the file locally for comparison
    if (fileHash != null) {
      body['fileHash'] = fileHash;
    } else if (file != null) {
      body['fileHash'] = await hashFile(file);
    } else if (bytes != null) {
      body['fileHash'] = hashBytes(bytes);
    }

    final json = await _http.postJson('/v1/verify', body);
    return VerifyResult.fromJson(json);
  }
}

// ─── PublicKeyResource ────────────────────────────────────────────────────────

class PublicKeyResource {
  const PublicKeyResource(this._http);
  final _HttpClient _http;

  /// Retrieve the active public signing key.
  Future<Map<String, dynamic>> retrieve() => _http.getJson('/v1/public-key');
}

// ─── EvidenciaClient ──────────────────────────────────────────────────────────

/// The main Evidencia API client.
///
/// Instantiate once and reuse across your app.
///
/// ```dart
/// // In your DI container / service locator:
/// final evidencia = EvidenciaClient(
///   apiKey: const String.fromEnvironment('EVIDENCIA_API_KEY'),
/// );
///
/// // Proof creation
/// final proof = await evidencia.proofs.create(file: photoFile);
///
/// // Verification
/// final result = await evidencia.proofs.verify(proofId: proof.id);
///
/// // Remember to dispose when done (usually at app teardown)
/// evidencia.dispose();
/// ```
class EvidenciaClient {
  EvidenciaClient({
    required String apiKey,
    String? baseUrl,
    Duration? timeout,
  }) : _http = _HttpClient(
          baseUrl: baseUrl ?? _defaultBaseUrl,
          apiKey: apiKey,
          timeout: timeout ?? _defaultTimeout,
        ) {
    proofs = ProofsResource(_http);
    publicKey = PublicKeyResource(_http);
  }

  final _HttpClient _http;

  /// Proof creation, retrieval, and verification.
  late final ProofsResource proofs;

  /// Public signing key retrieval.
  late final PublicKeyResource publicKey;

  /// Release the underlying HTTP client.
  /// Call this when the client is no longer needed (e.g. in dispose()).
  void dispose() => _http.close();
}
