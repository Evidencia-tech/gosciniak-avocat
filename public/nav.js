/* nav.js — hamburger menu toggle for all ev-header pages */
(function () {
  var hamburger = document.querySelector('.ev-hamburger');
  var nav = document.getElementById('mobileNav');
  if (!hamburger || !nav) return;

  var closeBtn = nav.querySelector('.ev-mobile-nav__close');

  hamburger.addEventListener('click', function () {
    nav.classList.add('is-open');
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', function () {
      nav.classList.remove('is-open');
    });
  }

  // Close when clicking the overlay background
  nav.addEventListener('click', function (e) {
    if (e.target === nav) nav.classList.remove('is-open');
  });
})();
