'use strict';

const API_BASE   = '';        // même origin
const LS_KEY     = 'ev_dashboard_api_key';

// ── State ──────────────────────────────────────────────────────────────────
let apiKey       = null;
let isAdmin      = false;
let expandedRow  = null;   // proofId actuellement expand

// ── DOM refs ───────────────────────────────────────────────────────────────
const authScreen    = document.getElementById('authScreen');
const dashScreen    = document.getElementById('dashScreen');
const apiKeyInput   = document.getElementById('apiKeyInput');
const connectBtn    = document.getElementById('connectBtn');
const authError     = document.getElementById('authError');
const authErrorMsg  = document.getElementById('authErrorMsg');
const logoutBtn     = document.getElementById('logoutBtn');
const keyDisplay    = document.getElementById('keyDisplay');
const envBadge      = document.getElementById('envBadge');
const statTotal     = document.getElementById('statTotal');
const statShown     = document.getElementById('statShown');
const statEnv       = document.getElementById('statEnv');
const refreshBtn    = document.getElementById('refreshBtn');
const proofsLoading = document.getElementById('proofsLoading');
const proofsEmpty   = document.getElementById('proofsEmpty');
const proofsTable   = document.getElementById('proofsTable');
const proofsTbody   = document.getElementById('proofsTbody');
const verifyInput   = document.getElementById('verifyInput');
const verifyBtn     = document.getElementById('verifyBtn');
const verifyResult  = document.getElementById('verifyResult');
const verifyResultTitle  = document.getElementById('verifyResultTitle');
const verifyResultBody   = document.getElementById('verifyResultBody');
const verifyResultChecks = document.getElementById('verifyResultChecks');

// ── Helpers ────────────────────────────────────────────────────────────────

function apiFetch(path, opts = {}) {
  return fetch(API_BASE + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      ...(opts.headers || {}),
    },
  });
}

function maskKey(key) {
  if (!key) return '—';
  if (key.length <= 20) return key;
  return key.slice(0, 20) + '…';
}

function envFromKey(key = '') {
  if (key.includes('_test_')) return 'test';
  return 'live';
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function truncateHash(hash = '') {
  const hex = hash.replace('sha256:', '');
  if (hex.length <= 16) return hex;
  return hex.slice(0, 8) + '…' + hex.slice(-8);
}

function showAuthError(msg) {
  authErrorMsg.textContent = msg;
  authError.style.display = 'flex';
}

function hideAuthError() {
  authError.style.display = 'none';
}

// ── Auth flow ──────────────────────────────────────────────────────────────

function showAuth() {
  authScreen.style.display = 'flex';
  dashScreen.style.display = 'none';
  apiKeyInput.focus();
}

function showDash() {
  authScreen.style.display = 'none';
  dashScreen.style.display = 'block';

  const env = isAdmin ? 'admin' : envFromKey(apiKey);
  keyDisplay.textContent = maskKey(apiKey);
  envBadge.textContent   = env;
  envBadge.className     = 'ev-badge ' + (env === 'admin' ? 'ev-badge--green' : env === 'test' ? 'ev-badge--amber' : 'ev-badge--green');
  statEnv.textContent    = env;

  loadProofs();

  if (isAdmin) {
    loadAccessRequests();
    loadApiKeys();
    const keysSection = document.getElementById('keysSection');
    const keysCard    = document.getElementById('keysCard');
    if (keysSection) keysSection.style.display = 'flex';
    if (keysCard)    keysCard.style.display    = 'block';
  } else {
    // Clients: hide admin-only sections
    const accessSection = document.getElementById('accessSection');
    const accessCard    = document.getElementById('accessCard');
    const keysSection   = document.getElementById('keysSection');
    const keysCard      = document.getElementById('keysCard');
    if (accessSection) accessSection.style.display = 'none';
    if (accessCard)    accessCard.style.display    = 'none';
    if (keysSection)   keysSection.style.display   = 'none';
    if (keysCard)      keysCard.style.display       = 'none';
  }
}

async function tryConnect(key) {
  connectBtn.disabled    = true;
  connectBtn.textContent = 'Connexion…';
  hideAuthError();

  if (!key) {
    showAuthError('Clé requise.');
    connectBtn.disabled    = false;
    connectBtn.textContent = 'Accéder au dashboard';
    return;
  }

  apiKey = key;
  try {
    const res = await apiFetch('/v1/me');
    if (res.status === 401 || res.status === 403) {
      showAuthError('Clé invalide ou révoquée.');
      apiKey  = null;
      isAdmin = false;
      connectBtn.disabled    = false;
      connectBtn.textContent = 'Accéder au dashboard';
      return;
    }
    if (!res.ok) {
      showAuthError('Erreur serveur. Réessayez.');
      apiKey  = null;
      isAdmin = false;
      connectBtn.disabled    = false;
      connectBtn.textContent = 'Accéder au dashboard';
      return;
    }
    const body = await res.json();
    isAdmin = body.data && body.data.isAdmin === true;
  } catch {
    showAuthError('Impossible de contacter le serveur.');
    apiKey  = null;
    isAdmin = false;
    connectBtn.disabled    = false;
    connectBtn.textContent = 'Accéder au dashboard';
    return;
  }

  localStorage.setItem(LS_KEY, key);
  connectBtn.disabled    = false;
  connectBtn.textContent = 'Accéder au dashboard';
  showDash();
}

connectBtn.addEventListener('click', () => {
  tryConnect(apiKeyInput.value.trim());
});

apiKeyInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') tryConnect(apiKeyInput.value.trim());
});

