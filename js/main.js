// ============================================
// FINANÇAS PRO — App Bootstrap
// ============================================

import { initRouter, registerRoute, setBeforeEach, navigate } from './router.js';
import { isAuthenticated } from './auth.js';
import { seedDefaults, launchFixedExpensesForMonth, getSelectedMode } from './storage.js';
import { renderDashboard } from './pages/dashboard.js';
import { renderTransactions } from './pages/transactions.js';
import { renderLogin } from './pages/login.js';
import { renderAnalysis } from './pages/analysis.js';
import { renderReports } from './pages/reports.js';
import { renderFixed } from './pages/fixed.js';
import { renderCategories } from './pages/categories.js';
import { renderMenu } from './pages/menu.js';
import { renderInvestments } from './pages/investments.js';
import { renderServices } from './pages/services.js';

// ── Auth Guard ──
setBeforeEach((path) => {
  const publicRoutes = ['/login'];
  if (!isAuthenticated() && !publicRoutes.includes(path)) {
    return '/login';
  }
  if (isAuthenticated() && path === '/login') {
    const selectedMode = getSelectedMode();
    return selectedMode ? (selectedMode === 'FINANCIAL' ? '/dashboard' : '/investments') : '/menu';
  }
  return path;
});

// ── Routes ──
registerRoute('/login',        renderLogin);
registerRoute('/menu',         renderMenu);
registerRoute('/dashboard',    renderDashboard);
registerRoute('/investments',  renderInvestments);
registerRoute('/transactions', renderTransactions);
registerRoute('/analysis',     renderAnalysis);
registerRoute('/reports',      renderReports);
registerRoute('/fixed',        renderFixed);
registerRoute('/categories',   renderCategories);
registerRoute('/services',     renderServices);

// ── Init ──
seedDefaults();

// Auto-launch fixed expenses when user is logged in
if (isAuthenticated()) {
  launchFixedExpensesForMonth();
}

initRouter();
