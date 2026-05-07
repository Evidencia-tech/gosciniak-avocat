'use strict';

// ── Config ────────────────────────────────────────────────────────────────────
const API_BASE    = `${window.location.protocol}//${window.location.host}`;
const VERIFY_BASE = `${window.location.protocol}//${window.location.host}/verify`;

// ── État ──────────────────────────────────────────────────────────────────────
let accessCode      = null;
let selectedFile    = null;
let fileBuffer      = null;
let fileHashValue   = null;
let certResult      = null;
let certifiedPdfBlob = null;

// ── Phases ────────────────────────────────────────────────────────────────────
function showPhase(id) {
  ['phaseAuth', 'phaseUpload', 'phaseResult'].forEach(p => {
    const el = document.getElementById(p);
    if (!el) return;
    el.classList.toggle('is-active', p === id);
  });
}

// ── Erreurs ───────────────────────────────────────────────────────────────────
function showAuthError(msg) {
  const el = document.getElementById('authError');
  document.getElementById('authErrorMsg').textContent = msg;
  el.classList.add('is-visible');
}

function hideAuthError() {
  document.getElementById('authError').classList.remove('is-visible');
}

function showUploadError(msg) {
  const el = document.getElementById('uploadError');
  if (!el) return;
  document.getElementById('uploadErrorMsg').textContent = msg;
  el.classList.add('is-visible');
}

function hideUploadError() {
  const el = document.getElementById('uploadError');
  if (el) el.classList.remove('is-visible');
}

// ── Step 1 : Authentification ─────────────────────────────────────────────────
async function handleLogin() {
  const code = document.getElementById('accessCodeInput').value.trim();
  if (!code) { showAuthError('Veuillez entrer un code d\'accès.'); return; }
  hideAuthError();

  const btn = document.getElementById('loginBtn');
  btn.disabled = true;
  btn.textContent = 'Vérification…';

  try {
    const resp = await fetch(`${API_BASE}/v1/auth/depot`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ code }),
    });

    if (resp.ok) {
      accessCode = code;
      try { sessionStorage.setItem('depot_access_code', code); } catch (e) { /* sessionStorage bloqué */ }
      showPhase('phaseUpload');
    } else {
      showAuthError('Code invalide.');
    }
  } catch {
    showAuthError('Erreur de connexion. Veuillez réessayer.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Connexion →';
  }
}

// ── Gestion du fichier ────────────────────────────────────────────────────────
function handleFileSelect(file) {
  if (!file) return;
  if (file.type !== 'application/pdf') {
    showUploadError('Seuls les fichiers PDF sont acceptés.');
    return;
  }
  hideUploadError();
  selectedFile = file;

  document.getElementById('fileName').textContent = file.name;
  document.getElementById('fileHashDisplay').textContent = 'Calcul de l\'empreinte…';
  document.getElementById('fileReadyBox').classList.add('is-visible');
  document.getElementById('dropZone').style.display = 'none';
  document.getElementById('certifyBtn').disabled = true;

  // Step 2 : Hash computation — entirely in the browser
  const reader = new FileReader();
  reader.onload = async (evt) => {
    fileBuffer = evt.target.result;
    try {
      const hashBuf = await crypto.subtle.digest('SHA-256', fileBuffer);
      const hex = Array.from(new Uint8Array(hashBuf))
        .map(b => b.toString(16).padStart(2, '0')).join('');
      fileHashValue = `sha256:${hex}`;
      document.getElementById('fileHashDisplay').textContent =
        fileHashValue.slice(0, 22) + '…';
      document.getElementById('certifyBtn').disabled = false;
    } catch {
      showUploadError('Erreur lors du calcul de l\'empreinte. Veuillez réessayer.');
    }
  };
  reader.readAsArrayBuffer(file);
}

function clearFile() {
  selectedFile  = null;
  fileBuffer    = null;
  fileHashValue = null;
  document.getElementById('fileReadyBox').classList.remove('is-visible');
  document.getElementById('dropZone').style.display = '';
  document.getElementById('certifyBtn').disabled = true;
  document.getElementById('fileInput').value = '';
  hideCertProgress();
  hideUploadError();
}

