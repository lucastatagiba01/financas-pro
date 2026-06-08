// ============================================
// FINANÇAS PRO — Modal Component
// ============================================

import { icons } from '../utils.js';

let backdropEl = null;
let modalEl = null;

function ensureElements() {
  if (!backdropEl) {
    backdropEl = document.createElement('div');
    backdropEl.className = 'modal-backdrop';
    backdropEl.id = 'modal-backdrop';
    backdropEl.addEventListener('click', closeModal);
    document.body.appendChild(backdropEl);
  }
  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.className = 'modal';
    modalEl.id = 'modal';
    document.body.appendChild(modalEl);
  }
}

export function openModal(title, bodyHtml, footerHtml = '') {
  ensureElements();

  modalEl.innerHTML = `
    <div class="modal-header">
      <h3>${title}</h3>
      <button class="modal-close" id="modal-close-btn">${icons.close}</button>
    </div>
    <div class="modal-body">
      ${bodyHtml}
    </div>
    ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ''}
  `;

  modalEl.querySelector('#modal-close-btn').addEventListener('click', closeModal);

  // Show
  requestAnimationFrame(() => {
    backdropEl.classList.add('active');
    modalEl.classList.add('active');
  });

  // Escape key
  document.addEventListener('keydown', handleEscape);
}

export function closeModal() {
  if (backdropEl) backdropEl.classList.remove('active');
  if (modalEl) modalEl.classList.remove('active');
  document.removeEventListener('keydown', handleEscape);
}

function handleEscape(e) {
  if (e.key === 'Escape') closeModal();
}

export function getModalBody() {
  return modalEl ? modalEl.querySelector('.modal-body') : null;
}
