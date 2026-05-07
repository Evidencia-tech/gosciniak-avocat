'use strict';

// ── Config ────────────────────────────────────────────────────────────────────
const API_BASE    = `${window.location.protocol}//${window.location.host}`;
const VERIFY_BASE = `${window.location.protocol}//${window.location.host}/verify.html`;
const DEMO_URL    = `${API_BASE}/v1/demo/proofs`;

// ── État ──────────────────────────────────────────────────────────────────────
let pendingHash      = null;
let capturedThumbDataURL = null; // dataURL lu via FileReader — sans canvas, sans taint
let currentReceipt   = null;
let currentId        = null;
let qrModalRendered  = false;
let capturedMediaURL  = null;   // objectURL local — jamais envoyé au serveur
let capturedMediaType = null;   // 'image' | 'video'
let capturedFile      = null;   // File object — pour upload serveur (aperçu via QR)

// ── Détection desktop ─────────────────────────────────────────────────────────
// Utilise matchMedia pour détecter un pointeur fin (souris/trackpad) comme
// entrée principale. Plus fiable que maxTouchPoints ou le UA : un laptop avec
// écran tactile reste "desktop" car le pointeur principal est le trackpad.
function isDesktop() {
  if (window.matchMedia) {
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches
        && !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
  }
  // Fallback navigateurs sans matchMedia
  const hasTouchScreen = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
  const mobileUA = /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(navigator.userAgent || '');
  return !hasTouchScreen && !mobileUA;
}

// ── Interception du clic sur les boutons de capture ───────────────────────────
function onCaptureClick(mode) {
  if (isDesktop()) {
    openDesktopModal();
    return;
  }
  // Mobile → déclencher normalement l'input file caché
  const inputId = mode === 'photo' ? 'inputPhoto' : 'inputVideo';
  document.getElementById(inputId).click();
}

// ── Modal desktop ─────────────────────────────────────────────────────────────
function openDesktopModal() {
  const overlay = document.getElementById('desktopOverlay');
  overlay.classList.add('is-open');
  document.body.style.overflow = 'hidden';

  // Générer le QR une seule fois
  if (!qrModalRendered) {
    qrModalRendered = true;
    const qrEl = document.getElementById('desktopQr');
    qrEl.innerHTML = '';
    try {
      new QRCode(qrEl, {
        text:         window.location.href,
        width:        160,
        height:       160,
        colorDark:    '#1a1814',
        colorLight:   '#f0ede6',
        correctLevel: QRCode.CorrectLevel.M,
      });
    } catch(e) {
      qrEl.textContent = window.location.href;
    }
  }
}

function closeDesktopModal(e) {
  // Fermer si clic sur l'overlay (fond) ou via le bouton Fermer
  if (e && e.target !== document.getElementById('desktopOverlay')) return;
  document.getElementById('desktopOverlay').classList.remove('is-open');
  document.body.style.overflow = '';
}

function copyDemoLink(btn) {
  navigator.clipboard?.writeText(window.location.href).then(() => {
    const orig = btn.innerHTML;
    btn.textContent = 'Copié !';
    setTimeout(() => { btn.innerHTML = orig; }, 1800);
  });
}

// ── Gestion de la capture (mobile uniquement à ce stade) ─────────────────────
async function handleCapture(input, mode) {
  const file = input.files[0];
  if (!file) return;
  await processCapture(file, mode);
}

