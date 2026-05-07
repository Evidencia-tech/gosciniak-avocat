'use strict';

const nameInput    = document.getElementById('nameInput');
const emailInput   = document.getElementById('emailInput');
const orgInput     = document.getElementById('orgInput');
const useCaseInput = document.getElementById('useCaseInput');
const submitBtn    = document.getElementById('submitBtn');
const formError    = document.getElementById('formError');
const formErrorMsg = document.getElementById('formErrorMsg');
const formCard     = document.getElementById('formCard');
const successBlock = document.getElementById('successBlock');

function showError(msg) {
  formErrorMsg.textContent = msg;
  formError.style.display  = 'flex';
}

function hideError() {
  formError.style.display = 'none';
}

async function handleSubmit() {
  hideError();

  const name     = nameInput.value.trim();
  const email    = emailInput.value.trim();
  const org      = orgInput.value.trim();
  const use_case = useCaseInput.value.trim();

  if (!name)     return showError('Veuillez indiquer votre nom.');
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return showError('Veuillez entrer une adresse email valide.');
  if (!use_case) return showError("Veuillez décrire votre cas d'usage.");

  submitBtn.disabled    = true;
  submitBtn.textContent = 'Envoi…';

  try {
    const res = await fetch('/v1/access-requests', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name, email, organization: org || undefined, use_case }),
    });

    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      const msg = body?.error?.message || "Une erreur s'est produite. Réessayez.";
      showError(msg);
      submitBtn.disabled    = false;
      submitBtn.textContent = 'Envoyer la demande →';
      return;
    }

    formCard.style.display    = 'none';
    successBlock.className    = 'acces-success is-visible';

  } catch {
    showError('Impossible de contacter le serveur. Vérifiez votre connexion.');
    submitBtn.disabled    = false;
    submitBtn.textContent = 'Envoyer la demande →';
  }
}

submitBtn.addEventListener('click', handleSubmit);

[nameInput, emailInput, orgInput, useCaseInput].forEach(el => {
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter' && el !== useCaseInput) handleSubmit();
  });
});
