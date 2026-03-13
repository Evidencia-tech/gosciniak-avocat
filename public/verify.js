'use strict';

// ── Config ────────────────────────────────────────────────────────────────────
const API_BASE    = `${window.location.protocol}//${window.location.host}`;
const VERIFY_BASE = `${window.location.protocol}//${window.location.host}/verify.html`;

// ── État ──────────────────────────────────────────────────────────────────────
let fileHash      = null;
let currentProofId = null;

// ── Chargement automatique depuis l'URL ───────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const params  = new URLSearchParams(window.location.search);
  const fromUrl = params.get('id') || params.get('proofId')
               || window.location.hash.replace('#','')
               || window.location.pathname.match(/\/(prf_[A-Z0-9]+)/)?.[1];

  // Récupérer les données transmises par demo.html via sessionStorage
  try {
    const demoHash    = sessionStorage.getItem('evidencia_demo_hash');
    const demoThumb   = sessionStorage.getItem('evidencia_demo_thumb');
    const demoProofId = sessionStorage.getItem('evidencia_demo_proofId');

    // Hash local : permet la vérification d'intégrité automatique
    if (demoHash && demoHash.startsWith('sha256:')) {
      fileHash = demoHash;
      // Afficher la pilule fichier pour indiquer que l'empreinte est disponible
      document.getElementById('pillName').textContent = 'Fichier certifié (démo)';
      document.getElementById('filePill').classList.add('is-visible');
    }

    // Thumbnail : afficher l'aperçu de la capture si disponible
    if (demoThumb && demoProofId && (fromUrl === demoProofId)) {
      const preview = document.getElementById('demoMediaPreview');
      if (preview) {
        const wrapper = document.createElement('div');
        wrapper.className = 'media-preview';
        const img = new Image();
        img.src = demoThumb;
        img.alt = 'Capture certifiée';
        img.className = 'media-preview__img';
        wrapper.appendChild(img);
        preview.appendChild(wrapper);
        preview.style.display = '';
      }
    }

    // Nettoyer après lecture (usage unique)
    if (demoProofId && fromUrl === demoProofId) {
      sessionStorage.removeItem('evidencia_demo_hash');
      sessionStorage.removeItem('evidencia_demo_thumb');
      sessionStorage.removeItem('evidencia_demo_proofId');
    }
  } catch(e) { /* sessionStorage bloqué — non bloquant */ }

  if (fromUrl && fromUrl.startsWith('prf_')) {
    document.getElementById('proofInput').value = fromUrl;
    setTimeout(() => doVerify(), 150);
  }
});

// ── Fichier ───────────────────────────────────────────────────────────────────
async function handleFile() {
  const file = document.getElementById('fileInput').files[0];
  if (!file) return;
  const buffer  = await file.arrayBuffer();
  const hashBuf = await crypto.subtle.digest('SHA-256', buffer);
  const hex     = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2,'0')).join('');
  fileHash      = `sha256:${hex}`;
  document.getElementById('pillName').textContent = file.name;
  document.getElementById('filePill').classList.add('is-visible');
}

function clearFile() {
  fileHash = null;
  document.getElementById('fileInput').value = '';
  document.getElementById('filePill').classList.remove('is-visible');
}

// ── Vérification ──────────────────────────────────────────────────────────────
async function doVerify() {
  const raw = document.getElementById('proofInput').value.trim();
  hideError();

  if (!raw) { showError('Veuillez entrer un identifiant de preuve commençant par prf_'); return; }
  if (!raw.startsWith('prf_')) { showError('Les identifiants de preuve commencent par prf_ — vérifiez votre saisie.'); return; }

  currentProofId = raw;
  setPhase('loading');

  try {
    setStep('Résolution de la preuve…');
    await sleep(300);
    setStep('Vérification de la signature…');

    const body = { proofId: raw };
    if (fileHash) body.fileHash = fileHash;

    const resp = await fetch(`${API_BASE}/v1/verify`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });

    setStep('Contrôle de l\'horodatage…');
    await sleep(200);

    let apiRaw;
    try { apiRaw = await resp.json(); } catch { throw new Error('Réponse inattendue du serveur.'); }
    if (!resp.ok) throw new Error(apiRaw?.error?.message || `Erreur ${resp.status}`);

    const data = apiRaw.data ?? apiRaw;          // désenveloppe { ok, data } → data
    setPhase('result');
    renderCertificate(data);

  } catch (err) {
    setPhase('search');
    showError(err.message);
  }
}