logoutBtn.addEventListener('click', () => {
  apiKey  = null;
  isAdmin = false;
  localStorage.removeItem(LS_KEY);
  showAuth();
});

// ── Proofs list ────────────────────────────────────────────────────────────

async function loadProofs() {
  // Reset
  proofsLoading.style.display = 'flex';
  proofsEmpty.style.display   = 'none';
  proofsTable.style.display   = 'none';
  proofsTbody.innerHTML       = '';
  expandedRow                 = null;
  statTotal.textContent       = '—';
  statShown.textContent       = '—';

  let data;
  try {
    const res = await apiFetch('/v1/proofs?limit=20');
    if (!res.ok) {
      proofsLoading.style.display = 'none';
      proofsEmpty.style.display   = 'block';
      proofsEmpty.innerHTML = '<svg class="proofs-empty__icon" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>Erreur de chargement.';
      return;
    }
    const body = await res.json();
    data = body.data;
  } catch {
    proofsLoading.style.display = 'none';
    proofsEmpty.style.display   = 'block';
    proofsEmpty.innerHTML = 'Impossible de charger les preuves.';
    return;
  }

  statTotal.textContent = data.total ?? '—';
  statShown.textContent = (data.proofs || []).length;

  proofsLoading.style.display = 'none';

  if (!data.proofs || data.proofs.length === 0) {
    proofsEmpty.style.display = 'block';
    proofsEmpty.innerHTML = '<svg class="proofs-empty__icon" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>Aucune preuve trouvée.';
    return;
  }

  data.proofs.forEach(receipt => renderProofRow(receipt));
  proofsTable.style.display = 'table';
}

