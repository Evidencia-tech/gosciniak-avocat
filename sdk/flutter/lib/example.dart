// ignore_for_file: avoid_print
import 'dart:io';

import 'package:evidencia/evidencia.dart';

/// This file demonstrates idiomatic usage of the Evidencia Flutter SDK.
/// It covers insurance claim flows, marketplace disputes, and offline verification.

// ─── Setup ────────────────────────────────────────────────────────────────────
//
// In your actual app, inject the client via a DI framework (Riverpod, GetIt, etc.)
// rather than instantiating it in individual functions.

final evidencia = EvidenciaClient(
  // In production, load from secure storage or --dart-define
  apiKey: const String.fromEnvironment('EVIDENCIA_API_KEY', defaultValue: 'evd_sk_dev_changeme'),
  // For local development against the Node.js backend:
  baseUrl: 'http://localhost:3000',
);

// ─── Example 1: Insurance claim — prove a damage photo ────────────────────────

Future<void> insuranceClaimFlow() async {
  print('\n── Insurance Claim Flow ──────────────────────────────────');

  // In a real app, this File comes from image_picker or camera plugin
  final photoFile = File('test_assets/damage_photo.jpg');

  // Create proof — file is hashed locally, never uploaded
  final proof = await evidencia.proofs.create(
    file: photoFile,
    captureMethod: CaptureMethod.camera,
    metadata: {
      'claimId':    'CLM-9821',
      'policyNo':   'POL-456-XY',
      'adjuster':   'Jean Dupont',
      'location':   'Lille, FR',
    },
  );

  print('Proof created:    ${proof.id}');
  print('File hash:        ${proof.receipt.fileHash}');
  print('Issued at:        ${proof.receipt.timestamp}');
  print('Verification URL: ${proof.receipt.verificationUrl}');

  // Store the proofId alongside the claim record in your backend
  await simulateSaveClaimProof(proof.id, proof.receipt);

  // Later, the insurer can verify:
  final result = await evidencia.proofs.verify(
    proofId: proof.id,
    file: photoFile,
  );

  print('\nVerification result:');
  print('  valid:          ${result.valid}');
  print('  signatureValid: ${result.checks.signatureValid}');
  print('  fileHashMatch:  ${result.checks.fileHashMatch}');
  print('  timestampOK:    ${result.checks.timestampPlausible}');
}

// ─── Example 2: Marketplace dispute — prove a listing screenshot ──────────────

Future<void> marketplaceDisputeFlow() async {
  print('\n── Marketplace Dispute Flow ──────────────────────────────');

  final screenshotFile = File('test_assets/listing_screenshot.png');

  final proof = await evidencia.proofs.create(
    file: screenshotFile,
    captureMethod: CaptureMethod.photoLibrary,
    metadata: {
      'orderId':   'ORD-78234',
      'disputeId': 'DIS-1023',
      'platform':  'Evidencia Marketplace',
    },
  );

  print('Dispute proof: ${proof.id}');

  // Retrieve later
  final retrieved = await evidencia.proofs.retrieve(proof.id);
  print('Retrieved:     ${retrieved.receipt.proofId}');
}

// ─── Example 3: Privacy mode — hash locally, never send file ─────────────────

Future<void> privacyModeFlow() async {
  print('\n── Privacy Mode (Hash Client-Side) ───────────────────────');

  final sensitiveFile = File('test_assets/contract.pdf');

  // Hash locally — the file bytes never leave this device
  final fileHash = await hashFile(sensitiveFile);
  print('Local hash: $fileHash');

  final proof = await evidencia.proofs.create(
    fileHash: fileHash,
    captureMethod: CaptureMethod.precomputedHash,
    metadata: {'documentType': 'NDA', 'counterparty': 'Acme Corp'},
  );

  print('Proof:      ${proof.id}');
}

// ─── Example 4: Offline receipt verification ──────────────────────────────────

Future<void> offlineVerification() async {
  print('\n── Offline Verification (Inline Receipt) ─────────────────');

  // Imagine storedReceipt was loaded from local DB / a QR code scan
  // For demo, we create one first
  final file = File('test_assets/damage_photo.jpg');
  final proof = await evidencia.proofs.create(file: file);
  final storedReceipt = proof.receipt;

  // Now verify using the receipt object directly — no proofId lookup
  final result = await evidencia.proofs.verify(
    receipt: storedReceipt,
    file: file,
  );

  print('Offline verification valid: ${result.valid}');
  print('Checks: ${result.checks}');
}

// ─── Simulated persistence ────────────────────────────────────────────────────

Future<void> simulateSaveClaimProof(String proofId, ProofReceipt receipt) async {
  // In production: save proofId to your backend DB alongside the claim
  // and optionally store the full receipt for offline verification.
  print('[storage] Claim proof saved: $proofId');
}

// ─── Entry point ──────────────────────────────────────────────────────────────

void main() async {
  try {
    await insuranceClaimFlow();
    await marketplaceDisputeFlow();
    await privacyModeFlow();
    await offlineVerification();
  } on EvidenciaNotFoundException catch (e) {
    print('Not found: ${e.message}');
  } on EvidenciaAuthException catch (e) {
    print('Auth error: ${e.message}');
  } on EvidenciaNetworkException catch (e) {
    print('Network error: ${e.message}');
  } on EvidenciaException catch (e) {
    print('Evidencia error [${e.code}]: ${e.message}');
  } finally {
    evidencia.dispose();
  }
}
