// ============================================
// FINANÇAS PRO — Mode Selection Menu
// ============================================

import { icons } from '../utils.js';
import { setSelectedMode } from '../storage.js';
import { navigate } from '../router.js';
import { getSession } from '../auth.js';

export function renderMenu() {
  const app = document.getElementById('app');
  const user = getSession();
  const userName = user?.name || 'Usuário';

  app.innerHTML = `
    <div class="menu-container">
      <div class="menu-header">
        <h1>Bem-vindo, ${userName}!</h1>
        <p>Escolha como deseja começar</p>
      </div>

      <div class="menu-content">
        <!-- Financeiro Card -->
        <div class="mode-card mode-card-financial" id="card-financial">
          <div class="mode-card-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect width="20" height="14" x="2" y="5" rx="2"/>
              <line x1="2" x2="22" y1="10" y2="10"/>
            </svg>
          </div>
          <h2>Controle Financeiro</h2>
          <p>Gerencie suas receitas, despesas, despesas fixas e acompanhe seu saldo</p>
          <div class="mode-card-features">
            <span class="feature">📊 Dashboard</span>
            <span class="feature">💰 Transações</span>
            <span class="feature">📈 Análise</span>
            <span class="feature">📋 Relatórios</span>
          </div>
          <button class="btn btn-primary btn-large" onclick="selectMode('FINANCIAL')">
            Acessar Financeiro
          </button>
        </div>

        <!-- Investimentos Card -->
        <div class="mode-card mode-card-investments" id="card-investments">
          <div class="mode-card-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
              <polyline points="16 7 22 7 22 13"/>
            </svg>
          </div>
          <h2>Investimentos</h2>
          <p>Acompanhe seus investimentos, carteira e resultados (em desenvolvimento)</p>
          <div class="mode-card-features">
            <span class="feature">📈 Carteira</span>
            <span class="feature">💵 Ativos</span>
            <span class="feature">📊 Performance</span>
            <span class="feature">🎯 Metas</span>
          </div>
          <button class="btn btn-secondary btn-large" onclick="selectMode('INVESTMENTS')">
            Acessar Investimentos
          </button>
        </div>
      </div>

      <div class="menu-footer">
        <button class="btn btn-ghost" onclick="logout()">Sair da Conta</button>
      </div>
    </div>
  `;

  // Bind global functions
  window.selectMode = selectMode;
  window.logout = logoutUser;
}

function selectMode(mode) {
  setSelectedMode(mode);

  if (mode === 'FINANCIAL') {
    navigate('/dashboard');
  } else if (mode === 'INVESTMENTS') {
    navigate('/investments');
  }
}

function logoutUser() {
  if (confirm('Tem certeza que deseja sair?')) {
    import('../auth.js').then(({ logout }) => {
      logout();
      navigate('/login');
    });
  }
}
