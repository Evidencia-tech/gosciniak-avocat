// ── Définition des endpoints ──────────────────────────────────────────────────
const ENDPOINTS = {
  create:    { method: 'POST', path: '/v1/proofs',     auth: true,  label: 'Créer une preuve' },
  retrieve:  { method: 'GET',  path: '/v1/proofs/:id', auth: true,  label: 'Récupérer une preuve' },
  verify:    { method: 'POST', path: '/v1/verify',     auth: false, label: 'Vérifier une preuve' },
  publicKey: { method: 'GET',  path: '/v1/public-key', auth: false, label: 'Clé publique' },
};

// ── État ──────────────────────────────────────────────────────────────────────
let currentEndpoint = 'create';
let computedHash    = null;

// ── Sélection d'un endpoint ───────────────────────────────────────────────────
function selectEndpoint(id) {
  currentEndpoint = id;
  computedHash    = null;

  document.querySelectorAll('.endpoint-btn').forEach(b => b.classList.remove('is-active'));
  document.getElementById(`btn-${id}`).classList.add('is-active');

  const ep = ENDPOINTS[id];
  const methodEl = document.getElementById('reqMethod');
  methodEl.textContent  = ep.method;
  methodEl.style.color  = ep.method === 'POST' ? 'var(--green)' : 'var(--blue)';
  document.getElementById('reqPath').textContent = ep.path;

  // Réinitialiser l'onglet actif
  document.getElementById('tab-params').classList.add('is-active');
  document.getElementById('tab-curl').classList.remove('is-active');

  renderFields(id);
  clearResponse();
  updateCurl();
}

// ── Rendu des champs ──────────────────────────────────────────────────────────
function renderFields(id) {
  const c = document.getElementById('editorFields');
  c.innerHTML = '';

  if (id === 'create') {
    c.innerHTML = `
      <div class="field-group">
        <label>Fichier (empreinte calculée localement)</label>
        <div class="file-drop" id="createDrop">
          <input type="file" id="createFile" />
          <div class="file-drop__text">Déposer un fichier ou cliquer pour parcourir</div>
          <div class="file-drop__sub">Le fichier n'est jamais envoyé — seule l'empreinte numérique est transmise</div>
        </div>
        <div class="file-info" id="createFileInfo">
          <div class="file-info__icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <div class="file-info__body">
            <div class="file-info__name" id="createFileName"></div>
            <div class="file-info__size" id="createFileSize"></div>
            <div class="file-info__hash" id="createFileHash"></div>
          </div>
        </div>
      </div>
      <div class="field-group">
        <label>captureMethod</label>
        <input class="field-input" id="fCaptureMethod" value="api_upload"
               placeholder="api_upload" />
        <div class="field-hint">Ex. : api_upload, sdk_js, sdk_ios_camera, sdk_web</div>
      </div>
      <div class="field-group">
        <label>metadata (JSON)</label>
        <textarea class="field-input" id="fMetadata"
                  placeholder='{"claimId":"CLM-001"}'>{}</textarea>
      </div>
      <div class="editor-error" id="editorError">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span id="editorErrorMsg"></span>
      </div>
    `;

    document.getElementById('createFile').addEventListener('change', handleCreateFile);
    var fCaptureMethod = document.getElementById('fCaptureMethod');
    fCaptureMethod.addEventListener('change', updateCurl);
    fCaptureMethod.addEventListener('input', updateCurl);
    document.getElementById('fMetadata').addEventListener('change', updateCurl);

    setupFileDrop('createDrop', 'createFile', handleCreateFile);
  }

  else if (id === 'retrieve') {
    c.innerHTML = `
      <div class="field-group">
        <label>Identifiant de preuve</label>
        <input class="field-input" id="fProofId"
               placeholder="prf_01KKBWGFY2RX44R9M0JA41TF34" />
        <div class="field-hint">L'identifiant retourné lors de la création de la preuve.</div>
      </div>
      <div class="editor-error" id="editorError">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span id="editorErrorMsg"></span>
      </div>
    `;

    var fProofId = document.getElementById('fProofId');
    fProofId.addEventListener('change', updateCurl);
    fProofId.addEventListener('input', updateCurl);
  }

  else if (id === 'verify') {
    c.innerHTML = `
      <div class="field-group">
        <label>Vérifier par</label>
        <select class="field-input" id="fVerifyBy">
          <option value="proofId">Identifiant de preuve (lookup serveur)</option>
          <option value="receipt">Reçu JSON complet (hors-ligne)</option>
        </select>
      </div>
      <div id="verifyProofIdField" class="field-group">
        <label>Identifiant de preuve</label>
        <input class="field-input" id="fVerifyProofId"
               placeholder="prf_01KKBWGFY2RX44R9M0JA41TF34" />
      </div>
      <div id="verifyReceiptField" class="field-group" style="display:none">
        <label>Reçu JSON</label>
        <textarea class="field-input" id="fReceiptJson"
                  placeholder='{"schemaVersion":"1","proofId":"prf_...",...}'
                  style="min-height:140px"></textarea>
      </div>
      <div class="field-group">
        <label>Empreinte du fichier original (optionnel)</label>
        <input class="field-input" id="fVerifyHash"
               placeholder="sha256:e3b0c44298fc1c14…" />
        <div class="field-hint">Ou déposez le fichier original pour calculer automatiquement l'empreinte :</div>
        <div class="file-drop" style="margin-top:8px" id="verifyDrop">
          <input type="file" id="verifyFile" />
          <div class="file-drop__text">Déposer le fichier original</div>
        </div>
        <div class="file-info" id="verifyFileInfo">
          <div class="file-info__icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <div class="file-info__body">
            <div class="file-info__name" id="verifyFileName"></div>
            <div class="file-info__hash" id="verifyFileHash"></div>
          </div>
        </div>
      </div>
      <div class="editor-error" id="editorError">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span id="editorErrorMsg"></span>
      </div>
    `;

    document.getElementById('fVerifyBy').addEventListener('change', toggleVerifyMode);
    var fVerifyProofId = document.getElementById('fVerifyProofId');
    fVerifyProofId.addEventListener('change', updateCurl);
    fVerifyProofId.addEventListener('input', updateCurl);
    document.getElementById('fReceiptJson').addEventListener('change', updateCurl);
    var fVerifyHash = document.getElementById('fVerifyHash');
    fVerifyHash.addEventListener('change', updateCurl);
    fVerifyHash.addEventListener('input', updateCurl);
    document.getElementById('verifyFile').addEventListener('change', handleVerifyFile);

    setupFileDrop('verifyDrop', 'verifyFile', handleVerifyFile);
  }

  else if (id === 'publicKey') {
    c.innerHTML = `<div class="no-params">// Aucun paramètre requis. Endpoint public, sans authentification.</div>`;
  }
}

