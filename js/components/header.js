// ============================================
// FINANÇAS PRO — Header Component
// ============================================

import { icons } from '../utils.js';
import { toggleSidebar } from './sidebar.js';
import { getSelectedMode } from '../storage.js';
import { navigate } from '../router.js';

export function renderHeader(title, subtitle = '') {
  const selectedMode = getSelectedMode();

  const modePill = `
    <div style="display:flex;background:var(--color-gray-100);border-radius:8px;padding:3px;gap:2px;">
      <button id="hdr-mode-financial"
        style="padding:5px 14px;border-radius:6px;border:none;cursor:pointer;font-size:12px;font-weight:600;transition:all .2s;
          background:${selectedMode === 'FINANCIAL' ? 'white' : 'transparent'};
          color:${selectedMode === 'FINANCIAL' ? 'var(--color-gray-800)' : 'var(--color-gray-400)'};
          box-shadow:${selectedMode === 'FINANCIAL' ? '0 1px 3px rgba(0,0,0,.1)' : 'none'};">
        Financeiro
      </button>
      <button id="hdr-mode-investments"
        style="padding:5px 14px;border-radius:6px;border:none;cursor:pointer;font-size:12px;font-weight:600;transition:all .2s;
          background:${selectedMode === 'INVESTMENTS' ? 'white' : 'transparent'};
          color:${selectedMode === 'INVESTMENTS' ? 'var(--color-gray-800)' : 'var(--color-gray-400)'};
          box-shadow:${selectedMode === 'INVESTMENTS' ? '0 1px 3px rgba(0,0,0,.1)' : 'none'};">
        Investimentos
      </button>
    </div>
  `;

  return `
    <header class="header" id="header">
      <div class="header-left">
        <button class="mobile-toggle" id="mobile-toggle">
          ${icons.menu}
        </button>
        <div>
          <h1 class="header-title">${title}</h1>
          ${subtitle ? `<span class="header-subtitle">${subtitle}</span>` : ''}
        </div>
      </div>
      <div class="header-right" id="header-right" style="display:flex;align-items:center;gap:var(--space-3);">
        ${modePill}
      </div>
    </header>
  `;
}

export function bindHeaderEvents() {
  const toggle = document.getElementById('mobile-toggle');
  if (toggle) toggle.addEventListener('click', toggleSidebar);

  const switchMode = (newMode) => {
    import('../storage.js').then(({ setSelectedMode }) => {
      setSelectedMode(newMode);
      navigate(newMode === 'FINANCIAL' ? '/dashboard' : '/investments');
    });
  };

  document.getElementById('hdr-mode-financial')?.addEventListener('click', () => {
    if (getSelectedMode() !== 'FINANCIAL') switchMode('FINANCIAL');
  });
  document.getElementById('hdr-mode-investments')?.addEventListener('click', () => {
    if (getSelectedMode() !== 'INVESTMENTS') switchMode('INVESTMENTS');
  });
}