async function processCapture(file, mode) {
  hideError();

  // Libérer l'objectURL précédent si existant
  if (capturedMediaURL) { URL.revokeObjectURL(capturedMediaURL); capturedMediaURL = null; }
  capturedThumbDataURL = null;
  capturedFile = file;

  const buffer  = await file.arrayBuffer();
  const hashBuf = await crypto.subtle.digest('SHA-256', buffer);
  const hex     = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2,'0')).join('');
  pendingHash   = `sha256:${hex}`;

  // Créer l'objectURL et mémoriser le type pour le résultat
  capturedMediaURL  = URL.createObjectURL(file);
  capturedMediaType = file.type.startsWith('video/') ? 'video' : 'image';

  // Lire le dataURL directement via FileReader (images uniquement)
  // FileReader évite tout problème de canvas taint sur les captures caméra mobile
  if (capturedMediaType === 'image') {
    capturedThumbDataURL = await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload  = e => resolve(e.target.result);
      reader.onerror = ()  => resolve(null);
      reader.readAsDataURL(file);
    });
  }

  // Aperçu miniature (phase 1)
  const thumb = document.getElementById('captureThumb');
  thumb.innerHTML = '';
  if (capturedMediaType === 'image') {
    const img = new Image();
    img.src = capturedMediaURL;
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block';
    thumb.appendChild(img);
  } else {
    const vid = document.createElement('video');
    vid.src = capturedMediaURL;
    vid.muted = true;
    vid.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block';
    thumb.appendChild(vid);
  }

  const typeLabels = { photo: '📷 Photo', video: '🎥 Vidéo' };
  document.getElementById('captureName').textContent = file.name;
  document.getElementById('captureType').textContent = typeLabels[mode] || '📷 Capture';
  document.getElementById('captureHash').textContent = pendingHash.slice(0, 24) + '…';

  document.getElementById('captureGrid').style.display = 'none';
  document.querySelector('.capture-doc-row').style.display = 'none';
  document.getElementById('capturePreview').classList.add('is-visible');
  document.getElementById('certifyBtn').disabled = false;
}