// ── Rendu du certificat ───────────────────────────────────────────────────────
function renderCertificate(data) {
  const valid  = data.valid;
  const proof  = data.proof  || {};
  const checks = data.checks || {};

  // Bandeau verdict
  const strip = document.getElementById('verdictStrip');
  strip.className = `verdict-strip ${valid ? 'is-valid' : 'is-invalid'}`;

  document.getElementById('verdictSeal').innerHTML = valid
    ? `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
    : `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

  document.getElementById('verdictLabel').textContent = valid ? 'Vérification réussie' : 'Vérification échouée';
  document.getElementById('verdictTitle').textContent = valid ? 'Cette preuve est authentique.' : 'Cette preuve est invalide.';
  document.getElementById('verdictSub').textContent   = valid
    ? `Émise le ${formatDate(proof.timestamp)} · Signée par Evidencia`
    : 'Un ou plusieurs contrôles cryptographiques ont échoué. Cette preuve a peut-être été altérée.';

  // Aperçu media : afficher photoUrl si disponible et si l'aperçu sessionStorage n'est pas déjà actif
  const preview = document.getElementById('demoMediaPreview');
  if (preview && preview.style.display === 'none' && proof.photoUrl) {
    const wrapper = document.createElement('div');
    wrapper.className = 'media-preview';
    const img = document.createElement('img');
    img.src = proof.photoUrl;
    img.alt = 'Image originale certifiée';
    img.className = 'media-preview__img';
    img.onerror = () => { preview.style.display = 'none'; };
    const disclaimer = document.createElement('p');
    disclaimer.className = 'media-preview__disclaimer';
    disclaimer.textContent = 'Image fournie à titre de référence visuelle · seul le hash SHA-256 est certifié';
    wrapper.appendChild(img);
    wrapper.appendChild(disclaimer);
    preview.appendChild(wrapper);
    preview.style.display = '';
  }

  // Contrôles
  const checkDefs = [
    { key: 'signatureValid',     name: 'Signature cryptographique',  desc: 'La signature Ed25519 est authentique et correspond au contenu de la preuve.',       descFail: 'La signature ne correspond pas. La preuve a peut-être été modifiée.' },
    { key: 'hashMatch',          name: 'Intégrité du fichier',       desc: 'L\'empreinte SHA-256 du fichier original correspond à la preuve.',                  descSkip: 'Aucun fichier fourni — la comparaison d\'empreinte n\'a pas été effectuée.', descFail: 'L\'empreinte ne correspond pas. Il peut s\'agir d\'un fichier différent.' },
    { key: 'timestampPlausible', name: 'Validité de l\'horodatage',  desc: 'L\'horodatage de la preuve est cohérent et n\'est pas daté dans le futur.',         descFail: 'L\'horodatage semble invalide ou est situé dans le futur.' },
  ];

  const list = document.getElementById('checkList');
  list.innerHTML = '';
  checkDefs.forEach((def, i) => {
    const val   = checks[def.key];
    const state = val === null || val === undefined ? 'skip' : val ? 'pass' : 'fail';
    const badge = state === 'pass' ? 'Vérifié' : state === 'fail' ? 'Échoué' : 'Non vérifié';
    const desc  = state === 'skip' ? (def.descSkip || def.desc) : state === 'fail' ? (def.descFail || def.desc) : def.desc;

    const el = document.createElement('div');
    el.className = 'check-item';
    el.style.animationDelay = `${i * 90}ms`;
    el.innerHTML = `
      <div class="check-dot ${state}"></div>
      <div class="check-info">
        <div class="check-name">${def.name}</div>
        <div class="check-desc">${desc}</div>
      </div>
      <span class="check-badge ${state}">${badge}</span>
    `;
    list.appendChild(el);
  });

  // Détails
  const fields = [
    { label: 'Identifiant de preuve',    val: data.proofId || '—',                       mono: true },
    { label: 'Émise le',                 val: formatDate(proof.timestamp),                mono: false },
    { label: 'Méthode de capture',       val: proof.captureMethod || '—',                 mono: true },
    { label: 'Algorithme de signature',  val: proof.signatureAlgorithm || 'ed25519',      mono: true },
    { label: 'Clé de signature',         val: proof.publicKeyId || '—',                   mono: true },
    { label: 'Vérifié le',               val: formatDate(data.verifiedAt),                mono: false },
  ];

  // Référence média — durable identifier fourni par le client B2B
  if (proof.mediaRef) {
    const refVal = typeof proof.mediaRef === 'object'
      ? `${proof.mediaRef.system} · ${proof.mediaRef.id}`
      : String(proof.mediaRef);
    fields.push({ label: 'Référence média', val: refVal, mono: true });
  }

  document.getElementById('detailsGrid').innerHTML = fields.map(f => `
    <div class="ev-detail">
      <label>${f.label}</label>
      <div class="val ${f.mono ? 'mono' : ''}">${f.val}</div>
    </div>
  `).join('');

  if (proof.fileHash) {
    document.getElementById('hashRow').innerHTML = `
      <div class="ev-hash-box">
        <div>
          <span class="ev-hash-box__label">Empreinte du fichier (SHA-256)</span>
          <div class="ev-hash-box__val" id="hashValDisplay">${proof.fileHash}</div>
        </div>
        <button class="ev-copy-btn" id="hashCopyBtn">Copier</button>
      </div>
    `;
    document.getElementById('hashCopyBtn').addEventListener('click', () => copyHash(proof.fileHash));
  }

  // QR code
  const verifyUrl = `${VERIFY_BASE}?id=${data.proofId}`;
  document.getElementById('qrUrl').textContent = verifyUrl;
  const qrFrame = document.getElementById('qrFrame');
  qrFrame.innerHTML = '';
  try {
    new QRCode(qrFrame, { text: verifyUrl, width: 120, height: 120, colorDark: '#1a1814', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
  } catch(e) { qrFrame.innerHTML = '<div style="font-size:10px;color:#8a8580;text-align:center">QR indisponible</div>'; }
}

// ── Actions ───────────────────────────────────────────────────────────────────
function copyHash(hash) {
  navigator.clipboard?.writeText(hash).then(() => {
    const btn = document.getElementById('hashCopyBtn');
    if (btn) { btn.textContent = 'Copié !'; btn.classList.add('is-done'); setTimeout(() => { btn.textContent = 'Copier'; btn.classList.remove('is-done'); }, 1800); }
  });
}

function copyVerifyUrl() {
  const url = `${VERIFY_BASE}?id=${currentProofId}`;
  const lbl = document.getElementById('copyUrlLabel');
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

function resetForm() {
  setPhase('search');
  document.getElementById('proofInput').value = '';
  // Clear media preview for next verification
  const preview = document.getElementById('demoMediaPreview');
  if (preview) { preview.innerHTML = ''; preview.style.display = 'none'; }
  clearFile();
  hideError();
  currentProofId = null;
  history.pushState({}, '', window.location.pathname);
}

// ── Phases ────────────────────────────────────────────────────────────────────
function setPhase(phase) {
  document.getElementById('searchSection').style.display = phase === 'search'  ? 'block' : 'none';
  document.getElementById('loadingState').classList.toggle('is-visible', phase === 'loading');
  document.getElementById('certificate').classList.toggle('is-visible',  phase === 'result');
}

function setStep(t) { document.getElementById('loadingStep').textContent = t; }

// ── Utilitaires ───────────────────────────────────────────────────────────────
function showError(msg) { const b = document.getElementById('errorBar'); document.getElementById('errorMsg').textContent = msg; b.classList.add('is-visible'); }
function hideError()    { document.getElementById('errorBar').classList.remove('is-visible'); }

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';
  } catch { return iso; }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Scanner QR ────────────────────────────────────────────────────────────────
let scannerStream    = null;
let scannerAnimFrame = null;
let scannerActive    = false;

async function openScanner() {
  const overlay = document.getElementById('scannerOverlay');
  overlay.classList.add('is-open');
  document.body.style.overflow = 'hidden';
  setScanStatus('Pointez la caméra vers le QR code de la preuve', '');

  try {
    // Préférer la caméra arrière sur mobile
    scannerStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    const video = document.getElementById('scannerVideo');
    video.srcObject = scannerStream;
    await video.play();
    scannerActive = true;
    tickScan();
  } catch (err) {
    const msg = err.name === 'NotAllowedError'
      ? 'Accès à la caméra refusé. Autorisez l\'accès dans les paramètres de votre navigateur.'
      : err.name === 'NotFoundError'
      ? 'Aucune caméra détectée sur cet appareil.'
      : 'Impossible d\'accéder à la caméra : ' + (err.message || err.name);
    setScanStatus(msg, 'is-error');
  }
}

function tickScan() {
  if (!scannerActive) return;
  const video  = document.getElementById('scannerVideo');
  const canvas = document.getElementById('scannerCanvas');

  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    try {
      const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
      if (code && code.data) {
        handleScanResult(code.data);
        return; // stop loop after successful scan
      }
    } catch(e) { /* jsQR not yet loaded — keep ticking */ }
  }

  scannerAnimFrame = requestAnimationFrame(tickScan);
}

function handleScanResult(raw) {
  scannerActive = false;
  setScanStatus('QR code détecté…', 'is-ok');

  // Extraire le proofId — accepte une URL complète ou un id direct
  let proofId = null;

  try {
    // Cas 1 : URL complète (https://…/verify.html?id=prf_xxx)
    const url = new URL(raw);
    proofId = url.searchParams.get('id') || url.searchParams.get('proofId')
           || url.hash.replace('#', '')
           || url.pathname.match(/\/(prf_[A-Z0-9]+)/i)?.[1];
  } catch {
    // Cas 2 : identifiant direct prf_xxx
    if (raw.trim().startsWith('prf_')) proofId = raw.trim();
  }

  if (!proofId || !proofId.startsWith('prf_')) {
    setScanStatus('QR code non reconnu — ce code ne semble pas être une preuve Evidencia.', 'is-error');
    scannerActive = true;
    scannerAnimFrame = requestAnimationFrame(tickScan);
    return;
  }

  // Succès — on ferme et on lance la vérification
  setTimeout(() => {
    closeScanner();
    document.getElementById('proofInput').value = proofId;
    doVerify();
  }, 500);
}

function closeScanner() {
  scannerActive = false;
  if (scannerAnimFrame) { cancelAnimationFrame(scannerAnimFrame); scannerAnimFrame = null; }
  if (scannerStream)    { scannerStream.getTracks().forEach(t => t.stop()); scannerStream = null; }
  const video = document.getElementById('scannerVideo');
  video.srcObject = null;
  document.getElementById('scannerOverlay').classList.remove('is-open');
  document.body.style.overflow = '';
}

function onOverlayClick(e) {
  if (e.target === document.getElementById('scannerOverlay')) closeScanner();
}

function setScanStatus(msg, cls) {
  const el = document.getElementById('scannerStatus');
  el.textContent  = msg;
  el.className    = 'scanner-status' + (cls ? ' ' + cls : '');
}

// ── Event listeners ───────────────────────────────────────────────────────────
document.getElementById('verifyBtn').addEventListener('click', doVerify);
document.getElementById('scanBtn').addEventListener('click', openScanner);
document.getElementById('fileInput').addEventListener('change', handleFile);
document.getElementById('fileClearBtn').addEventListener('click', clearFile);
document.getElementById('printBtn').addEventListener('click', () => window.print());
document.getElementById('copyUrlBtn').addEventListener('click', copyVerifyUrl);
document.getElementById('resetBtn').addEventListener('click', resetForm);
document.getElementById('scannerOverlay').addEventListener('click', onOverlayClick);
document.getElementById('proofInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') doVerify();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.getElementById('scannerOverlay').classList.contains('is-open')) {
    closeScanner();
  }
});