// ── Drag & drop sur les zones de fichier ──────────────────────────────────────
function setupFileDrop(dropId, inputId, handler) {
  const drop = document.getElementById(dropId);
  if (!drop) return;
  drop.addEventListener('dragover',  e => { e.preventDefault(); drop.classList.add('is-drag'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('is-drag'));
  drop.addEventListener('drop', e => {
    e.preventDefault();
    drop.classList.remove('is-drag');
    const file = e.dataTransfer.files[0];
    if (file) {
      const input = document.getElementById(inputId);
      // On ne peut pas affecter FileList directement — on passe par un DataTransfer
      try {
        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
      } catch(e) {}
      handler();
    }
  });
}

// ── Gestion des fichiers ──────────────────────────────────────────────────────
async function handleCreateFile() {
  const file = document.getElementById('createFile')?.files[0];
  if (!file) return;

  const hash = await computeHashFromFile(file);
  computedHash = hash;

  document.getElementById('createDrop').style.display = 'none';
  const info = document.getElementById('createFileInfo');
  info.classList.add('is-visible');
  document.getElementById('createFileName').textContent = file.name;
  document.getElementById('createFileSize').textContent = formatBytes(file.size);
  document.getElementById('createFileHash').textContent = hash;
  updateCurl();
}

async function handleVerifyFile() {
  const file = document.getElementById('verifyFile')?.files[0];
  if (!file) return;

  const hash = await computeHashFromFile(file);
  const inp = document.getElementById('fVerifyHash');
  if (inp) inp.value = hash;

  const info = document.getElementById('verifyFileInfo');
  if (info) {
    info.classList.add('is-visible');
    document.getElementById('verifyFileName').textContent = file.name;
    document.getElementById('verifyFileHash').textContent = hash;
  }
  updateCurl();
}

async function computeHashFromFile(file) {
  const buffer  = await file.arrayBuffer();
  const hashBuf = await crypto.subtle.digest('SHA-256', buffer);
  const hex     = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2,'0')).join('');
  return `sha256:${hex}`;
}

function toggleVerifyMode() {
  const mode = document.getElementById('fVerifyBy')?.value;
  document.getElementById('verifyProofIdField').style.display = mode === 'proofId' ? 'block' : 'none';
  document.getElementById('verifyReceiptField').style.display = mode === 'receipt'  ? 'block' : 'none';
  updateCurl();
}