function clearCapture() {
  pendingHash = null;
  capturedThumbDataURL = null;
  capturedFile = null;
  if (capturedMediaURL) { URL.revokeObjectURL(capturedMediaURL); capturedMediaURL = null; }
  capturedMediaType = null;
  ['inputPhoto', 'inputVideo'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('capturePreview').classList.remove('is-visible');
  document.getElementById('captureGrid').style.display = '';
  document.querySelector('.capture-doc-row').style.display = '';
  document.getElementById('certifyBtn').disabled = true;
  hideError();
}

// ── Certification ─────────────────────────────────────────────────────────────
async function startCertify() {
  if (!pendingHash) return;

  const label = document.getElementById('labelInput').value.trim();

  setPhase(2);
  setCertStep('Envoi de l\'empreinte au serveur…');

  try {
    await sleep(300);
    setCertStep('Signature cryptographique en cours…');

    const formData = new FormData();
    formData.append('fileHash', pendingHash);
    formData.append('captureMethod', 'demo_web');
    formData.append('metadata', JSON.stringify(label ? { reference: label } : {}));
    if (capturedFile) formData.append('file', capturedFile);

    const resp = await fetch(DEMO_URL, {
      method: 'POST',
      body:   formData,
    });

    await sleep(200);
    setCertStep('Génération du reçu…');

    const raw = await resp.json();
    if (!resp.ok) throw new Error(raw?.error?.message || `Erreur ${resp.status}`);

    const data = raw.data ?? raw;
    currentReceipt = data.receipt;
    currentId      = data.id || data.receipt?.proofId;

    // Transmission locale vers verify.html (sessionStorage — rien côté serveur)
    try {
      sessionStorage.setItem('evidencia_demo_hash', pendingHash || '');
      sessionStorage.setItem('evidencia_demo_proofId', currentId || '');
      // Thumbnail : dataURL lu par FileReader dans processCapture (sans canvas, sans taint)
      if (capturedThumbDataURL) {
        sessionStorage.setItem('evidencia_demo_thumb', capturedThumbDataURL);
      } else {
        sessionStorage.removeItem('evidencia_demo_thumb');
      }
    } catch(e) { /* sessionStorage peut être bloqué en navigation privée — non bloquant */ }

    await sleep(200);
    setPhase(3);
    renderResult(data);

  } catch (err) {
    setPhase(1);
    showError('Impossible de créer la preuve : ' + err.message);
  }
}

// ── Rendu du résultat ─────────────────────────────────────────────────────────
function renderResult(data) {
  const receipt   = data.receipt || {};
  const verifyUrl = `${VERIFY_BASE}?id=${currentId}`;

  document.getElementById('resultId').textContent = currentId;

  // ── Média capturé — vignette pleine taille dans le résultat ──────
  const mediaSection = document.getElementById('resultMediaSection');
  const mediaPreview = document.getElementById('resultMediaPreview');

  if (capturedMediaURL) {
    mediaSection.style.display = '';
    mediaPreview.innerHTML = '';
    if (capturedMediaType === 'image') {
      const img = new Image();
      img.src = capturedMediaURL;
      img.alt = 'Capture certifiée';
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;position:absolute;inset:0';
      mediaPreview.appendChild(img);
    } else {
      const vid = document.createElement('video');
      vid.src      = capturedMediaURL;
      vid.muted    = true;
      vid.controls = true;
      vid.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;position:absolute;inset:0';
      mediaPreview.appendChild(vid);
    }
  } else {
    mediaSection.style.display = 'none';
  }

  const fields = [
    { label: 'Émis le',              val: formatDate(receipt.timestamp),           mono: false },
    { label: 'Méthode de capture',   val: receipt.captureMethod || '—',            mono: true  },
    { label: 'Algorithme',           val: receipt.signatureAlgorithm || 'ed25519', mono: true  },
    { label: 'Identifiant de clé',   val: receipt.publicKeyId || '—',              mono: true  },
  ];

  document.getElementById('resultDetails').innerHTML = fields.map(f => `
    <div class="ev-detail">
      <label>${f.label}</label>
      <div class="val ${f.mono ? 'mono' : ''}">${f.val}</div>
    </div>
  `).join('');

  if (receipt.fileHash) {
    document.getElementById('resultHashBox').innerHTML = `
      <div class="ev-hash-box" style="margin-top:16px">
        <div>
          <span class="ev-hash-box__label">Empreinte du fichier</span>
          <div class="ev-hash-box__val" id="hashVal">${receipt.fileHash}</div>
        </div>
        <button class="ev-copy-btn" id="hashCopyBtn">Copier</button>
      </div>
    `;
    document.getElementById('hashCopyBtn').addEventListener('click', () => copyHash(receipt.fileHash));
  }

  const qrFrame = document.getElementById('resultQr');
  qrFrame.innerHTML = '';
  try {
    new QRCode(qrFrame, { text: verifyUrl, width: 120, height: 120, colorDark: '#1a1814', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
  } catch(e) {}

  document.getElementById('openVerifyBtn').href  = verifyUrl;
  document.getElementById('nextVerifyCard').href = verifyUrl;

  // Afficher la grille téléchargements si un média est disponible
  if (capturedMediaURL) {
    document.getElementById('dlGrid').style.display = '';
  }

  markDone(1); markDone(2); markActive(3);
}

// ── Actions résultat ──────────────────────────────────────────────────────────
function copyHash(hash) {
  navigator.clipboard?.writeText(hash).then(() => {
    const btn = document.getElementById('hashCopyBtn');
    if (btn) { btn.textContent = 'Copié !'; btn.classList.add('is-done'); setTimeout(() => { btn.textContent = 'Copier'; btn.classList.remove('is-done'); }, 1800); }
  });
}

function copyLink() {
  const url = `${VERIFY_BASE}?id=${currentId}`;
  const lbl = document.getElementById('copyLinkLabel');
  function onCopied() {
    if (lbl) { lbl.textContent = 'Copié !'; setTimeout(() => lbl.textContent = 'Copier le lien', 1800); }
  }
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(url).then(onCopied).catch(() => fallbackCopy(url, onCopied));
  } else {
    fallbackCopy(url, onCopied);
  }
}

function fallbackCopy(text, onSuccess) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
  document.body.appendChild(ta);
  ta.focus(); ta.select();
  try { if (document.execCommand('copy')) onSuccess(); } catch(e) {}
  document.body.removeChild(ta);
}

function downloadReceipt() {
  if (!currentReceipt) return;
  const blob = new Blob([JSON.stringify(currentReceipt, null, 2)], { type: 'application/json' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `evidencia-recu-${currentId}.json`;
  a.click();
}

// ── Notice PDF (jsPDF) ───────────────────────────────────────────────────────
function buildNoticePdf() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const receipt   = currentReceipt || {};
  const origExt   = capturedMediaType === 'video' ? 'mp4' : 'jpg';
  const verifyUrl = `${VERIFY_BASE}?id=${currentId}`;
  const w = doc.internal.pageSize.getWidth();
  let y = 20;

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Notice de vérification', 20, y);
  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(138, 133, 128);
  doc.text(`${currentId}  ·  ${receipt.timestamp ? formatDate(receipt.timestamp) : ''}`, 20, y);
  doc.setTextColor(0, 0, 0);
  y += 8;

  // Separator
  doc.setDrawColor(200, 194, 180);
  doc.line(20, y, w - 20, y);
  y += 12;

  // Section helper — colored left border
  function section(title, color, lines) {
    const [r, g, b] = color;
    doc.setDrawColor(r, g, b);
    doc.setLineWidth(1);
    const sx = 22;
    const startY = y;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(r, g, b);
    doc.text(title, sx + 4, y);
    y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(74, 70, 64);
    for (const line of lines) {
      const wrapped = doc.splitTextToSize(line, w - sx - 28);
      doc.text(wrapped, sx + 4, y);
      y += wrapped.length * 4.2 + 2;
    }
    y += 2;

    doc.line(sx, startY - 4, sx, y - 4);
    doc.setLineWidth(0.2);
    doc.setTextColor(0, 0, 0);
    y += 6;
  }

  // Green section — Fichier canonique
  section('Fichier canonique', [14, 127, 90], [
    `Le fichier original.${origExt} est la seule preuve vérifiable cryptographiquement.`,
    'Conservez-le précieusement — il sera nécessaire pour toute vérification ultérieure.',
    `Pour vérifier : uploadez original.${origExt} sur :`,
    verifyUrl,
  ]);

  // Amber section — Version certifiée
  section('Version certifiée (avec badge)', [146, 96, 10], [
    'Le fichier certifie-evidencia.png contient le badge Evidencia.',
    'Il est destiné au partage uniquement.',
    'Ce fichier ne peut pas être vérifié cryptographiquement car le badge modifie les pixels et donc l\'empreinte numérique.',
  ]);

  // Details table
  doc.setDrawColor(200, 194, 180);
  doc.line(20, y, w - 20, y);
  y += 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Détails de la preuve', 20, y);
  y += 7;

  const details = [
    ['Identifiant', receipt.proofId || currentId],
    ['Horodatage', receipt.timestamp ? formatDate(receipt.timestamp) : '—'],
    ['Empreinte numérique', receipt.fileHash || '—'],
    ['Méthode de capture', receipt.captureMethod || '—'],
  ];

  doc.setFontSize(9);
  for (const [label, val] of details) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(138, 133, 128);
    doc.text(label, 22, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(26, 24, 20);
    const lines = doc.splitTextToSize(val, w - 70);
    doc.text(lines, 62, y);
    y += lines.length * 4 + 3;
  }

  // Footer
  const pageH = doc.internal.pageSize.getHeight();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(138, 133, 128);
  doc.text('Émis par Evidencia · evidencia.tech · ' + (receipt.timestamp || new Date().toISOString()), 20, pageH - 10);
  doc.setTextColor(0, 0, 0);

  return doc;
}

function downloadNoticePdf() {
  if (!currentId || !currentReceipt) return;
  try {
    const doc = buildNoticePdf();
    doc.save(`evidencia-notice-${currentId}.pdf`);
  } catch (err) {
    console.error('[Evidencia] Notice PDF :', err);
    alert('Erreur lors de la génération de la notice : ' + err.message);
  }
}

// ── Reçu PDF (jsPDF) ─────────────────────────────────────────────────────────
async function buildReceiptPdf() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const receipt = currentReceipt || {};
  const w = doc.internal.pageSize.getWidth();
  let y = 20;

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Evidencia — Reçu de preuve', 20, y);
  y += 10;

  // Separator
  doc.setDrawColor(200, 194, 180);
  doc.line(20, y, w - 20, y);
  y += 10;

  // Fields
  const fields = [
    ['Identifiant', receipt.proofId || currentId],
    ['Horodatage', receipt.timestamp ? formatDate(receipt.timestamp) : '—'],
    ['Empreinte numérique', receipt.fileHash || '—'],
    ['Méthode de capture', receipt.captureMethod || '—'],
    ['Algorithme', receipt.signatureAlgorithm || '—'],
    ['Clé publique (ID)', receipt.publicKeyId || '—'],
    ['Signature', receipt.signature || '—'],
  ];

  doc.setFontSize(10);
  for (const [label, val] of fields) {
    doc.setFont('helvetica', 'bold');
    doc.text(label, 20, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    // Wrap long values
    const lines = doc.splitTextToSize(val, w - 44);
    doc.text(lines, 22, y);
    y += lines.length * 4.5 + 4;
  }

  // Embed image if available
  if (capturedFile && capturedMediaType === 'image') {
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(capturedFile);
      });

      y += 5;
      doc.setDrawColor(200, 194, 180);
      doc.line(20, y, w - 20, y);
      y += 8;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Image certifiée', 20, y);
      y += 6;

      const img = new Image();
      await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = dataUrl; });
      const maxW = w - 40;
      const maxH = 100;
      const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
      const imgW = img.naturalWidth * scale;
      const imgH = img.naturalHeight * scale;

      // New page if not enough space
      if (y + imgH + 10 > doc.internal.pageSize.getHeight() - 20) {
        doc.addPage();
        y = 20;
      }

      doc.addImage(dataUrl, 'JPEG', 20, y, imgW, imgH);
      y += imgH + 6;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(138, 133, 128);
      doc.text('Image fournie à titre de référence visuelle · seule l\'empreinte numérique est certifiée', 20, y);
      doc.setTextColor(0, 0, 0);
    } catch (e) {
      console.warn('[Evidencia] Image non incluse dans le PDF :', e.message);
    }
  }

  // Footer
  const pageH = doc.internal.pageSize.getHeight();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(138, 133, 128);
  doc.text('Émis par Evidencia · evidencia.tech · ' + (receipt.timestamp || new Date().toISOString()), 20, pageH - 10);
  doc.setTextColor(0, 0, 0);

  return doc;
}

