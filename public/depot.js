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

// ── Step 5 : Image certifiée côté client ─────────────────────────────────────
async function generateCertifiedPdf() {
  certifiedPdfBlob = null;

  const SIDEBAR_W = 180;

  // 1. Render PDF page 1 via PDF.js
  let pdfCanvas = null;
  try {
    const pdfjsLib = window.pdfjsLib;
    if (pdfjsLib && fileBuffer) {
      const workerBlob = new Blob(
        ['importScripts("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js")'],
        { type: 'application/javascript' }
      );
      pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(workerBlob);
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(fileBuffer) });
      const pdfDoc  = await loadingTask.promise;
      const page    = await pdfDoc.getPage(1);
      const vp      = page.getViewport({ scale: 1.5 });
      pdfCanvas     = document.createElement('canvas');
      pdfCanvas.width  = vp.width;
      pdfCanvas.height = vp.height;
      await page.render({ canvasContext: pdfCanvas.getContext('2d'), viewport: vp }).promise;
    }
  } catch (e) { console.warn('[depot] Rendu PDF :', e); }

  // 2. Generate QR code into an offscreen div (keep alive until drawImage)
  const qrWrap = document.createElement('div');
  qrWrap.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:128px;height:128px;background:#fff';
  document.body.appendChild(qrWrap);
  let qrEl = null;
  try {
    new QRCode(qrWrap, {
      text:         certResult.verifyUrl,
      width:        128,
      height:       128,
      colorDark:    '#000000',
      colorLight:   '#ffffff',
      correctLevel: QRCode.CorrectLevel.M,
    });
    await sleep(150);
    qrEl = qrWrap.querySelector('canvas') || qrWrap.querySelector('img');
  } catch (e) { /* QRCode indisponible */ }

  // 3. Build composite canvas: PDF on left, dark sidebar on right
  const pdfW = pdfCanvas ? pdfCanvas.width  : 893;
  const pdfH = pdfCanvas ? pdfCanvas.height : 1263;

  const canvas = document.createElement('canvas');
  canvas.width  = pdfW + SIDEBAR_W;
  canvas.height = pdfH;
  const ctx = canvas.getContext('2d');

  // Left: PDF page (or fallback background)
  if (pdfCanvas) {
    ctx.drawImage(pdfCanvas, 0, 0);
  } else {
    ctx.fillStyle = '#f4f1eb';
    ctx.fillRect(0, 0, pdfW, pdfH);
    ctx.fillStyle = '#1a1814';
    ctx.font = 'bold 28px serif';
    ctx.fillText('Document certifié', 48, 100);
  }

  // Right: dark sidebar
  const sx = pdfW;
  ctx.fillStyle = '#0b1220';
  ctx.fillRect(sx, 0, SIDEBAR_W, pdfH);

  const cx = sx + SIDEBAR_W / 2;  // horizontal center of sidebar
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';

  let y = 20;

  const sep = (yPos) => {
    ctx.strokeStyle = '#ffffff33';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(sx + 12, yPos + 0.5);
    ctx.lineTo(sx + SIDEBAR_W - 12, yPos + 0.5);
    ctx.stroke();
  };

  // Logo
  await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const logoW = 80;
      const logoH = Math.round(img.height * (logoW / img.width));
      ctx.drawImage(img, cx - logoW / 2, y, logoW, logoH);
      y += logoH + 12;
      resolve();
    };
    img.onerror = () => { y += 12; resolve(); };
    img.src = '/logo-dtr.png';
  });

  // "CERTIFIÉ PAR EVIDENCIA"
  ctx.fillStyle = '#ffffff';
  ctx.font      = 'bold 9px sans-serif';
  ctx.fillText('CERTIFIÉ PAR EVIDENCIA', cx, y);
  y += 14;

  sep(y); y += 10;

  // "Certifié le" label
  ctx.fillStyle = '#8a9ab0';
  ctx.font      = '9px sans-serif';
  ctx.fillText('Certifié le', cx, y);
  y += 14;

  // Date
  ctx.fillStyle = '#ffffff';
  ctx.font      = '10px sans-serif';
  ctx.fillText(formatDateShort(certResult.timestamp), cx, y);
  y += 16;

  sep(y); y += 10;

  // Proof ID (truncated)
  const shortId = certResult.proofId.slice(0, 14) + '…';
  ctx.fillStyle = '#8a9ab0';
  ctx.font      = '9px monospace';
  ctx.fillText(shortId, cx, y);
  y += 16;

  sep(y); y += 12;

  // QR code (~120px, white background border)
  const QR_SIZE = 120;
  const qrX = cx - QR_SIZE / 2;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(qrX - 5, y - 5, QR_SIZE + 10, QR_SIZE + 10);
  if (qrEl) {
    ctx.drawImage(qrEl, qrX, y, QR_SIZE, QR_SIZE);
  }
  y += QR_SIZE + 12;

  // "Scanner pour vérifier"
  ctx.fillStyle = '#8a9ab0';
  ctx.font      = '9px sans-serif';
  ctx.fillText('Scanner pour vérifier', cx, y);

  document.body.removeChild(qrWrap);

  // Export as PNG blob
  canvas.toBlob((blob) => {
    certifiedPdfBlob = blob;
    document.getElementById('downloadCertifiedBtn').disabled = false;
  }, 'image/png');
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
  a.download = `document-certifie-${certResult.proofId}.png`;
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