// ── Génération de la commande curl ────────────────────────────────────────────
function updateCurl() {
  const base   = (document.getElementById('baseUrl')?.value || '').replace(/\/$/, '');
  const apiKey = document.getElementById('apiKey')?.value || 'evd_sk_dev_…';
  let   cmd    = '';

  if (currentEndpoint === 'create') {
    const hash   = computedHash || 'sha256:<votre-empreinte>';
    const method = document.getElementById('fCaptureMethod')?.value || 'api_upload';
    cmd = `curl -X POST ${base}/v1/proofs \\\n` +
          `  -H "Authorization: Bearer ${apiKey}" \\\n` +
          `  -H "Content-Type: application/json" \\\n` +
          `  -d '{"fileHash":"${hash}","captureMethod":"${method}"}'`;
  }
  else if (currentEndpoint === 'retrieve') {
    const id = document.getElementById('fProofId')?.value || 'prf_01KKBWGFY2RX44R9M0JA41TF34';
    cmd = `curl ${base}/v1/proofs/${id} \\\n  -H "Authorization: Bearer ${apiKey}"`;
  }
  else if (currentEndpoint === 'verify') {
    const mode = document.getElementById('fVerifyBy')?.value || 'proofId';
    const hash = document.getElementById('fVerifyHash')?.value;
    if (mode === 'proofId') {
      const id = document.getElementById('fVerifyProofId')?.value || 'prf_01KKBWGFY2RX44R9M0JA41TF34';
      cmd = `curl -X POST ${base}/v1/verify \\\n` +
            `  -H "Content-Type: application/json" \\\n` +
            `  -d '{"proofId":"${id}"${hash ? `,"fileHash":"${hash}"` : ''}}'`;
    } else {
      cmd = `curl -X POST ${base}/v1/verify \\\n` +
            `  -H "Content-Type: application/json" \\\n` +
            `  -d '{"receipt":{...}}'`;
    }
  }
  else if (currentEndpoint === 'publicKey') {
    cmd = `curl ${base}/v1/public-key`;
  }

  const curlContainer = document.getElementById('curlContainer');
  if (curlContainer) curlContainer.textContent = cmd;
}

// ── Onglets Paramètres / curl ─────────────────────────────────────────────────
function showTab(tab) {
  document.getElementById('tab-params').classList.toggle('is-active', tab === 'params');
  document.getElementById('tab-curl').classList.toggle('is-active',   tab === 'curl');

  if (tab === 'curl') {
    const fields = document.getElementById('editorFields');
    fields.innerHTML = `
      <div class="field-group">
        <label>Commande curl générée</label>
        <div class="curl-box">
          <div class="curl-code" id="curlContainer"></div>
          <button class="curl-copy" id="curlCopyBtn">Copier</button>
        </div>
      </div>
    `;
    document.getElementById('curlCopyBtn').addEventListener('click', copyCurl);
    updateCurl();
  } else {
    renderFields(currentEndpoint);
  }
}

function copyCurl() {
  const text = document.getElementById('curlContainer')?.textContent;
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('curlCopyBtn');
    if (btn) { btn.textContent = 'Copié !'; btn.classList.add('is-done'); setTimeout(() => { btn.textContent = 'Copier'; btn.classList.remove('is-done'); }, 1800); }
  });
}