// ── Progression inline ────────────────────────────────────────────────────────
const STEP_IDS = ['stepHash', 'stepSend', 'stepSign', 'stepDone'];

function showCertProgress() {
  document.getElementById('certProgress').classList.add('is-visible');
}

function hideCertProgress() {
  const el = document.getElementById('certProgress');
  if (el) el.classList.remove('is-visible');
  STEP_IDS.forEach(id => {
    const el2 = document.getElementById(id);
    if (el2) { el2.classList.remove('is-active', 'is-done'); }
  });
}

function setStep(index) {
  showCertProgress();
  STEP_IDS.forEach((id, i) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle('is-active', i === index);
    el.classList.toggle('is-done',   i < index);
  });
}

// ── Step 3 : Certification ────────────────────────────────────────────────────
async function certifyDocument() {
  if (!selectedFile || !fileHashValue || !accessCode) return;
  hideUploadError();

  const certifyBtn = document.getElementById('certifyBtn');
  certifyBtn.disabled = true;

  try {
    setStep(0); // Calcul de l'empreinte (déjà fait, on l'affiche)
    await sleep(300);

    // POST /v1/proofs
    setStep(1);
    const proofResp = await fetch(`${API_BASE}/v1/proofs`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${accessCode}`,
      },
      body: JSON.stringify({
        fileHash:      fileHashValue,
        captureMethod: 'camera',
        mediaRef:      { system: 'depot-document', id: selectedFile.name },
      }),
    });

    if (!proofResp.ok) {
      const errData = await proofResp.json().catch(() => ({}));
      throw new Error(errData?.error?.message || `Erreur ${proofResp.status} lors de la certification.`);
    }

    const proofData  = await proofResp.json();
    const proof      = proofData.data ?? proofData;
    const proofId    = proof.id || proof.receipt?.proofId;
    const timestamp  = proof.createdAt || proof.receipt?.timestamp;

    if (!proofId) throw new Error('Identifiant de preuve introuvable dans la réponse.');

    setStep(2); // Signature…

    // Step 4 : Chiffrement AES-256-GCM
    const aesKey = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const encryptedBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv }, aesKey, fileBuffer
    );

    const aesKeyBytes = new Uint8Array(await crypto.subtle.exportKey('raw', aesKey));

    // Stocker le document chiffré sur le serveur
    const encB64 = arrayBufferToBase64(encryptedBuffer);
    const ivB64  = arrayBufferToBase64(iv.buffer);

    const storeResp = await fetch(`${API_BASE}/v1/documents/store`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${accessCode}`,
      },
      body: JSON.stringify({ proofId, encryptedData: encB64, iv: ivB64 }),
    });

    if (!storeResp.ok) {
      console.warn('[depot] Stockage du document échoué :', storeResp.status);
    }

    // Clé de fragment : aesKey (32 octets) + iv (12 octets) → base64url
    const keyAndIv = new Uint8Array(aesKeyBytes.length + iv.length);
    keyAndIv.set(aesKeyBytes, 0);
    keyAndIv.set(iv, aesKeyBytes.length);
    const fragmentKey = toBase64Url(keyAndIv);

    certResult = {
      proofId,
      timestamp,
      filename:    selectedFile.name,
      fileHash:    fileHashValue,
      fragmentKey,
      verifyUrl:   `${VERIFY_BASE}?proofId=${proofId}#key=${fragmentKey}`,
    };

    // Step 5 : Génération du PDF certifié côté navigateur
    setStep(3); // Prêt
    await generateCertifiedPdf(aesKeyBytes, iv);

    showPhase('phaseResult');
    renderResult();

  } catch (err) {
    hideCertProgress();
    showUploadError(err.message || 'Erreur lors de la certification. Veuillez réessayer.');
    certifyBtn.disabled = false;
  }
}

