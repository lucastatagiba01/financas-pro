// ============================================
// FINANÇAS PRO — Reports Page
// ============================================

import { icons, formatCurrency, formatDate, getMonthName } from '../utils.js';
import { getFilteredTransactions, getCategoryById } from '../storage.js';
import { getFilterDates, renderFilter, onFilterChange } from '../components/filters.js';
import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js';
import { renderHeader, bindHeaderEvents } from '../components/header.js';
import { createBarChart, destroyAllCharts } from '../components/charts.js';

export function renderReports() {
  destroyAllCharts();
  const app = document.getElementById('app');

  app.innerHTML = `
    <div class="app-shell">
      ${renderSidebar()}
      <div class="app-main">
        ${renderHeader('Relatórios')}
        <div class="content">
          <div id="filter-container" style="margin-bottom: var(--space-5);"></div>
          <div id="reports-content"></div>
        </div>
      </div>
    </div>
  `;

  bindSidebarEvents();
  bindHeaderEvents();
  renderFilter('filter-container');
  renderReportsContent(getFilterDates());

  onFilterChange((_, newDates) => {
    renderReportsContent(newDates);
  });
}

function renderReportsContent(dates) {
  const container = document.getElementById('reports-content');
  if (!container) return;

  const transactions = getFilteredTransactions(dates.start, dates.end);

  const income = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expenses = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const balance = income - expenses;

  // Monthly grouping
  const monthly = {};
  transactions.forEach(t => {
    const ym = t.date.substring(0, 7); // "2024-06"
    if (!monthly[ym]) monthly[ym] = { income: 0, expense: 0 };
    monthly[ym][t.type] += t.amount;
  });

  const months = Object.keys(monthly).sort();

  // Top 10 expenses
  const top10 = [...transactions]
    .filter(t => t.type === 'expense')
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);

  // Top 5 income
  const top5Income = [...transactions]
    .filter(t => t.type === 'income')
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  // Average per month
  const numMonths = months.length || 1;
  const avgMonthlyExpense = expenses / numMonths;
  const avgMonthlyIncome = income / numMonths;

  container.innerHTML = `
    <!-- KPI Row -->
    <div class="reports-kpi animate-fade-in-up">
      <div class="kpi-card">
        <div class="kpi-label">Total de Receitas</div>
        <div class="kpi-value income">${formatCurrency(income)}</div>
        <div class="kpi-sub">Média mensal: ${formatCurrency(avgMonthlyIncome)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Total de Despesas</div>
        <div class="kpi-value expense">${formatCurrency(expenses)}</div>
        <div class="kpi-sub">Média mensal: ${formatCurrency(avgMonthlyExpense)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Saldo do Período</div>
        <div class="kpi-value" style="color: ${balance >= 0 ? 'var(--color-success-600)' : 'var(--color-danger-600)'}">
          ${formatCurrency(balance)}
        </div>
        <div class="kpi-sub">${transactions.length} movimentações</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Meses Analisados</div>
        <div class="kpi-value">${numMonths}</div>
        <div class="kpi-sub">${months.length > 0 ? months[0] + ' a ' + months[months.length - 1] : 'Sem dados'}</div>
      </div>
    </div>

    <!-- Monthly Bar Chart -->
    <div class="card animate-fade-in-up stagger-1">
      <div class="card-header">
        <h3>Evolução Mensal</h3>
      </div>
      ${months.length > 0 ? `
        <div class="chart-container" style="max-height: 280px;">
          <canvas id="reports-bar-chart"></canvas>
        </div>
      ` : `
        <div class="empty-state" style="padding: var(--space-8);">
          ${icons.emptyBox}
          <p style="margin-top: var(--space-3);">Sem dados para exibir</p>
        </div>
      `}
    </div>

    <!-- Tables Row -->
    <div class="reports-tables animate-fade-in-up stagger-2">
      <!-- Top Expenses -->
      <div class="card">
        <div class="card-header">
          <h3>Maiores Despesas</h3>
        </div>
        ${top10.length > 0 ? `
          <div class="table-container">
            <table class="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Descrição</th>
                  <th>Categoria</th>
                  <th>Data</th>
                  <th class="text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                ${top10.map((t, i) => {
                  const cat = getCategoryById(t.categoryId);
                  return `
                    <tr>
                      <td><span class="rank-badge">${i + 1}</span></td>
                      <td><span class="transaction-desc">${t.description}</span></td>
                      <td>
                        <div class="transaction-category">
                          <span>${cat ? cat.icon : '📦'}</span>
                          <span>${cat ? cat.name : 'Outros'}</span>
                        </div>
                      </td>
                      <td><span class="transaction-date">${formatDate(t.date)}</span></td>
                      <td class="text-right">
                        <span class="transaction-amount expense">- ${formatCurrency(t.amount)}</span>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        ` : `
          <div class="empty-state" style="padding: var(--space-6);">
            ${icons.emptyBox}
            <p>Sem despesas no período</p>
          </div>
        `}
      </div>

      <!-- Summary by Month -->
      <div class="card">
        <div class="card-header">
          <h3>Resumo por Mês</h3>
        </div>
        ${months.length > 0 ? `
          <div class="table-container">
            <table class="table">
              <thead>
                <tr>
                  <th>Mês</th>
                  <th class="text-right">Receitas</th>
                  <th class="text-right">Despesas</th>
                  <th class="text-right">Saldo</th>
                </tr>
              </thead>
              <tbody>
                ${months.sort((a, b) => b.localeCompare(a)).map(ym => {
                  const [year, month] = ym.split('-');
                  const m = monthly[ym];
                  const bal = m.income - m.expense;
                  return `
                    <tr>
                      <td><strong>${getMonthName(parseInt(month) - 1)} ${year}</strong></td>
                      <td class="text-right"><span class="transaction-amount income">+ ${formatCurrency(m.income)}</span></td>
                      <td class="text-right"><span class="transaction-amount expense">- ${formatCurrency(m.expense)}</span></td>
                      <td class="text-right"><span style="color: ${bal >= 0 ? 'var(--color-success-600)' : 'var(--color-danger-600)'}; font-weight: var(--font-weight-semibold);">${formatCurrency(bal)}</span></td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        ` : `
          <div class="empty-state" style="padding: var(--space-6);">
            ${icons.emptyBox}
            <p>Sem dados no período</p>
          </div>
        `}
      </div>
    </div>
  `;

  // Render bar chart
  if (months.length > 0) {
    const labels = months.map(ym => {
      const [year, month] = ym.split('-');
      return getMonthName(parseInt(month) - 1).slice(0, 3) + '/' + year.slice(2);
    });

    createBarChart('reports-bar-chart', labels, [
      { label: 'Receitas', data: months.map(ym => monthly[ym].income), color: '#22C55E' },
      { label: 'Despesas', data: months.map(ym => monthly[ym].expense), color: '#EF4444' },
    ]);
  }
}