function renderProofRow(receipt) {
  const proofId = receipt.proofId || receipt.id || '—';
  const hash    = receipt.fileHash || '—';
  const date    = receipt.timestamp || null;

  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><span class="proof-id" data-id="${esc(proofId)}">${esc(proofId)}</span></td>
    <td><span class="proof-hash" title="${esc(hash)}">${esc(truncateHash(hash))}</span></td>
    <td class="proof-date">${esc(formatDate(date))}</td>
    <td>
      <button class="ev-btn ev-btn--ghost ev-btn--sm expand-btn" data-id="${esc(proofId)}">
        Détails
      </button>
    </td>
  `;
  tr.dataset.proofId = proofId;
  tr.dataset.receipt = JSON.stringify(receipt);
  proofsTbody.appendChild(tr);

  // Click on proof ID → fill verify box
  tr.querySelector('.proof-id').addEventListener('click', () => {
    verifyInput.value = proofId;
    verifyInput.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    verifyInput.focus();
  });

  // Expand button
  tr.querySelector('.expand-btn').addEventListener('click', () => toggleDetail(tr, receipt));
}

function toggleDetail(tr, receipt) {
  const existing = proofsTbody.querySelector('.proof-detail-row');

  // Collapse if clicking the same row
  if (existing && expandedRow === tr) {
    existing.remove();
    tr.querySelector('.expand-btn').textContent = 'Détails';
    expandedRow = null;
    return;
  }

  // Remove any open detail row
  if (existing) {
    existing.remove();
    if (expandedRow) expandedRow.querySelector('.expand-btn').textContent = 'Détails';
  }

  expandedRow = tr;
  tr.querySelector('.expand-btn').textContent = 'Fermer';

  const sig   = receipt.signature || '—';
  const keyId = receipt.publicKeyId || receipt.key_id || '—';
  const cm    = receipt.captureMethod || '—';

  const detailTr = document.createElement('tr');
  detailTr.className = 'proof-detail-row';
  detailTr.innerHTML = `
    <td colspan="4">
      <div class="proof-detail-inner">
        <div class="proof-detail-grid">
          <div class="proof-detail-field">
            <label>Proof ID</label>
            <div class="val mono">${esc(receipt.proofId || '—')}</div>
          </div>
          <div class="proof-detail-field">
            <label>Timestamp</label>
            <div class="val">${esc(formatDate(receipt.timestamp))}</div>
          </div>
          <div class="proof-detail-field">
            <label>Empreinte numérique</label>
            <div class="val mono">${esc(receipt.fileHash || '—')}</div>
          </div>
          <div class="proof-detail-field">
            <label>Méthode</label>
            <div class="val">${esc(cm)}</div>
          </div>
          <div class="proof-detail-field">
            <label>Clé de signature (ID)</label>
            <div class="val mono">${esc(keyId)}</div>
          </div>
          <div class="proof-detail-field">
            <label>Signature</label>
            <div class="val mono" style="font-size:10px;word-break:break-all;">${esc(sig.slice(0, 48))}…</div>
          </div>
        </div>
        <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap;">
          <button class="ev-btn ev-btn--outline ev-btn--sm verify-this-btn" data-id="${esc(receipt.proofId)}">
            Vérifier cette preuve
          </button>
          <button class="ev-btn ev-btn--ghost ev-btn--sm copy-id-btn" data-id="${esc(receipt.proofId)}">
            Copier l'ID
          </button>
        </div>
      </div>
    </td>
  `;

  tr.insertAdjacentElement('afterend', detailTr);

  detailTr.querySelector('.verify-this-btn').addEventListener('click', () => {
    verifyInput.value = receipt.proofId;
    runVerify(receipt.proofId);
    verifyResult.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  detailTr.querySelector('.copy-id-btn').addEventListener('click', function () {
    navigator.clipboard.writeText(receipt.proofId).then(() => {
      this.textContent = 'Copié !';
      setTimeout(() => { this.textContent = "Copier l'ID"; }, 1500);
    });
  });
}

refreshBtn.addEventListener('click', loadProofs);

// ── Verify ─────────────────────────────────────────────────────────────────

async function runVerify(proofId) {
  const id = (proofId || verifyInput.value.trim());
  if (!id) return;

  verifyResult.className      = 'verify-result is-loading';
  verifyResult.style.display  = 'flex';
  verifyResultTitle.textContent = 'Vérification…';
  verifyResultBody.textContent  = '';
  verifyResultChecks.innerHTML  = '';
  verifyBtn.disabled = true;

  try {
    const res = await fetch(API_BASE + '/v1/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proofId: id }),
    });
    const body = await res.json();
    renderVerifyResult(body, id);
  } catch {
    verifyResult.className    = 'verify-result is-invalid';
    verifyResultTitle.textContent = 'Erreur réseau';
    verifyResultBody.textContent  = 'Impossible de contacter le serveur.';
  } finally {
    verifyBtn.disabled = false;
  }
}

function renderVerifyResult(body, proofId) {
  const d = body.data || {};

  if (d.valid === true) {
    verifyResult.className    = 'verify-result is-valid';
    verifyResultTitle.textContent = '✓ Preuve valide';
    verifyResultBody.textContent  = `Proof ID : ${proofId}`;
    renderChecks(d.checks);
  } else if (d.result === 'not_found') {
    verifyResult.className    = 'verify-result is-invalid';
    verifyResultTitle.textContent = '✗ Introuvable';
    verifyResultBody.textContent  = `Aucune preuve avec l'ID : ${proofId}`;
    verifyResultChecks.innerHTML  = '';
  } else {
    verifyResult.className    = 'verify-result is-invalid';
    verifyResultTitle.textContent = '✗ Preuve invalide';
    verifyResultBody.textContent  = `Résultat : ${d.result || 'invalide'}`;
    renderChecks(d.checks);
  }
}

