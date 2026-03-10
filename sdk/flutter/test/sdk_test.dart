import 'dart:convert';
import 'dart:typed_data';

import 'package:evidencia/evidencia.dart';
import 'package:test/test.dart';

/// Unit tests for the Evidencia Flutter SDK.
///
/// Integration tests (requiring a running backend) are in test/integration_test.dart.
/// These unit tests cover model serialisation, hash utilities, and error handling.
void main() {

  group('ProofReceipt', () {
    final sampleJson = {
      'schemaVersion': '1',
      'receiptFormat': 'evidencia-receipt-v1',
      'issuedBy': 'evidencia.io',
      'proofId': 'prf_01J4X9K2M8N3P5Q7R9S0T1U2V3',
      'fileHash': 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      'hashAlgorithm': 'sha256',
      'timestamp': '2025-08-14T10:42:00.000Z',
      'captureMethod': 'sdk_flutter_camera',
      'signatureAlgorithm': 'ed25519',
      'signature': 'base64signaturehere==',
      'publicKey': 'base64publickeyhere==',
      'publicKeyId': 'key_2025_08_A',
      'verificationUrl': 'https://verify.evidencia.io/prf_01J4X9K2M8N3P5Q7R9S0T1U2V3',
      'metadata': {'claimId': 'CLM-9821'},
    };

    test('fromJson deserialises all required fields', () {
      final receipt = ProofReceipt.fromJson(sampleJson);
      expect(receipt.proofId, equals('prf_01J4X9K2M8N3P5Q7R9S0T1U2V3'));
      expect(receipt.fileHash, startsWith('sha256:'));
      expect(receipt.signatureAlgorithm, equals('ed25519'));
      expect(receipt.metadata['claimId'], equals('CLM-9821'));
    });

    test('toJson round-trips correctly', () {
      final receipt = ProofReceipt.fromJson(sampleJson);
      final roundTripped = ProofReceipt.fromJson(receipt.toJson());
      expect(roundTripped.proofId, equals(receipt.proofId));
      expect(roundTripped.fileHash, equals(receipt.fileHash));
      expect(roundTripped.timestamp, equals(receipt.timestamp));
    });

    test('toJsonString produces valid JSON', () {
      final receipt = ProofReceipt.fromJson(sampleJson);
      expect(() => jsonDecode(receipt.toJsonString()), returnsNormally);
    });

    test('optional fields default to null', () {
      final receipt = ProofReceipt.fromJson(sampleJson);
      expect(receipt.rfcTimestamp, isNull);
      expect(receipt.anchorTxId, isNull);
    });
  });

  group('VerifyResult', () {
    final sampleJson = {
      'valid': true,
      'proofId': 'prf_01J4X9K2M8N3P5Q7R9S0T1U2V3',
      'checks': {
        'signatureValid': true,
        'fileHashMatch': true,
        'timestampPlausible': true,
      },
      'proof': {
        'fileHash': 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        'timestamp': '2025-08-14T10:42:00.000Z',
        'captureMethod': 'sdk_flutter_camera',
        'publicKeyId': 'key_2025_08_A',
        'signatureAlgorithm': 'ed25519',
      },
      'verifiedAt': '2025-08-14T11:00:00.000Z',
    };

    test('fromJson deserialises correctly', () {
      final result = VerifyResult.fromJson(sampleJson);
      expect(result.valid, isTrue);
      expect(result.checks.signatureValid, isTrue);
      expect(result.checks.fileHashMatch, isTrue);
      expect(result.checks.timestampPlausible, isTrue);
    });

    test('fileHashMatch is null when not provided', () {
      final noHashJson = Map<String, dynamic>.from(sampleJson);
      (noHashJson['checks'] as Map<String, dynamic>).remove('fileHashMatch');
      final result = VerifyResult.fromJson(noHashJson);
      expect(result.checks.fileHashMatch, isNull);
    });
  });

  group('hashBytes', () {
    test('produces sha256-prefixed hex string', () {
      final bytes = Uint8List.fromList('hello'.codeUnits);
      final hash = hashBytes(bytes);
      expect(hash, startsWith('sha256:'));
      expect(hash.length, equals(7 + 64)); // "sha256:" + 64 hex chars
    });

    test('empty bytes produce correct SHA-256', () {
      final hash = hashBytes(Uint8List(0));
      // SHA-256 of empty string is well-known
      expect(hash, equals('sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'));
    });

    test('same bytes always produce same hash', () {
      final bytes = Uint8List.fromList([1, 2, 3, 4, 5]);
      expect(hashBytes(bytes), equals(hashBytes(bytes)));
    });

    test('different bytes produce different hashes', () {
      final a = Uint8List.fromList([1, 2, 3]);
      final b = Uint8List.fromList([4, 5, 6]);
      expect(hashBytes(a), isNot(equals(hashBytes(b))));
    });
  });

  group('CaptureMethod', () {
    test('all capture methods have SDK-prefixed values', () {
      for (final method in CaptureMethod.values) {
        expect(method.value, startsWith('sdk_flutter_'));
      }
    });
  });

  group('EvidenciaException', () {
    test('toString includes code and message', () {
      const ex = EvidenciaException('Something failed', code: 'test_error');
      expect(ex.toString(), contains('test_error'));
      expect(ex.toString(), contains('Something failed'));
    });

    test('subclasses preserve message', () {
      const auth = EvidenciaAuthException('Unauthorized', code: 'invalid_api_key');
      expect(auth.message, equals('Unauthorized'));
      expect(auth.code, equals('invalid_api_key'));
    });
  });
}
