// ============================================
// FINANÇAS PRO — Analysis Page
// ============================================

import { icons, formatCurrency, getCategoryColor } from '../utils.js';
import { getFilteredTransactions, getCategories, getCategoryById } from '../storage.js';
import { getFilterDates, renderFilter, onFilterChange } from '../components/filters.js';
import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js';
import { renderHeader, bindHeaderEvents } from '../components/header.js';
import { createDoughnutChart, createBarChart, destroyAllCharts } from '../components/charts.js';

export function renderAnalysis() {
  destroyAllCharts();
  const app = document.getElementById('app');

  app.innerHTML = `
    <div class="app-shell">
      ${renderSidebar()}
      <div class="app-main">
        ${renderHeader('Análise')}
        <div class="content">
          <div id="filter-container" style="margin-bottom: var(--space-5);"></div>
          <div id="analysis-content"></div>
        </div>
      </div>
    </div>
  `;

  bindSidebarEvents();
  bindHeaderEvents();
  renderFilter('filter-container');
  renderAnalysisContent(getFilterDates());

  onFilterChange((_, newDates) => {
    renderAnalysisContent(newDates);
  });
}

function renderAnalysisContent(dates) {
  const container = document.getElementById('analysis-content');
  if (!container) return;

  const transactions = getFilteredTransactions(dates.start, dates.end);
  const categories = getCategories();

  const income = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expenses = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  // Category breakdown for expenses
  const catMap = {};
  transactions.filter(t => t.type === 'expense').forEach(t => {
    catMap[t.categoryId] = (catMap[t.categoryId] || 0) + t.amount;
  });

  // Income categories
  const incomeCatMap = {};
  transactions.filter(t => t.type === 'income').forEach(t => {
    incomeCatMap[t.categoryId] = (incomeCatMap[t.categoryId] || 0) + t.amount;
  });

  const catEntries = Object.entries(catMap)
    .sort((a, b) => b[1] - a[1])
    .map(([id, amount], i) => {
      const cat = getCategoryById(id);
      return { id, amount, name: cat?.name || 'Outros', icon: cat?.icon || '📦', color: cat?.color || getCategoryColor(i), pct: expenses > 0 ? (amount / expenses * 100) : 0 };
    });

  const incomeEntries = Object.entries(incomeCatMap)
    .sort((a, b) => b[1] - a[1])
    .map(([id, amount], i) => {
      const cat = getCategoryById(id);
      return { id, amount, name: cat?.name || 'Outros', icon: cat?.icon || '📦', color: cat?.color || getCategoryColor(i) };
    });

  // Fixed vs Variable
  const fixedAmt = transactions.filter(t => t.type === 'expense' && t.nature === 'fixed').reduce((s, t) => s + t.amount, 0);
  const variableAmt = transactions.filter(t => t.type === 'expense' && t.nature === 'variable').reduce((s, t) => s + t.amount, 0);

  container.innerHTML = `
    <!-- Summary Row -->
    <div class="analysis-summary animate-fade-in-up">
      <div class="summary-stat">
        <div class="summary-stat-icon" style="background: var(--color-success-100); color: var(--color-success-600);">
          ${icons.trendingUp}
        </div>
        <div>
          <div class="summary-stat-label">Receitas</div>
          <div class="summary-stat-value income">${formatCurrency(income)}</div>
        </div>
      </div>
      <div class="summary-stat">
        <div class="summary-stat-icon" style="background: var(--color-danger-100); color: var(--color-danger-600);">
          ${icons.trendingDown}
        </div>
        <div>
          <div class="summary-stat-label">Despesas</div>
          <div class="summary-stat-value expense">${formatCurrency(expenses)}</div>
        </div>
      </div>
      <div class="summary-stat">
        <div class="summary-stat-icon" style="background: var(--color-blue-100); color: var(--color-blue-600);">
          ${icons.wallet}
        </div>
        <div>
          <div class="summary-stat-label">Saldo</div>
          <div class="summary-stat-value" style="color: ${income - expenses >= 0 ? 'var(--color-success-600)' : 'var(--color-danger-600)'}">
            ${formatCurrency(income - expenses)}
          </div>
        </div>
      </div>
      <div class="summary-stat">
        <div class="summary-stat-icon" style="background: var(--color-purple-100); color: var(--color-purple-600);">
          ${icons.tag}
        </div>
        <div>
          <div class="summary-stat-label">Taxa de poupança</div>
          <div class="summary-stat-value">${income > 0 ? (((income - expenses) / income) * 100).toFixed(1) : '0.0'}%</div>
        </div>
      </div>
    </div>

    <!-- Charts Row -->
    <div class="analysis-charts animate-fade-in-up stagger-1">
      <!-- Donut: Expense Categories -->
      <div class="card">
        <div class="card-header">
          <h3>Despesas por Categoria</h3>
        </div>
        ${catEntries.length > 0 ? `
          <div class="chart-container" style="max-height: 260px;">
            <canvas id="analysis-donut-chart"></canvas>
          </div>
        ` : `
          <div class="empty-state" style="padding: var(--space-8);">
            ${icons.emptyBox}
            <p style="margin-top: var(--space-3);">Sem despesas no período</p>
          </div>
        `}
      </div>

      <!-- Fixed vs Variable Donut -->
      <div class="card">
        <div class="card-header">
          <h3>Fixo × Variável</h3>
        </div>
        ${expenses > 0 ? `
          <div class="chart-container" style="max-height: 260px;">
            <canvas id="analysis-nature-chart"></canvas>
          </div>
          <div class="nature-legend">
            <div class="nature-item">
              <span class="nature-dot" style="background: var(--color-blue-500);"></span>
              <span>Fixo</span>
              <strong>${formatCurrency(fixedAmt)}</strong>
            </div>
            <div class="nature-item">
              <span class="nature-dot" style="background: var(--color-purple-500);"></span>
              <span>Variável</span>
              <strong>${formatCurrency(variableAmt)}</strong>
            </div>
          </div>
        ` : `
          <div class="empty-state" style="padding: var(--space-8);">
            ${icons.emptyBox}
            <p style="margin-top: var(--space-3);">Sem despesas no período</p>
          </div>
        `}
      </div>
    </div>

    <!-- Category Bar + Breakdown -->
    <div class="analysis-bottom animate-fade-in-up stagger-2">
      <!-- Expense Breakdown -->
      <div class="card">
        <div class="card-header">
          <h3>Detalhamento de Gastos</h3>
        </div>
        ${catEntries.length > 0 ? `
          <div class="category-breakdown">
            ${catEntries.map(cat => `
              <div class="category-row">
                <div class="category-row-left">
                  <span class="cat-emoji">${cat.icon}</span>
                  <span class="cat-name">${cat.name}</span>
                </div>
                <div class="category-row-bar">
                  <div class="cat-bar-track">
                    <div class="cat-bar-fill" style="width: ${cat.pct}%; background: ${cat.color};"></div>
                  </div>
                  <span class="cat-pct">${cat.pct.toFixed(1)}%</span>
                </div>
                <span class="cat-amount">${formatCurrency(cat.amount)}</span>
              </div>
            `).join('')}
          </div>
        ` : `
          <div class="empty-state" style="padding: var(--space-8);">
            ${icons.emptyBox}
            <p style="margin-top: var(--space-3);">Nenhuma despesa no período</p>
          </div>
        `}
      </div>

      <!-- Income Breakdown -->
      <div class="card">
        <div class="card-header">
          <h3>Fontes de Receita</h3>
        </div>
        ${incomeEntries.length > 0 ? `
          <div class="category-breakdown">
            ${incomeEntries.map((cat, i) => `
              <div class="category-row">
                <div class="category-row-left">
                  <span class="cat-emoji">${cat.icon}</span>
                  <span class="cat-name">${cat.name}</span>
                </div>
                <div class="category-row-bar">
                  <div class="cat-bar-track">
                    <div class="cat-bar-fill" style="width: ${income > 0 ? (cat.amount / income * 100) : 0}%; background: ${cat.color};"></div>
                  </div>
                  <span class="cat-pct">${income > 0 ? (cat.amount / income * 100).toFixed(1) : 0}%</span>
                </div>
                <span class="cat-amount income">${formatCurrency(cat.amount)}</span>
              </div>
            `).join('')}
          </div>
        ` : `
          <div class="empty-state" style="padding: var(--space-8);">
            ${icons.emptyBox}
            <p style="margin-top: var(--space-3);">Nenhuma receita no período</p>
          </div>
        `}
      </div>
    </div>
  `;

  // Render charts
  if (catEntries.length > 0) {
    createDoughnutChart('analysis-donut-chart',
      catEntries.map(c => c.name),
      catEntries.map(c => c.amount),
      catEntries.map(c => c.color)
    );
  }

  if (expenses > 0) {
    createDoughnutChart('analysis-nature-chart',
      ['Fixo', 'Variável'],
      [fixedAmt, variableAmt],
      ['var(--color-blue-500)', 'var(--color-purple-500)']
    );
  }
}