function renderChecks(checks) {
  verifyResultChecks.innerHTML = '';
  if (!checks || typeof checks !== 'object') return;
  const labels = {
    signatureValid: 'Signature',
    hashMatch:      'Hash',
    structureValid: 'Structure',
    timestampPlausible: 'Horodatage',
  };
  Object.entries(checks).forEach(([k, v]) => {
    const label = labels[k] || k;
    const ok    = v === true;
    const span  = document.createElement('span');
    span.className = 'ev-badge ' + (ok ? 'ev-badge--green' : 'ev-badge--red');
    span.innerHTML = `<span class="ev-badge__dot"></span>${esc(label)} : ${ok ? 'OK' : 'KO'}`;
    verifyResultChecks.appendChild(span);
  });
}

verifyBtn.addEventListener('click', () => runVerify());
verifyInput.addEventListener('keydown', e => { if (e.key === 'Enter') runVerify(); });

// ── XSS helper ─────────────────────────────────────────────────────────────
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Access requests (admin only) ───────────────────────────────────────────

const accessSection    = document.getElementById('accessSection');
const accessCard       = document.getElementById('accessCard');
const accessLoading    = document.getElementById('accessLoading');
const accessEmpty      = document.getElementById('accessEmpty');
const accessTable      = document.getElementById('accessTable');
const accessTbody      = document.getElementById('accessTbody');
const refreshAccessBtn = document.getElementById('refreshAccessBtn');

async function loadAccessRequests() {
  accessSection.style.display = 'flex';
  accessCard.style.display    = 'block';
  accessLoading.style.display = 'flex';
  accessEmpty.style.display   = 'none';
  accessTable.style.display   = 'none';
  accessTbody.innerHTML       = '';

  let data;
  try {
    const res = await apiFetch('/v1/access-requests');
    if (res.status === 403) {
      accessSection.style.display = 'none';
      accessCard.style.display    = 'none';
      return;
    }
    if (!res.ok) {
      accessLoading.style.display = 'none';
      accessEmpty.style.display   = 'block';
      accessEmpty.textContent     = 'Erreur de chargement.';
      return;
    }
    const body = await res.json();
    data = body.data;
  } catch {
    accessLoading.style.display = 'none';
    accessEmpty.style.display   = 'block';
    accessEmpty.textContent     = 'Impossible de charger les demandes.';
    return;
  }

  accessLoading.style.display = 'none';

  const requests = data.requests || [];
  if (requests.length === 0) {
    accessEmpty.style.display = 'block';
    return;
  }

  requests.forEach(r => renderAccessRow(r));
  accessTable.style.display = 'table';
}

function statusBadge(status) {
  const labels = { pending: 'En attente', approved: 'Approuvée', refused: 'Refusée' };
  return `<span class="access-status access-status--${esc(status)}">${esc(labels[status] || status)}</span>`;
}