async function downloadReceiptPdf() {
  if (!currentId || !currentReceipt) return;
  const btn   = document.getElementById('btnDlPdf');
  const label = document.getElementById('pdfBtnLabel');
  const orig  = label.textContent;
  label.textContent = '…';
  btn.disabled = true;
  try {
    const doc = await buildReceiptPdf();
    doc.save(`evidencia-recu-${currentId}.pdf`);
  } catch (err) {
    console.error('[Evidencia] PDF :', err);
    alert('Erreur lors de la génération du PDF : ' + err.message);
  } finally {
    label.textContent = orig;
    btn.disabled = false;
  }
}

function shareProof() {
  const url = `${VERIFY_BASE}?id=${currentId}`;
  if (navigator.share) { navigator.share({ title: 'Preuve Evidencia', text: `Vérifier la preuve ${currentId}`, url }); }
  else copyLink();
}

function shareProofNative() {
  const url   = `${VERIFY_BASE}?id=${currentId}`;
  const label = document.getElementById('shareNativeLabel');

  // Partage natif (mobile / navigateur compatible)
  if (navigator.share) {
    navigator.share({
      title: 'Preuve Evidencia certifiée',
      text:  `Ce fichier a été certifié par Evidencia.\nIdentifiant : ${currentId}\nVérifiez son intégrité ici :`,
      url,
    }).catch(() => {}); // annulation utilisateur — non bloquant
    return;
  }

  // Fallback : copier le lien avec feedback
  const onCopied = () => {
    if (label) { label.textContent = 'Lien copié !'; setTimeout(() => label.textContent = 'Partager la version certifiée', 2000); }
  };
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(url).then(onCopied).catch(() => fallbackCopy(url, onCopied));
  } else {
    fallbackCopy(url, onCopied);
  }
}

