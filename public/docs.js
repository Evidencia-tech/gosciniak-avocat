'use strict';

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

if (typeof hljs !== 'undefined') {
  hljs.highlightAll();
}
