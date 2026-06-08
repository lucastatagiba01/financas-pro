// ============================================
// FINANÇAS PRO — Header Component
// ============================================

import { icons } from '../utils.js';
import { toggleSidebar } from './sidebar.js';

export function renderHeader(title, subtitle = '') {
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
      <div class="header-right" id="header-right">
        <!-- Filter or actions rendered here by pages -->
      </div>
    </header>
  `;
}

export function bindHeaderEvents() {
  const toggle = document.getElementById('mobile-toggle');
  if (toggle) {
    toggle.addEventListener('click', toggleSidebar);
  }
}