function resetDemo() {
  currentReceipt = null; currentId = null; capturedFile = null;
  document.getElementById('labelInput').value = '';
  clearCapture();   // libère aussi capturedMediaURL
  setPhase(1);
  markActive(1);
  [2,3].forEach(n => {
    document.getElementById(`dot${n}`).className = 'progress-step__dot';
    document.getElementById(`dot${n}`).textContent = n;
    document.getElementById(`lbl${n}`).className = 'progress-step__label';
  });
}

// ── Phases ────────────────────────────────────────────────────────────────────
function setPhase(n) {
  document.querySelectorAll('.phase').forEach((el, i) => el.classList.toggle('is-active', i + 1 === n));
}
function setCertStep(txt) { document.getElementById('certStep').textContent = txt; }
function markActive(n) {
  document.getElementById(`dot${n}`).className = 'progress-step__dot is-active';
  document.getElementById(`lbl${n}`).className = 'progress-step__label is-active';
}
function markDone(n) {
  const dot = document.getElementById(`dot${n}`);
  dot.className = 'progress-step__dot is-done';
  dot.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`;
  document.getElementById(`lbl${n}`).className = 'progress-step__label is-done';
}

// ── Utilitaires ───────────────────────────────────────────────────────────────
function showError(msg) { const b = document.getElementById('errorBar'); document.getElementById('errorMsg').textContent = msg; b.classList.add('is-visible'); }
function hideError()    { document.getElementById('errorBar').classList.remove('is-visible'); }

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('fr-FR', { day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit', timeZone:'UTC' }) + ' UTC';
  } catch { return iso; }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Téléchargement original ───────────────────────────────────────────────────
function downloadOriginal() {
  if (!capturedMediaURL) return;
  const a      = document.createElement('a');
  a.href       = capturedMediaURL;
  a.download   = `evidencia-capture-${currentId}.${capturedMediaType === 'video' ? 'mp4' : 'jpg'}`;
  a.click();
}

// ── Téléchargement version certifiée (Canvas) ─────────────────────────────────
// ── Génère le PNG certifié badgé (logique partagée par téléchargement et partage) ──
async function buildCertifiedBlob() {
  if (!capturedMediaURL || !currentId) throw new Error('Aucune capture ou preuve disponible.');

  const verifyUrl = `${VERIFY_BASE}?id=${currentId}`;

  let sourceW, sourceH, drawSource;
  if (capturedMediaType === 'video') {
    const vid   = document.createElement('video');
    vid.muted   = true;
    vid.preload = 'auto';
    await new Promise((resolve) => {
      vid.onloadeddata = () => { vid.onseeked = resolve; vid.currentTime = 0.001; };
      vid.onerror = resolve;
      vid.src = capturedMediaURL;
      vid.load();
      setTimeout(resolve, 5000);
    });
    sourceW    = vid.videoWidth  || 640;
    sourceH    = vid.videoHeight || 480;
    drawSource = vid;
  } else {
    const img = new Image();
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = capturedMediaURL; });
    sourceW    = img.naturalWidth;
    sourceH    = img.naturalHeight;
    drawSource = img;
  }

  const canvas = document.createElement('canvas');
  canvas.width  = sourceW;
  canvas.height = sourceH;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(drawSource, 0, 0, sourceW, sourceH);

  const w = sourceW, h = sourceH;

  let logoImg = null;
  try { logoImg = await loadImageSafe('/logo-dtr.png'); } catch(e) {}

  const qrCanvas = await buildQRCanvas(verifyUrl, Math.max(60, Math.round(Math.min(w, h) * 0.13)));

  const pad  = Math.round(w * 0.02);
  const boxW = Math.round(w * 0.42);
  const boxH = Math.round(boxW * 0.32);
  const bx   = w - boxW - pad;
  const by   = h - boxH - pad;

  ctx.save();
  ctx.globalAlpha = 0.94;
  ctx.fillStyle   = '#0b1220';
  roundRect(ctx, bx, by, boxW, boxH, Math.round(boxH * 0.18));
  ctx.fill();
  ctx.restore();

  const innerPad = Math.round(boxW * 0.06);
  let textLeft   = bx + innerPad;

  if (logoImg) {
    const logoSize = Math.round(boxH * 0.8);
    const lx = bx + innerPad;
    const ly = by + Math.round((boxH - logoSize) / 2);
    ctx.save();
    ctx.globalAlpha = 0.98;
    ctx.drawImage(logoImg, lx, ly, logoSize, logoSize);
    ctx.restore();
    textLeft = lx + logoSize + Math.round(boxW * 0.04);
  }

  const qrSize = Math.round(boxH * 0.78);
  const gap    = Math.round(boxW * 0.04);
  const qx     = bx + boxW - innerPad - qrSize;
  const qy     = by + Math.round((boxH - qrSize) / 2);
  const textMaxRight = qx - gap;
  const maxTextWidth = Math.max(10, textMaxRight - textLeft);

  function fitFont(text, basePx, weight, family) {
    let px = basePx;
    ctx.font = `${weight} ${px}px ${family}`;
    while (ctx.measureText(text).width > maxTextWidth && px > 8) {
      px -= 1;
      ctx.font = `${weight} ${px}px ${family}`;
    }
    return px;
  }

  const line1   = by + Math.round(boxH * 0.42);
  const line2   = by + Math.round(boxH * 0.78);
  const shortId = currentId.replace('prf_', '').slice(-10);

  ctx.save();
  ctx.beginPath();
  ctx.rect(textLeft, by, maxTextWidth, boxH);
  ctx.clip();

  ctx.fillStyle = '#ffffff';
  const t1 = fitFont('CERTIFIÉ', Math.round(boxH * 0.26), 700, 'Inter, Arial, sans-serif');
  ctx.font = `700 ${t1}px Inter, Arial, sans-serif`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('CERTIFIÉ', textLeft, line1);

  ctx.fillStyle = '#cbd5e1';
  const idText = `ID: ${shortId}`;
  const t2 = fitFont(idText, Math.round(boxH * 0.20), 400, 'ui-monospace, Menlo, monospace');
  ctx.font = `${t2}px ui-monospace, Menlo, monospace`;
  ctx.fillText(idText, textLeft, line2);

  ctx.restore();
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.drawImage(qrCanvas, qx, qy, qrSize, qrSize);
  ctx.restore();

  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('toBlob null')), 'image/png');
    } catch(e) { reject(e); }
  });
}

async function downloadCertified() {
  if (!capturedMediaURL || !currentId) return;
  const btn      = document.getElementById('btnDlCertified');
  const label    = document.getElementById('certifiedBtnLabel');
  const origText = label.textContent;
  label.textContent = 'Génération…';
  btn.disabled = true;
  try {
    const pngBlob = await buildCertifiedBlob();
    const dlUrl   = URL.createObjectURL(pngBlob);
    const a       = document.createElement('a');
    a.href        = dlUrl;
    a.download    = `evidencia-certifie-${currentId}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(dlUrl), 3000);
  } catch (err) {
    console.error('[Evidencia] Export certifié :', err);
    alert(`Erreur lors de la génération : ${err.message}`);
  } finally {
    label.textContent = origText;
    btn.disabled = false;
  }
}

