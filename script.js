/* ============================================================
   MAÎTRE DOUNIA GOSCINIAK — script.js
   Navigation, animations, formulaire contact
   ============================================================ */

(function () {
  'use strict';

  /* ---- Navigation scroll behaviour ---- */
  const nav = document.getElementById('nav');
  function handleNavScroll() {
    if (!nav) return;
    if (window.scrollY > 20) {
      nav.classList.add('nav--scrolled');
    } else {
      nav.classList.remove('nav--scrolled');
    }
  }
  window.addEventListener('scroll', handleNavScroll, { passive: true });
  handleNavScroll();

  /* ---- Mobile burger ---- */
  const burger = document.getElementById('navBurger');
  const mobileMenu = document.getElementById('navMobile');
  if (burger && mobileMenu) {
    burger.addEventListener('click', function () {
      const open = mobileMenu.classList.toggle('open');
      burger.classList.toggle('active', open);
      burger.setAttribute('aria-expanded', String(open));
      document.body.style.overflow = open ? 'hidden' : '';
    });
    mobileMenu.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        mobileMenu.classList.remove('open');
        burger.classList.remove('active');
        burger.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
      });
    });
  }

  /* ---- Scroll fade-in animations ---- */
  const fadeEls = document.querySelectorAll('.fade-up');
  if (fadeEls.length && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    fadeEls.forEach(function (el) { observer.observe(el); });
  } else {
    fadeEls.forEach(function (el) { el.classList.add('visible'); });
  }

  /* ---- Contact form (contact.html) ---- */
  const form = document.getElementById('contactForm');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      let valid = true;

      const fields = [
        { id: 'nom', msg: 'Veuillez indiquer votre nom et prénom.' },
        { id: 'email', msg: 'Veuillez indiquer une adresse email valide.', type: 'email' },
        { id: 'objet', msg: 'Veuillez sélectionner un objet.' },
        { id: 'message', msg: 'Veuillez décrire votre situation.' },
      ];

      fields.forEach(function (f) {
        const input = document.getElementById(f.id);
        const error = document.getElementById(f.id + 'Error');
        if (!input) return;
        input.classList.remove('error');
        if (error) error.classList.remove('visible');

        let fieldValid = input.value.trim() !== '';
        if (fieldValid && f.type === 'email') {
          fieldValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value.trim());
        }
        if (!fieldValid) {
          input.classList.add('error');
          if (error) { error.textContent = f.msg; error.classList.add('visible'); }
          valid = false;
        }
      });

      if (!valid) return;

      const nom     = document.getElementById('nom').value.trim();
      const email   = document.getElementById('email').value.trim();
      const societe = document.getElementById('societe') ? document.getElementById('societe').value.trim() : '';
      const objet   = document.getElementById('objet').value;
      const message = document.getElementById('message').value.trim();

      const body = encodeURIComponent(
        'Nom : ' + nom + '\n' +
        (societe ? 'Société : ' + societe + '\n' : '') +
        'Email : ' + email + '\n' +
        'Objet : ' + objet + '\n\n' +
        message
      );

      window.location.href = 'mailto:contact@gosciniak-avocat.fr'
        + '?subject=' + encodeURIComponent('[Contact site] ' + objet)
        + '&body=' + body;

      const success = document.getElementById('formSuccess');
      if (success) {
        form.style.opacity = '0.4';
        form.style.pointerEvents = 'none';
        success.classList.add('visible');
        success.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }

  /* ---- Article page: load article from blog-data.js ---- */
  if (document.getElementById('articleContent')) {
    loadArticle();
  }

  function loadArticle() {
    const params = new URLSearchParams(window.location.search);
    const id = parseInt(params.get('id'), 10);

    if (!id || typeof articles === 'undefined') {
      document.getElementById('articleContent').innerHTML =
        '<p>Article introuvable.</p>';
      return;
    }

    const art = articles.find(function (a) { return a.id === id; });
    if (!art) {
      document.getElementById('articleContent').innerHTML =
        '<p>Article introuvable.</p>';
      return;
    }

    document.title = art.titre + ' — Maître Gosciniak, Avocat';
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.content = art.extrait.slice(0, 155);
    const metaCat = document.getElementById('articleCat');
    const metaDate = document.getElementById('articleDate');
    const artTitle = document.getElementById('articleTitle');
    const artBody  = document.getElementById('articleContent');

    if (metaCat)  metaCat.textContent  = art.categorie;
    if (metaDate) metaDate.textContent = art.date;
    if (artTitle) artTitle.textContent = art.titre;
    if (artBody)  artBody.innerHTML    = art.contenu;
  }

  /* ---- Actualités page: render articles ---- */
  if (document.getElementById('blogGrid')) {
    renderBlog();
  }

  function renderBlog() {
    const grid = document.getElementById('blogGrid');
    if (!grid || typeof articles === 'undefined') return;

    grid.innerHTML = articles.map(function (art) {
      const href = 'article.html?id=' + art.id;
      return '<a href="' + href + '" class="article-card fade-up">'
        + '<div class="article-card__body">'
        + '<div class="article-card__meta">'
        + '<span class="article-card__cat">' + art.categorie + '</span>'
        + '<span class="article-card__date">' + art.date + '</span>'
        + '</div>'
        + '<h3>' + art.titre + '</h3>'
        + '<p>' + art.extrait + '</p>'
        + '</div>'
        + '</a>';
    }).join('');

    /* re-trigger observer for dynamically inserted elements */
    const newFades = grid.querySelectorAll('.fade-up');
    if ('IntersectionObserver' in window) {
      const obs = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); }
        });
      }, { threshold: 0.1 });
      newFades.forEach(function (el) { obs.observe(el); });
    } else {
      newFades.forEach(function (el) { el.classList.add('visible'); });
    }
  }

})();
