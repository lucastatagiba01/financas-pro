// ============================================
// FINANÇAS PRO — Sidebar Navigation
// ============================================

import { icons } from '../utils.js';
import { getSession, logout } from '../auth.js';
import { navigate, getCurrentRoute } from '../router.js';
import { getSelectedMode, clearSelectedMode } from '../storage.js';

const NAV_ITEMS_FINANCIAL = [
  { path: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { path: '/transactions', label: 'Movimentações', icon: 'transactions' },
  { path: '/analysis', label: 'Análise', icon: 'analysis' },
  { path: '/reports', label: 'Relatórios', icon: 'reports' },
  { path: '/fixed', label: 'Gastos Fixos', icon: 'fixed' },
  { path: '/categories', label: 'Categorias', icon: 'categories' },
];

const NAV_ITEMS_INVESTMENTS = [
  { path: '/investments', label: 'Minha Carteira', icon: 'wallet',      tab: 'carteira'   },
  { path: '/investments', label: 'Renda Fixa',     icon: 'balance',     tab: 'rf',         sub: true },
  { path: '/investments', label: 'Renda Variável', icon: 'trendingUp',  tab: 'rv',         sub: true },
  { path: '/investments', label: 'Adicionar',      icon: 'plus',        tab: 'formulario', sub: true },
];

export function renderSidebar() {
  const user = getSession();
  const currentPath = getCurrentRoute();
  const selectedMode = getSelectedMode();
  const navItems = selectedMode === 'INVESTMENTS' ? NAV_ITEMS_INVESTMENTS : NAV_ITEMS_FINANCIAL;
  const initials = user ? user.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() : '??';
  const modeLabel = selectedMode === 'INVESTMENTS' ? 'Investimentos' : 'Financeiro';
  const otherMode = selectedMode === 'INVESTMENTS' ? 'FINANCIAL' : 'INVESTMENTS';
  const otherModeLabel = selectedMode === 'INVESTMENTS' ? 'Financeiro' : 'Investimentos';

  return `
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-header">
        <div class="sidebar-logo">F</div>
        <div class="sidebar-brand">Finanças<span>Pro</span></div>
        <div class="sidebar-mode-badge" title="Modo atual">${modeLabel}</div>
      </div>

      <nav class="sidebar-nav">
        <div class="sidebar-section">
          <div class="sidebar-section-title">Menu</div>
          ${navItems.map(item => {
            if (item.tab) {
              const activeTab = sessionStorage.getItem('invActiveTab') || 'carteira';
              const isActive = currentPath === item.path && activeTab === item.tab;
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
          }).join('')}
        </div>

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
