'use strict';

// ── Language toggle ──────────────────────────────────────────────────────────

var LANG_KEY = 'ev_docs_lang';

function setLang(lang) {
  document.querySelectorAll('[data-fr][data-en]').forEach(function (el) {
    el.innerHTML = el.getAttribute('data-' + lang);
  });

  // Update toggle buttons
  document.querySelectorAll('.lang-toggle__btn').forEach(function (btn) {
    btn.classList.toggle('is-active', btn.getAttribute('data-lang') === lang);
  });

  // Update html lang attribute
  document.documentElement.lang = lang;

  // Persist preference
  try { localStorage.setItem(LANG_KEY, lang); } catch (e) { /* private mode */ }
}

// Bind toggle clicks
var toggle = document.getElementById('langToggle');
if (toggle) {
  toggle.addEventListener('click', function (e) {
    var btn = e.target.closest('.lang-toggle__btn');
    if (!btn) return;
    var lang = btn.getAttribute('data-lang');
    if (lang) setLang(lang);
  });
}

// Restore saved preference (default: fr)
var saved = null;
try { saved = localStorage.getItem(LANG_KEY); } catch (e) { /* private mode */ }
if (saved === 'en') setLang('en');

// ── Code tabs ────────────────────────────────────────────────────────────────

document.querySelectorAll('.code-tabs').forEach(function (tabs) {
  var btns   = tabs.querySelectorAll('.code-tab-btn');
  var panels = tabs.querySelectorAll('.code-tab-panel');

  btns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var target = btn.getAttribute('data-tab');

      btns.forEach(function (b) { b.classList.remove('is-active'); });
      panels.forEach(function (p) { p.classList.remove('is-active'); });

      btn.classList.add('is-active');
      var panel = tabs.querySelector('#tab-' + target);
      if (panel) panel.classList.add('is-active');
    });
  });
});

// ── Syntax highlighting ──────────────────────────────────────────────────────
// Target only pre>code blocks to avoid interfering with headings or other text.

function initHighlight() {
  if (typeof hljs === 'undefined') return;
  document.querySelectorAll('pre code').forEach(function (block) {
    hljs.highlightElement(block);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initHighlight);
} else {
  initHighlight();
}
