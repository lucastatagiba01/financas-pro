// ============================================
// FINANÇAS PRO — Dashboard Page
// ============================================

import { icons, formatCurrency, formatDate, getMonthName } from '../utils.js';
import { getFilteredTransactions, getCategories, getCategoryById } from '../storage.js';
import { getFilterDates, renderFilter, onFilterChange, getFilterLabel } from '../components/filters.js';
import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js';
import { renderHeader, bindHeaderEvents } from '../components/header.js';
import { createLineChart, destroyAllCharts } from '../components/charts.js';

export function renderDashboard() {
  destroyAllCharts();
  const app = document.getElementById('app');
  const dates = getFilterDates();

  app.innerHTML = `
    <div class="app-shell">
      ${renderSidebar()}
      <div class="app-main">
        ${renderHeader('Dashboard')}
        <div class="content">
          <div id="filter-container" style="margin-bottom: var(--space-5);"></div>
          <div id="dashboard-content"></div>
        </div>
      </div>
    </div>
  `;

  bindSidebarEvents();
  bindHeaderEvents();
  renderFilter('filter-container');
  renderDashboardContent(dates);

  onFilterChange((filter, newDates) => {
    renderDashboardContent(newDates);
  });
}

function renderDashboardContent(dates) {
  const container = document.getElementById('dashboard-content');
  if (!container) return;

  const transactions = getFilteredTransactions(dates.start, dates.end);
  const categories = getCategories();

  // Calculations
  const income = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const expenses = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
  const balance = income - expenses;
  const count = transactions.length;

  // Category breakdown
  const catExpenses = {};
  transactions.filter(t => t.type === 'expense').forEach(t => {
    catExpenses[t.categoryId] = (catExpenses[t.categoryId] || 0) + t.amount;
  });

  const topCategory = Object.entries(catExpenses).sort((a, b) => b[1] - a[1])[0];
  const topCatInfo = topCategory ? getCategoryById(topCategory[0]) : null;

  // Days in period
  const startDate = new Date(dates.start + 'T00:00:00');
  const endDate = new Date(dates.end + 'T00:00:00');
  const days = Math.max(1, Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1);
  const today = new Date();
  const daysElapsed = Math.min(days, Math.max(1, Math.ceil((today - startDate) / (1000 * 60 * 60 * 24))));
  const avgDaily = daysElapsed > 0 ? expenses / daysElapsed : 0;

  const percentUsed = income > 0 ? Math.min((expenses / income) * 100, 100) : 0;
  const percentClass = percentUsed > 80 ? 'danger' : percentUsed > 60 ? 'warning' : 'success';

  // Recent transactions (last 5)
  const recent = [...transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);

  container.innerHTML = `
    <!-- Stats -->
    <div class="dashboard-stats animate-fade-in-up">
      <div class="stat-card stat-income">
        <div class="stat-icon icon-income">${icons.income}</div>
        <div class="stat-content">
          <div class="stat-label">Receita Total</div>
          <div class="stat-value">${formatCurrency(income)}</div>
        </div>
      </div>
      <div class="stat-card stat-expense stagger-1">
        <div class="stat-icon icon-expense">${icons.expense}</div>
        <div class="stat-content">
          <div class="stat-label">Despesas Totais</div>
          <div class="stat-value">${formatCurrency(expenses)}</div>
        </div>
      </div>
      <div class="stat-card stat-balance stagger-2">
        <div class="stat-icon icon-balance">${icons.balance}</div>
        <div class="stat-content">
          <div class="stat-label">Saldo Atual</div>
          <div class="stat-value" style="color: ${balance >= 0 ? 'var(--color-success-600)' : 'var(--color-danger-600)'}">${formatCurrency(balance)}</div>
        </div>
      </div>
      <div class="stat-card stat-count stagger-3">
        <div class="stat-icon icon-count">${icons.count}</div>
        <div class="stat-content">
          <div class="stat-label">Movimentações</div>
          <div class="stat-value">${count}</div>
        </div>
      </div>
    </div>

    <!-- Indicators -->
    <div class="dashboard-indicators animate-fade-in-up stagger-2">
      <div class="indicator-card">
        <div class="indicator-label">Maior Categoria de Gasto</div>
        <div class="indicator-value">${topCatInfo ? topCatInfo.icon + ' ' + topCatInfo.name : '—'}</div>
        <div class="indicator-sub">${topCategory ? formatCurrency(topCategory[1]) : 'Sem dados'}</div>
      </div>
      <div class="indicator-card">
        <div class="indicator-label">Média Diária de Gastos</div>
        <div class="indicator-value">${formatCurrency(avgDaily)}</div>
        <div class="indicator-sub">${daysElapsed} dias no período</div>
      </div>
      <div class="indicator-card">
        <div class="indicator-label">Renda Utilizada</div>
        <div class="indicator-value">${percentUsed.toFixed(1)}%</div>
        <div style="margin-top: var(--space-2);">
          <div class="progress-bar">
            <div class="progress-fill ${percentClass}" style="width: ${percentUsed}%"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Charts + Recent -->
    <div class="dashboard-charts animate-fade-in-up stagger-3">
      <div class="card">
        <div class="card-header">
          <h3>Evolução de Gastos</h3>
        </div>
        <div class="chart-container">
          <canvas id="dashboard-line-chart"></canvas>
        </div>
      </div>
      <div class="card">
        <div class="card-header">
          <h3>Últimas Movimentações</h3>
        </div>
        ${recent.length > 0 ? `
          <div style="display: flex; flex-direction: column; gap: var(--space-2);">
            ${recent.map(t => {
              const cat = getCategoryById(t.categoryId);
              return `
                <div style="display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) 0; border-bottom: 1px solid var(--color-gray-100);">
                  <span style="font-size: 20px;">${cat ? cat.icon : '📦'}</span>
                  <div style="flex: 1; min-width: 0;">
                    <div style="font-size: var(--font-size-sm); font-weight: var(--font-weight-medium); color: var(--color-gray-800); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${t.description}</div>
                    <div style="font-size: var(--font-size-xs); color: var(--color-gray-400);">${formatDate(t.date)}</div>
                  </div>
                  <div class="transaction-amount ${t.type}">
                    ${t.type === 'income' ? '+' : '-'} ${formatCurrency(t.amount)}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        ` : `
          <div class="empty-state" style="padding: var(--space-6);">
            ${icons.emptyBox}
            <p style="margin-top: var(--space-3);">Nenhuma movimentação ainda</p>
          </div>
        `}
      </div>
    </div>
  `;

  // Build line chart data
  buildDailyChart(transactions, dates);
}

function buildDailyChart(transactions, dates) {
  const expenses = transactions.filter(t => t.type === 'expense');

  // Group by date
  const daily = {};
  expenses.forEach(t => {
    daily[t.date] = (daily[t.date] || 0) + t.amount;
  });

  // Generate date labels
  const start = new Date(dates.start + 'T00:00:00');
  const end = new Date(dates.end + 'T00:00:00');
  const labels = [];
  const data = [];

  const d = new Date(start);
  let cumulative = 0;

  // If more than 60 days, group by week
  const totalDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;

  if (totalDays <= 31) {
    while (d <= end) {
      const dateStr = d.toISOString().split('T')[0];
      const dayLabel = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
      labels.push(dayLabel);
      cumulative += daily[dateStr] || 0;
      data.push(cumulative);
      d.setDate(d.getDate() + 1);
    }
  } else {
    // Group by week
    let weekSum = 0;
    let weekStart = new Date(d);
    let dayCount = 0;

    while (d <= end) {
      const dateStr = d.toISOString().split('T')[0];
      weekSum += daily[dateStr] || 0;
      dayCount++;

      if (dayCount % 7 === 0 || d.getTime() === end.getTime()) {
        const label = weekStart.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
        labels.push(label);
        cumulative += weekSum;
        data.push(cumulative);
        weekSum = 0;
        weekStart = new Date(d);
        weekStart.setDate(weekStart.getDate() + 1);
      }

      d.setDate(d.getDate() + 1);
    }
  }

  if (labels.length > 0) {
    createLineChart('dashboard-line-chart', labels, [
      { label: 'Gastos Acumulados', data, color: '#3B82F6', fill: true },
    ]);
  }
}