function renderAccessRow(r) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>${esc(r.name)}</td>
    <td><a href="mailto:${esc(r.email)}" style="color:var(--blue)">${esc(r.email)}</a></td>
    <td>${esc(r.organization || '—')}</td>
    <td>${statusBadge(r.status)}</td>
    <td class="proof-date">${esc(formatDate(r.createdAt))}</td>
    <td>
      <div class="access-actions" id="actions-${esc(r.id)}">
        ${r.status === 'pending' ? `
          <button class="access-approve-btn" data-approve-token="${esc(r.approveToken)}" data-id="${esc(r.id)}">Approuver</button>
          <button class="access-refuse-btn"  data-refuse-token="${esc(r.refuseToken)}"   data-id="${esc(r.id)}">Refuser</button>
        ` : '—'}
      </div>
    </td>
  `;
  accessTbody.appendChild(tr);

  if (r.status === 'pending') {
    tr.querySelector('.access-approve-btn').addEventListener('click', function () {
      doAccessAction(this.dataset.approveToken, 'approve', this.dataset.id, this);
    });
    tr.querySelector('.access-refuse-btn').addEventListener('click', function () {
      doAccessAction(this.dataset.refuseToken, 'refuse', this.dataset.id, this);
    });
  }
}

async function doAccessAction(token, action, id, btn) {
  btn.disabled    = true;
  btn.textContent = '…';

  try {
    const url = `/admin/${action}?token=${encodeURIComponent(token)}&format=json`;
    const res  = await fetch(url);
    const body = await res.json().catch(() => ({}));

    const cell = document.getElementById(`actions-${id}`);
    if (res.ok && body.status) {
      const labels = { approved: 'Approuvée', refused: 'Refusée' };
      if (cell) cell.innerHTML = statusBadge(body.status) + `<span style="font-size:11px;color:var(--ink-dim);margin-left:6px">${esc(labels[body.status] || body.status)}</span>`;
      const statusTd = cell && cell.closest('tr') && cell.closest('tr').children[3];
      if (statusTd) statusTd.innerHTML = statusBadge(body.status);
    } else {
      btn.disabled    = false;
      btn.textContent = action === 'approve' ? 'Approuver' : 'Refuser';
      alert(body.error || 'Erreur lors de l\'action.');
    }
  } catch {
    btn.disabled    = false;
    btn.textContent = action === 'approve' ? 'Approuver' : 'Refuser';
    alert('Erreur réseau.');
  }
}

refreshAccessBtn.addEventListener('click', loadAccessRequests);

// ── API Keys (admin only) ──────────────────────────────────────────────────

const keysSection   = document.getElementById('keysSection');
const keysCard      = document.getElementById('keysCard');
const keysLoading   = document.getElementById('keysLoading');
const keysEmpty     = document.getElementById('keysEmpty');
const keysTable     = document.getElementById('keysTable');
const keysTbody     = document.getElementById('keysTbody');
const refreshKeysBtn = document.getElementById('refreshKeysBtn');

async function loadApiKeys() {
  keysLoading.style.display = 'flex';
  keysEmpty.style.display   = 'none';
  keysTable.style.display   = 'none';
  keysTbody.innerHTML       = '';

  let data;
  try {
    const res = await apiFetch('/v1/keys');
    if (!res.ok) {
      keysLoading.style.display = 'none';
      keysEmpty.style.display   = 'block';
      keysEmpty.textContent     = 'Erreur de chargement.';
      return;
    }
    const body = await res.json();
    data = body.data;
  } catch {
    keysLoading.style.display = 'none';
    keysEmpty.style.display   = 'block';
    keysEmpty.textContent     = 'Impossible de charger les clés.';
    return;
  }

  keysLoading.style.display = 'none';

  const keys = data.keys || [];
  if (keys.length === 0) {
    keysEmpty.style.display = 'block';
    return;
  }

  keys.forEach(k => renderKeyRow(k));
  keysTable.style.display = 'table';
}

function renderKeyRow(k) {
  const tr = document.createElement('tr');
  const env = k.environment || 'live';

  const titulaire = k.requesterName
    ? esc(k.requesterName) + (k.requesterOrganization ? `<br><small style="color:var(--ink-dim)">${esc(k.requesterOrganization)}</small>` : '')
    : `<span style="color:var(--ink-dim)">Admin</span>`;

  const email = k.requesterEmail
    ? `<a href="mailto:${esc(k.requesterEmail)}" style="color:var(--blue)">${esc(k.requesterEmail)}</a>`
    : '—';

  tr.innerHTML = `
    <td>${titulaire}</td>
    <td>${email}</td>
    <td><span class="ev-badge ${env === 'test' ? 'ev-badge--amber' : 'ev-badge--green'}">${esc(env)}</span></td>
    <td>${esc(String(k.proofCount ?? 0))}</td>
    <td class="proof-date">${esc(formatDate(k.createdAt))}</td>
    <td>
      <button class="access-refuse-btn revoke-key-btn" data-id="${esc(k.id)}" data-label="${esc(k.label || k.id)}">
        Révoquer
      </button>
    </td>
  `;
  keysTbody.appendChild(tr);

  tr.querySelector('.revoke-key-btn').addEventListener('click', function () {
    revokeKey(this.dataset.id, this.dataset.label, this);
  });
}

async function revokeKey(id, label, btn) {
  if (!confirm(`Révoquer la clé "${label}" ? Cette action est irréversible.`)) return;

  btn.disabled    = true;
  btn.textContent = '…';

  try {
    const res  = await apiFetch(`/v1/keys/${encodeURIComponent(id)}`, { method: 'DELETE' });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      btn.closest('tr').remove();
      if (keysTbody.children.length === 0) {
        keysTable.style.display = 'none';
        keysEmpty.style.display = 'block';
        keysEmpty.textContent   = 'Aucune clé active.';
      }
    } else {
      btn.disabled    = false;
      btn.textContent = 'Révoquer';
      alert(body.error?.message || 'Erreur lors de la révocation.');
    }
  } catch {
    btn.disabled    = false;
    btn.textContent = 'Révoquer';
    alert('Erreur réseau.');
  }
}

if (refreshKeysBtn) refreshKeysBtn.addEventListener('click', loadApiKeys);

// ── Boot ───────────────────────────────────────────────────────────────────
(function init() {
  const saved = localStorage.getItem(LS_KEY);
  if (saved) {
    tryConnect(saved);
  } else {
    showAuth();
  }
})();