// ── Step 5 : PDF certifié côté client ────────────────────────────────────────
async function generateCertifiedPdf() {
  certifiedPdfBlob = null;

  // Générer le QR code
  let qrDataUrl = null;
  const qrWrap = document.createElement('div');
  qrWrap.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:128px;height:128px;background:#fff';
  document.body.appendChild(qrWrap);
  try {
    new QRCode(qrWrap, {
      text:          certResult.verifyUrl,
      width:         128,
      height:        128,
      colorDark:     '#1a1814',
      colorLight:    '#ffffff',
      correctLevel:  QRCode.CorrectLevel.M,
    });
    await sleep(120);
    const qrCanvas = qrWrap.querySelector('canvas');
    const qrImg    = qrWrap.querySelector('img');
    if (qrCanvas) qrDataUrl = qrCanvas.toDataURL('image/png');
    else if (qrImg) qrDataUrl = qrImg.src;
  } catch (e) { /* QRCode indisponible */ }
  document.body.removeChild(qrWrap);

  // Rendre la première page du PDF original sur canvas via PDF.js
  let pageDataUrl = null;
  try {
    const pdfjsLib = window.pdfjsLib;
    if (pdfjsLib && fileBuffer) {
      // Worker blob : importScripts dans le worker hérite de script-src (cdnjs autorisé)
      const workerBlob = new Blob(
        ['importScripts("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js")'],
        { type: 'application/javascript' }
      );
      pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(workerBlob);

      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(fileBuffer) });
      const pdfDoc  = await loadingTask.promise;
      const page    = await pdfDoc.getPage(1);
      const vp      = page.getViewport({ scale: 1.5 });
      const canvas  = document.createElement('canvas');
      canvas.width  = vp.width;
      canvas.height = vp.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      pageDataUrl = canvas.toDataURL('image/jpeg', 0.82);
    }
  } catch (e) { console.warn('[depot] Rendu PDF :', e); }

  // Construire le PDF certifié avec jsPDF
  try {
    const { jsPDF } = window.jspdf;
    if (!jsPDF) return;

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const W = 210, H = 297;

    if (pageDataUrl) {
      // Page originale en fond
      pdf.addImage(pageDataUrl, 'JPEG', 0, 0, W, H);

      // Badge Evidencia — coin inférieur droit
      const bx = W - 78, by = H - 44;
      pdf.setFillColor(14, 127, 90);
      pdf.roundedRect(bx, by, 73, 38, 3, 3, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7);
      pdf.text('CERTIFIÉ PAR EVIDENCIA', bx + 4, by + 8);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(6);
      pdf.text(truncate(certResult.proofId, 36), bx + 4, by + 15);
      pdf.text(formatDateShort(certResult.timestamp), bx + 4, by + 21);
      pdf.text('Fichier : ' + truncate(certResult.filename, 28), bx + 4, by + 27);
      pdf.text('evidencia.tech', bx + 4, by + 33);

      // QR code — coin inférieur gauche
      if (qrDataUrl) pdf.addImage(qrDataUrl, 'PNG', 5, H - 44, 35, 35);
    } else {
      // Page de certificat de secours
      pdf.setFillColor(244, 241, 235);
      pdf.rect(0, 0, W, H, 'F');

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(22);
      pdf.setTextColor(26, 24, 20);
      pdf.text('Certificat Evidencia', 20, 48);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(11);
      pdf.setTextColor(80, 76, 70);
      pdf.text('Document certifié par signature cryptographique Ed25519', 20, 60);

      pdf.setFontSize(9);
      pdf.setTextColor(26, 24, 20);
      pdf.text(`Identifiant : ${certResult.proofId}`, 20, 82);
      pdf.text(`Fichier     : ${certResult.filename}`, 20, 92);
      pdf.text(`Empreinte   : ${certResult.fileHash.slice(0, 40)}…`, 20, 102);
      pdf.text(`Date        : ${formatDate(certResult.timestamp)}`, 20, 112);

      if (qrDataUrl) {
        pdf.addImage(qrDataUrl, 'PNG', 20, 130, 64, 64);
        pdf.setFontSize(8);
        pdf.setTextColor(100, 96, 90);
        pdf.text('Scanner pour vérifier ce document sur evidencia.tech', 20, 200);
      }

      pdf.setFontSize(8);
      pdf.setTextColor(140, 136, 130);
      pdf.text('Evidencia · Infrastructure de preuve numérique · evidencia.tech', 20, H - 18);
    }

    certifiedPdfBlob = pdf.output('blob');
    document.getElementById('downloadCertifiedBtn').disabled = false;
  } catch (e) {
    console.warn('[depot] Génération PDF :', e);
  }
}