async function downloadProofPack() {
  if (!currentId || !currentReceipt) return;
  if (!capturedFile && !capturedMediaURL) { alert('Fichier original non disponible.'); return; }

  const btn      = document.getElementById('btnDlPack');
  const label    = document.getElementById('packBtnLabel');
  const origText = label.textContent;
  label.textContent = '…';
  btn.disabled = true;
  try {
    const zip    = new JSZip();
    const origExt = capturedMediaType === 'video' ? 'mp4' : 'jpg';

    // 1. Original file — use capturedFile (File object) directly to avoid objectURL issues on mobile
    if (capturedFile) {
      zip.file(`original.${origExt}`, capturedFile);
    } else {
      const resp = await fetch(capturedMediaURL);
      zip.file(`original.${origExt}`, await resp.blob());
    }

    // 2. Certified image with badge
    try {
      const certBlob = await buildCertifiedBlob();
      zip.file('certifie-evidencia.png', certBlob);
    } catch (e) {
      console.warn('[Evidencia] Badge non inclus :', e.message);
    }

    // 3. Receipt JSON
    zip.file('receipt.json', JSON.stringify(currentReceipt, null, 2));

    // 4. Receipt PDF
    try {
      const pdf = await buildReceiptPdf();
      zip.file('receipt.pdf', pdf.output('blob'));
    } catch (e) {
      console.warn('[Evidencia] PDF non inclus :', e.message);
    }

    // 5. Notice PDF
    try {
      const noticePdf = buildNoticePdf();
      zip.file('notice.pdf', noticePdf.output('blob'));
    } catch (e) {
      console.warn('[Evidencia] Notice PDF non inclus :', e.message);
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const dlUrl   = URL.createObjectURL(zipBlob);
    const a       = document.createElement('a');
    a.href        = dlUrl;
    a.download    = `evidencia-pack-${currentId}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(dlUrl), 3000);
  } catch (err) {
    console.error('[Evidencia] Pack de preuve :', err);
    alert('Erreur lors de la génération du pack : ' + err.message);
  } finally {
    label.textContent = origText;
    btn.disabled = false;
  }
}

async function shareProofNativeWithImage() {
  if (!currentId) return;
  const label  = document.getElementById('shareNativeLabel');
  const url    = `${VERIFY_BASE}?id=${currentId}`;
  const setLbl = t => { if (label) label.textContent = t; };

  if (navigator.share && capturedMediaURL) {
    setLbl('Génération…');
    try {
      const pngBlob = await buildCertifiedBlob();
      const file    = new File([pngBlob], `evidencia-certifie-${currentId}.png`, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Preuve Evidencia certifiée',
          text:  `Ce fichier a été certifié par Evidencia.\nIdentifiant : ${currentId}`,
        });
        setLbl('Partager');
        return;
      }
    } catch (err) {
      if (err.name === 'AbortError') { setLbl('Partager'); return; }
      console.warn('[share] image échouée, fallback lien', err.message);
      setLbl('Partager');
    }
    // Fallback : navigator.share avec lien uniquement
    try {
      await navigator.share({
        title: 'Preuve Evidencia certifiée',
        text:  `Ce fichier a été certifié par Evidencia.\nIdentifiant : ${currentId}\nVérifiez son intégrité ici :`,
        url,
      });
    } catch(e) {}
    setLbl('Partager');
    return;
  } else if (navigator.share) {
    try { await navigator.share({ title: 'Preuve Evidencia', text: `Vérifier la preuve ${currentId}`, url }); } catch(e) {}
    return;
  }

  // Fallback desktop : copier le lien
  const onCopied = () => { setLbl('Lien copié !'); setTimeout(() => setLbl('Partager'), 2000); };
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(url).then(onCopied).catch(() => fallbackCopy(url, onCopied));
  } else {
    fallbackCopy(url, onCopied);
  }
}

// ── Charge une image sans crossOrigin (objectURL ou même-origine) ─────────────
function loadImageSafe(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = reject;
    img.src     = src;
  });
}

// ── Utilitaire : rectangle arrondi ────────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y,     x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h,     x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y,         x + r, y);
  ctx.closePath();
}

// ── Génère un canvas QR blanc sur fond navy ───────────────────────────────────
function buildQRCanvas(text, size) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;visibility:hidden';
    document.body.appendChild(wrap);
    try {
      new QRCode(wrap, { text, width: size, height: size, colorDark: '#ffffff', colorLight: '#0b1220', correctLevel: QRCode.CorrectLevel.M });
    } catch(e) {
      document.body.removeChild(wrap);
      const fb = document.createElement('canvas');
      fb.width = fb.height = size;
      fb.getContext('2d').fillStyle = '#0b1220';
      fb.getContext('2d').fillRect(0, 0, size, size);
      resolve(fb); return;
    }
    setTimeout(() => {
      const qrEl = wrap.querySelector('canvas') || wrap.querySelector('img');
      const out  = document.createElement('canvas');
      out.width  = out.height = size;
      const octx = out.getContext('2d');
      octx.fillStyle = '#0b1220';
      octx.fillRect(0, 0, size, size);
      if (qrEl) { try { octx.drawImage(qrEl, 0, 0, size, size); } catch(e) {} }
      document.body.removeChild(wrap);
      resolve(out);
    }, 150);
  });
}

// ── Event listeners ───────────────────────────────────────────────────────────
// Logo fallback (replaces onerror inline handler)
document.querySelectorAll('.ev-logo__icon').forEach(img => {
  img.addEventListener('error', () => { img.style.display = 'none'; });
});

// Phase 1 — Capture
document.getElementById('btnPhoto').addEventListener('click', () => onCaptureClick('photo'));
document.getElementById('btnVideo').addEventListener('click', () => onCaptureClick('video'));
document.getElementById('btnDocument').addEventListener('click', () => { window.location.href = '/depot'; });
document.getElementById('inputPhoto').addEventListener('change', function() { handleCapture(this, 'photo'); });
document.getElementById('inputVideo').addEventListener('change', function() { handleCapture(this, 'video'); });
document.getElementById('captureClearBtn').addEventListener('click', clearCapture);
document.getElementById('certifyBtn').addEventListener('click', startCertify);

// Phase 3 — Result actions
document.getElementById('btnCopyLink').addEventListener('click', copyLink);
document.getElementById('btnDlOriginal').addEventListener('click', downloadOriginal);
document.getElementById('btnDlCertified').addEventListener('click', downloadCertified);
document.getElementById('btnDlReceipt').addEventListener('click', downloadNoticePdf);
document.getElementById('btnDlPdf').addEventListener('click', downloadReceiptPdf);
document.getElementById('btnShareNative').addEventListener('click', shareProofNativeWithImage);
document.getElementById('btnDlPack').addEventListener('click', downloadProofPack);

// Next section cards
document.getElementById('nextResetCard').addEventListener('click', resetDemo);

// Desktop modal
document.getElementById('desktopOverlay').addEventListener('click', e => closeDesktopModal(e));
document.getElementById('btnCopyDemoLink').addEventListener('click', function() { copyDemoLink(this); });
document.getElementById('btnCloseDesktopModal').addEventListener('click', () => closeDesktopModal());

// Pack tooltip toggle (mobile)
document.querySelector('.pack-info').addEventListener('click', e => {
  e.stopPropagation();
  document.querySelector('.pack-wrap').classList.toggle('is-open');
});
document.addEventListener('click', () => {
  document.querySelector('.pack-wrap').classList.remove('is-open');
});

// Keyboard
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeDesktopModal();
});
