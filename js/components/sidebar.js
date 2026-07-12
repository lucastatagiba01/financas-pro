// ============================================
// FINANÇAS PRO — Sidebar Navigation
// ============================================

import { icons } from '../utils.js';
import { getSession, logout } from '../auth.js';
import { navigate, getCurrentRoute } from '../router.js';
import { getSelectedMode, clearSelectedMode } from '../storage.js';

const NAV_SECTIONS_FINANCIAL = [
  {
    title: 'Visão Geral',
    items: [
      { path: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
    ],
  },
  {
    title: 'Finanças',
    items: [
      { path: '/transactions', label: 'Movimentações', icon: 'transactions' },
      { path: '/analysis',     label: 'Análise',       icon: 'analysis'      },
      { path: '/reports',      label: 'Relatórios',    icon: 'reports'       },
      { path: '/fixed',        label: 'Gastos Fixos',  icon: 'fixed'         },
    ],
  },
  {
    title: 'Planejamento',
    items: [
      { path: '/planning', label: 'Planejamento Financeiro', icon: 'reports'     },
      { path: '/goals',    label: 'Metas',                   icon: 'trendingUp'  },
    ],
  },
  {
    title: 'Configurações',
    items: [
      { path: '/categories', label: 'Categorias', icon: 'categories' },
    ],
  },
];

const NAV_SECTIONS_INVESTMENTS = [
  {
    title: 'Visão Geral',
    items: [
      { path: '/investments', label: 'Minha Carteira', icon: 'wallet', tab: 'carteira' },
    ],
  },
  {
    title: 'Ativos',
    items: [
      { path: '/investments', label: 'Renda Fixa',     icon: 'balance',    tab: 'rf',     sub: true },
      { path: '/investments', label: 'Tesouro Direto', icon: 'balance',    tab: 'td',     sub: true },
      { path: '/investments', label: 'Renda Variável', icon: 'trendingUp', tab: 'rv',     sub: true },
      { path: '/investments', label: 'Fundos',         icon: 'balance',    tab: 'fundos', sub: true },
    ],
  },
  {
    title: 'Ações',
    items: [
      { path: '/investments', label: 'Adicionar', icon: 'plus', tab: 'formulario', sub: true },
    ],
  },
];

export function renderSidebar() {
  const user = getSession();
  const currentPath = getCurrentRoute();
  const selectedMode = getSelectedMode();
  const initials = user ? user.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() : '??';
  const modeLabel = selectedMode === 'INVESTMENTS' ? 'Investimentos' : 'Financeiro';
  const otherModeLabel = selectedMode === 'INVESTMENTS' ? 'Financeiro' : 'Investimentos';

  const renderNavItem = (item) => {
    if (item.tab) {
      const activeTab = sessionStorage.getItem('invActiveTab') || 'carteira';
      const isActive  = currentPath === item.path && activeTab === item.tab;
      return `
        <button class="nav-item ${isActive ? 'active' : ''} ${item.sub ? 'nav-item-sub' : ''}" data-inv-tab="${item.tab}">
          ${icons[item.icon]}
          <span>${item.label}</span>
        </button>`;
    }
    return `
      <a class="nav-item ${currentPath === item.path ? 'active' : ''}" data-route="${item.path}" href="#${item.path}">
        ${icons[item.icon]}
        <span>${item.label}</span>
      </a>`;
  };

  const activeTab = sessionStorage.getItem('invActiveTab') || 'carteira';

  // Check if a section has the active route/tab
  const sectionHasActive = (section) =>
    section.items.some(i => i.path ? i.path === currentPath : i.tab === activeTab);

  const getSectionOpen = (section) => {
    const key = `sidebar-section-${section.title}`;
    const stored = sessionStorage.getItem(key);
    if (stored !== null) return stored === 'true';
    return true; // default open
  };

  const chevron = (open) => `
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style="transition:transform .25s;transform:rotate(${open ? '0' : '-90'}deg);flex-shrink:0;">
      <path d="M2 4l4 4 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;

  const renderCollapsibleSections = (sections) =>
    sections.map(section => {
      const open = getSectionOpen(section) || sectionHasActive(section);
      const key  = section.title;
      return `
        <div class="sidebar-section sidebar-collapsible" data-section-key="${key}">
          <button class="sidebar-section-toggle" data-section-key="${key}"
            style="display:flex;align-items:center;justify-content:space-between;width:100%;background:none;border:none;cursor:pointer;padding:0;margin-bottom:${open ? 'var(--space-1)' : '0'};">
            <span class="sidebar-section-title" style="margin-bottom:0;">${key}</span>
            <span class="sidebar-chevron" data-section-key="${key}">${chevron(open)}</span>
          </button>
          <div class="sidebar-section-items" data-section-key="${key}"
            style="overflow:hidden;transition:max-height .25s ease;max-height:${open ? '500px' : '0px'};">
            ${section.items.map(renderNavItem).join('')}
          </div>
        </div>`;
    }).join('');

  const navContent = selectedMode === 'INVESTMENTS'
    ? renderCollapsibleSections(NAV_SECTIONS_INVESTMENTS)
    : renderCollapsibleSections(NAV_SECTIONS_FINANCIAL);

  return `
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-header">
        <div class="sidebar-logo">F</div>
        <div class="sidebar-brand">Finanças<span>Pro</span></div>
        <div class="sidebar-mode-badge" title="Modo atual">${modeLabel}</div>
      </div>

      <nav class="sidebar-nav">
        ${navContent}

        <div class="sidebar-section">
          <div class="sidebar-section-title">Modo</div>
          <button class="nav-item mode-switch" id="btn-switch-mode" title="Trocar para ${otherModeLabel}">
            ${selectedMode === 'INVESTMENTS' ? icons.wallet : icons.balance}
            <span>Ir para ${otherModeLabel}</span>
          </button>
        </div>
      </nav>

      <div class="sidebar-footer">
        <div class="sidebar-user" id="sidebar-user">
          <div class="sidebar-avatar">${initials}</div>
          <div class="sidebar-user-info">
            <div class="sidebar-user-name">${user ? user.name : ''}</div>
            <div class="sidebar-user-email">${user ? user.email : ''}</div>
          </div>
          <button class="sidebar-logout" id="btn-logout" title="Sair">
            ${icons.logout}
          </button>
        </div>
      </div>
    </aside>
    <div class="sidebar-overlay" id="sidebar-overlay"></div>
  `;
}

export function bindSidebarEvents() {
  // Logout
  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      logout();
      navigate('/login');
    });
  }

  // Switch mode
  const switchModeBtn = document.getElementById('btn-switch-mode');
  if (switchModeBtn) {
    switchModeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const currentMode = getSelectedMode();
      const newMode = currentMode === 'INVESTMENTS' ? 'FINANCIAL' : 'INVESTMENTS';
      import('../storage.js').then(({ setSelectedMode }) => {
        setSelectedMode(newMode);
        navigate(newMode === 'FINANCIAL' ? '/dashboard' : '/investments');
      });
    });
  }

  // Mobile overlay close
  const overlay = document.getElementById('sidebar-overlay');
  if (overlay) {
    overlay.addEventListener('click', closeSidebar);
  }

  // Collapsible section toggles
  document.querySelectorAll('.sidebar-section-toggle').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const key     = btn.dataset.sectionKey;
      const items   = document.querySelector(`.sidebar-section-items[data-section-key="${key}"]`);
      const chevron = document.querySelector(`.sidebar-chevron[data-section-key="${key}"] svg`);
      const isOpen  = items.style.maxHeight !== '0px';
      const nowOpen = !isOpen;

      items.style.maxHeight  = nowOpen ? '500px' : '0px';
      btn.style.marginBottom = nowOpen ? 'var(--space-1)' : '0';
      if (chevron) chevron.style.transform = `rotate(${nowOpen ? '0' : '-90'}deg)`;
      sessionStorage.setItem(`sidebar-section-${key}`, String(nowOpen));
    });
  });

  // Investment sub-tab clicks
  document.querySelectorAll('[data-inv-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.invTab;
      sessionStorage.setItem('invActiveTab', tab);
      document.querySelectorAll('[data-inv-tab]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.dispatchEvent(new CustomEvent('inv-tab-change', { detail: { tab } }));
      closeSidebar();
    });
  });

  // Nav item click (close mobile sidebar)
  document.querySelectorAll('.nav-item:not([data-inv-tab])').forEach(item => {
    item.addEventListener('click', () => {
      closeSidebar();
    });
  });
}

export function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (sidebar) {
    sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('active');
  }
}

export function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (sidebar) sidebar.classList.remove('open');
  if (overlay) overlay.classList.remove('active');
}