// ── Rendu du résultat ─────────────────────────────────────────────────────────
function renderResult() {
  document.getElementById('resultProofId').textContent = certResult.proofId;

  const fields = [
    { label: 'Fichier',               val: certResult.filename,              mono: false },
    { label: 'Empreinte SHA-256',     val: certResult.fileHash.slice(0, 24) + '…', mono: true },
    { label: 'Certifié le',           val: formatDate(certResult.timestamp), mono: false },
  ];

  document.getElementById('resultDetails').innerHTML = fields.map(f => `
    <div class="ev-detail">
      <label>${f.label}</label>
      <div class="val ${f.mono ? 'mono' : ''}">${f.val}</div>
    </div>
  `).join('');

  document.getElementById('verifyResultLink').href = certResult.verifyUrl;
}

// ── Téléchargement ────────────────────────────────────────────────────────────
function downloadCertified() {
  if (!certifiedPdfBlob) return;
  const url = URL.createObjectURL(certifiedPdfBlob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = `document-certifie-${certResult.proofId}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 6000);
}

// ── Réinitialisation ──────────────────────────────────────────────────────────
function resetForm() {
  clearFile();
  certResult       = null;
  certifiedPdfBlob = null;
  hideUploadError();
  hideCertProgress();
  document.getElementById('certifyBtn').disabled = true;
  document.getElementById('downloadCertifiedBtn').disabled = true;
  showPhase('phaseUpload');
}

// ── Utilitaires ───────────────────────────────────────────────────────────────
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let str = '';
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str);
}

function toBase64Url(uint8arr) {
  let str = '';
  for (let i = 0; i < uint8arr.length; i++) str += String.fromCharCode(uint8arr[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
    }) + ' UTC';
  } catch { return iso; }
}

function formatDateShort(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
    });
  } catch { return iso; }
}

function truncate(str, max) {
  return str && str.length > max ? str.slice(0, max) + '…' : (str || '');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Event listeners ───────────────────────────────────────────────────────────
document.getElementById('loginBtn').addEventListener('click', handleLogin);
document.getElementById('accessCodeInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') handleLogin();
});

document.getElementById('fileInput').addEventListener('change', e => {
  if (e.target.files[0]) handleFileSelect(e.target.files[0]);
});

document.getElementById('clearFileBtn').addEventListener('click', clearFile);
document.getElementById('certifyBtn').addEventListener('click', certifyDocument);
document.getElementById('downloadCertifiedBtn').addEventListener('click', downloadCertified);
document.getElementById('newDocBtn').addEventListener('click', resetForm);

// Drag & drop sur la drop zone
const dropZone = document.getElementById('dropZone');

dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dropZone.classList.add('is-drag-over');
});

dropZone.addEventListener('dragleave', e => {
  if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove('is-drag-over');
});

dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('is-drag-over');
  const file = e.dataTransfer.files[0];
  if (file) handleFileSelect(file);
});

dropZone.addEventListener('click', () => {
  document.getElementById('fileInput').click();
});

// Récupérer le code depuis sessionStorage si disponible (rechargement de page)
try {
  const saved = sessionStorage.getItem('depot_access_code');
  if (saved) {
    accessCode = saved;
    showPhase('phaseUpload');
  }
} catch (e) { /* sessionStorage bloqué */ }