// ── Envoi de la requête ───────────────────────────────────────────────────────
async function sendRequest() {
  const base   = (document.getElementById('baseUrl')?.value || '').replace(/\/$/, '');
  const apiKey = document.getElementById('apiKey')?.value || '';
  const ep     = ENDPOINTS[currentEndpoint];

  const sendBtn = document.getElementById('sendBtn');
  sendBtn.disabled = true;
  sendBtn.innerHTML = '<span class="spinner"></span> Envoi…';

  hideEditorError();
  clearResponse();
  const t0 = Date.now();

  try {
    let url, method, headers = {}, body;

    if (ep.auth && apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    if (currentEndpoint === 'create') {
      if (!computedHash) { showEditorError('Sélectionnez d\'abord un fichier.'); return; }
      url    = `${base}/v1/proofs`;
      method = 'POST';
      headers['Content-Type'] = 'application/json';
      const captureMethod = document.getElementById('fCaptureMethod')?.value || 'api_upload';
      let meta = {};
      try { meta = JSON.parse(document.getElementById('fMetadata')?.value || '{}'); } catch {}
      body = JSON.stringify({ fileHash: computedHash, captureMethod, metadata: JSON.stringify(meta) });
    }
    else if (currentEndpoint === 'retrieve') {
      const id = document.getElementById('fProofId')?.value?.trim();
      if (!id) { showEditorError('Saisissez un identifiant de preuve.'); return; }
      url    = `${base}/v1/proofs/${id}`;
      method = 'GET';
    }
    else if (currentEndpoint === 'verify') {
      url    = `${base}/v1/verify`;
      method = 'POST';
      headers['Content-Type'] = 'application/json';
      const mode    = document.getElementById('fVerifyBy')?.value;
      const bodyObj = {};
      if (mode === 'proofId') {
        const id = document.getElementById('fVerifyProofId')?.value?.trim();
        if (!id) { showEditorError('Saisissez un identifiant de preuve.'); return; }
        bodyObj.proofId = id;
      } else {
        const raw = document.getElementById('fReceiptJson')?.value?.trim();
        if (!raw) { showEditorError('Collez un objet JSON de reçu.'); return; }
        bodyObj.receipt = raw;
      }
      const hash = document.getElementById('fVerifyHash')?.value?.trim();
      if (hash) bodyObj.fileHash = hash;
      body = JSON.stringify(bodyObj);
    }
    else if (currentEndpoint === 'publicKey') {
      url    = `${base}/v1/public-key`;
      method = 'GET';
    }

    const resp    = await fetch(url, { method, headers, body });
    const elapsed = Date.now() - t0;
    const data    = await resp.json();

    renderResponse(resp.status, data, elapsed);

  } catch (err) {
    renderError(err.message, Date.now() - t0);
  } finally {
    sendBtn.disabled = false;
    sendBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg> Envoyer';
  }
}

// ── Rendu de la réponse ───────────────────────────────────────────────────────
function renderResponse(status, data, ms) {
  const badge = document.getElementById('statusBadge');
  badge.textContent = status;
  badge.className   = 'status-badge is-visible ' + (status < 300 ? 'status-2xx' : status < 500 ? 'status-4xx' : 'status-5xx');
  document.getElementById('responseTime').textContent = `${ms} ms`;
  document.getElementById('responseBody').innerHTML =
    `<pre class="json-output">${syntaxHighlight(JSON.stringify(data, null, 2))}</pre>`;
}

function renderError(msg, ms) {
  document.getElementById('statusBadge').className = 'status-badge';
  document.getElementById('responseTime').textContent = ms ? `${ms} ms` : '';
  document.getElementById('responseBody').innerHTML =
    `<pre class="json-output" style="color:var(--red)">// Erreur réseau\n${escHtml(msg)}</pre>`;
}

function clearResponse() {
  document.getElementById('statusBadge').className = 'status-badge';
  document.getElementById('responseTime').textContent = '';
  document.getElementById('responseBody').innerHTML = `
    <div class="response-empty">
      <svg class="response-empty__icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M20 14.66V20a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2h5.34"/>
        <polygon points="18 2 22 6 12 16 8 16 8 12 18 2"/>
      </svg>
      <div>En attente de réponse…</div>
      <div class="response-empty__sub">Configurez une requête et cliquez sur Envoyer</div>
    </div>
  `;
}

// ── Erreur dans l'éditeur ─────────────────────────────────────────────────────
function showEditorError(msg) {
  const el = document.getElementById('editorError');
  if (el) {
    document.getElementById('editorErrorMsg').textContent = msg;
    el.classList.add('is-visible');
  }
}
function hideEditorError() {
  const el = document.getElementById('editorError');
  if (el) el.classList.remove('is-visible');
}

// ── Coloration syntaxique JSON ────────────────────────────────────────────────
function syntaxHighlight(json) {
  return json
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, m => {
      let cls = 'j-num';
      if (/^"/.test(m)) cls = /:$/.test(m) ? 'j-key' : 'j-str';
      else if (/true|false/.test(m)) cls = 'j-bool';
      else if (/null/.test(m)) cls = 'j-null';
      return `<span class="${cls}">${m}</span>`;
    });
}

// ── Utilitaires ───────────────────────────────────────────────────────────────
function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function formatBytes(b) {
  if (b < 1024)        return `${b} o`;
  if (b < 1024 * 1024) return `${(b/1024).toFixed(1)} Ko`;
  return `${(b/1024/1024).toFixed(1)} Mo`;
}

// ── Initialisation ────────────────────────────────────────────────────────────

// Sidebar endpoint buttons
document.querySelectorAll('.endpoint-btn[data-endpoint]').forEach(function (btn) {
  btn.addEventListener('click', function () {
    selectEndpoint(btn.dataset.endpoint);
  });
});

// Send button
document.getElementById('sendBtn').addEventListener('click', sendRequest);

// Tab buttons
document.querySelectorAll('.tab[data-tab]').forEach(function (tab) {
  tab.addEventListener('click', function () {
    showTab(tab.dataset.tab);
  });
});

// Hamburger slide-in menu
(function () {
  var btn     = document.getElementById('topbarMenuBtn');
  var overlay = document.getElementById('apiNavOverlay');
  var closeBtn = document.getElementById('apiNavClose');
  if (!btn || !overlay) return;

  btn.addEventListener('click', function () {
    overlay.classList.add('is-open');
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', function () {
      overlay.classList.remove('is-open');
    });
  }

  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) overlay.classList.remove('is-open');
  });
})();

// Boot
selectEndpoint('create');
