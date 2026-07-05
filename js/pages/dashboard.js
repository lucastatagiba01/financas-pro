// ============================================
// FINANÇAS PRO — Dashboard Page
// ============================================

import { icons, formatCurrency, formatDate, escapeHtml } from '../utils.js';
import {
  getFilteredTransactions, getUserTransactions, getCategories, getCategoryById,
  getBanks, addBank, updateBank, deleteBank,
} from '../storage.js';
import { getFilterDates, renderFilter, onFilterChange } from '../components/filters.js';
import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js';
import { renderHeader, bindHeaderEvents } from '../components/header.js';
import { openModal, closeModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { createLineChart, destroyAllCharts } from '../components/charts.js';

// ── Bank helpers ──────────────────────────────────────────────────────────────

const BANK_PRESETS = [
  { key: 'nubank',    name: 'Nubank',           color: '#820AD1', defaultType: 'digital'     },
  { key: 'itau',      name: 'Itaú',             color: '#FF8C00', defaultType: 'corrente'    },
  { key: 'bradesco',  name: 'Bradesco',          color: '#CC0000', defaultType: 'corrente'    },
  { key: 'bb',        name: 'Banco do Brasil',   color: '#1A6BB5', defaultType: 'corrente'    },
  { key: 'santander', name: 'Santander',         color: '#EC0000', defaultType: 'corrente'    },
  { key: 'caixa',     name: 'Caixa',             color: '#0070AF', defaultType: 'poupanca'    },
  { key: 'xp',        name: 'XP',               color: '#1A1A2E', defaultType: 'investimento' },
  { key: 'inter',     name: 'Inter',             color: '#FF7A00', defaultType: 'digital'     },
  { key: 'c6',        name: 'C6 Bank',           color: '#242424', defaultType: 'digital'     },
  { key: 'picpay',    name: 'PicPay',            color: '#21C25E', defaultType: 'digital'     },
  { key: 'neon',      name: 'Neon',              color: '#1282A2', defaultType: 'digital'     },
  { key: 'sicoob',    name: 'Sicoob',            color: '#006B3F', defaultType: 'corrente'    },
  { key: 'custom',    name: 'Outro banco',       color: '#64748B', defaultType: 'corrente'    },
];

const ACCOUNT_TYPE_LABELS = {
  corrente:    'Conta Corrente',
  poupanca:    'Conta Poupança',
  digital:     'Conta Digital',
  investimento:'Conta Investimento',
  salario:     'Conta Salário',
};

const BANK_COLOR_PALETTE = [
  '#820AD1','#FF8C00','#CC0000','#1A6BB5','#EC0000',
  '#0070AF','#1A1A2E','#FF7A00','#242424','#21C25E',
  '#1282A2','#006B3F','#3B82F6','#22C55E','#64748B',
];

function darkenColor(hex, amount = 45) {
  const h = (hex || '#333').replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c+c).join('') : h;
  const num = parseInt(full, 16);
  const r = Math.max(0, (num >> 16) - amount);
  const g = Math.max(0, ((num >> 8) & 0xff) - amount);
  const b = Math.max(0, (num & 0xff) - amount);
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

function bankInitials(name = '') {
  return name.split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
}

// ── Entry point ───────────────────────────────────────────────────────────────

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

  const transactions    = getFilteredTransactions(dates.start, dates.end);
  const allTransactions = getUserTransactions(); // used for bank balance calc (all time)
  const categories      = getCategories();
  const banks           = getBanks();

  // Compute effective balance per bank: initialBalance + all linked income - all linked expenses
  const banksWithBalance = banks.map(bank => {
    const linked  = allTransactions.filter(t => t.bankId === bank.id);
    const income  = linked.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = linked.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    return { ...bank, effectiveBalance: (bank.balance || 0) + income - expense };
  });

  // Calculations
  const income   = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expenses = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const balance  = income - expenses;
  const count    = transactions.length;

  // Category breakdown
  const catExpenses = {};
  transactions.filter(t => t.type === 'expense').forEach(t => {
    catExpenses[t.categoryId] = (catExpenses[t.categoryId] || 0) + t.amount;
  });
  const topCategory = Object.entries(catExpenses).sort((a, b) => b[1] - a[1])[0];
  const topCatInfo  = topCategory ? getCategoryById(topCategory[0]) : null;

  const startDate   = new Date(dates.start + 'T00:00:00');
  const endDate     = new Date(dates.end   + 'T00:00:00');
  const days        = Math.max(1, Math.ceil((endDate - startDate) / (1000*60*60*24)) + 1);
  const today       = new Date();
  const daysElapsed = Math.min(days, Math.max(1, Math.ceil((today - startDate) / (1000*60*60*24))));
  const avgDaily    = daysElapsed > 0 ? expenses / daysElapsed : 0;
  const pctUsed     = income > 0 ? Math.min((expenses / income) * 100, 100) : 0;
  const pctClass    = pctUsed > 80 ? 'danger' : pctUsed > 60 ? 'warning' : 'success';

  const recent = [...transactions].sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt||'').localeCompare(a.createdAt||'')).slice(0, 7);

  // Banks totals (use effective balance)
  const totalBankBalance = banksWithBalance.reduce((s, b) => s + b.effectiveBalance, 0);

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
          <div class="stat-label">Saldo Total</div>
          <div class="stat-value" style="color:${(banksWithBalance.length > 0 ? totalBankBalance : balance)>=0?'var(--color-success-600)':'var(--color-danger-600)'};">${formatCurrency(banksWithBalance.length > 0 ? totalBankBalance : balance)}</div>
          ${banksWithBalance.length > 0 ? `<div style="font-size:var(--font-size-xs);color:var(--color-gray-400);margin-top:2px;">Período: ${balance>=0?'+':''}${formatCurrency(balance)}</div>` : ''}
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
        <div class="indicator-value">${pctUsed.toFixed(1)}%</div>
        <div style="margin-top:var(--space-2);">
          <div class="progress-bar">
            <div class="progress-fill ${pctClass}" style="width:${pctUsed}%"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Charts + Recent -->
    <div class="dashboard-charts animate-fade-in-up stagger-3">
      <div class="card">
        <div class="card-header"><h3>Evolução de Gastos</h3></div>
        <div class="chart-container"><canvas id="dashboard-line-chart"></canvas></div>
      </div>
      <div class="card">
        <div class="card-header"><h3>Últimas Movimentações</h3></div>
        ${recent.length > 0 ? `
          <div style="display:flex;flex-direction:column;gap:var(--space-2);">
            ${recent.map(t => {
              const cat  = getCategoryById(t.categoryId);
              const bank = banks.find(b => b.id === t.bankId);
              return `
                <div style="display:flex;align-items:center;gap:var(--space-3);padding:var(--space-2) 0;border-bottom:1px solid var(--color-gray-100);">
                  <span style="font-size:20px;">${cat ? cat.icon : '📦'}</span>
                  <div style="flex:1;min-width:0;">
                    <div style="font-size:var(--font-size-sm);font-weight:var(--font-weight-medium);color:var(--color-gray-800);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(t.description)}</div>
                    <div style="display:flex;align-items:center;gap:6px;margin-top:1px;">
                      <span style="font-size:var(--font-size-xs);color:var(--color-gray-400);">${formatDate(t.date)}</span>
                      ${bank ? `<span style="display:inline-flex;align-items:center;gap:3px;font-size:10px;color:${bank.color||'#64748B'};font-weight:600;"><span style="width:6px;height:6px;border-radius:50%;background:${bank.color||'#64748B'};display:inline-block;"></span>${escapeHtml(bank.name)}</span>` : ''}
                    </div>
                  </div>
                  <div class="transaction-amount ${t.type}">
                    ${t.type === 'income' ? '+' : '-'} ${formatCurrency(t.amount)}
                  </div>
                </div>`;
            }).join('')}
          </div>
        ` : `
          <div class="empty-state" style="padding:var(--space-6);">
            ${icons.emptyBox}
            <p style="margin-top:var(--space-3);">Nenhuma movimentação ainda</p>
          </div>
        `}
      </div>
    </div>

    <!-- Saldos em Bancos -->
    <div class="card animate-fade-in-up" style="margin-top:var(--space-5);">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <h3 style="margin:0;">Saldos em Bancos</h3>
          ${banks.length > 0 ? `<div style="font-size:var(--font-size-xs);color:var(--color-gray-400);margin-top:2px;">Total: <strong style="color:var(--color-gray-700);">${formatCurrency(totalBankBalance)}</strong></div>` : ''}
        </div>
        <button class="btn btn-primary" id="btn-add-bank" style="padding:6px 14px;font-size:var(--font-size-xs);">
          ${icons.plus} Banco
        </button>
      </div>
      ${banksWithBalance.length === 0 ? `
        <div style="padding:var(--space-8);text-align:center;color:var(--color-gray-400);">
          <div style="font-size:2rem;margin-bottom:var(--space-2);">🏦</div>
          <div style="font-size:var(--font-size-sm);">Nenhum banco cadastrado ainda.</div>
          <div style="font-size:var(--font-size-xs);color:var(--color-gray-300);margin-top:4px;">Clique em "+ Banco" para adicionar.</div>
        </div>
      ` : `
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:var(--space-3);">
          ${banksWithBalance.map(bank => renderBankCard(bank)).join('')}
        </div>
      `}
    </div>
  `;

  buildDailyChart(transactions, dates);
  bindBanksEvents(banks, banksWithBalance);
}

// ── Bank card ─────────────────────────────────────────────────────────────────

function renderBankCard(bank) {
  const color   = bank.color || '#64748B';
  const darker  = darkenColor(color);
  const initials = bankInitials(bank.name);
  const typeLabel = ACCOUNT_TYPE_LABELS[bank.accountType] || bank.accountType || '';

  return `
    <div style="
      border-radius:16px;padding:18px 20px;
      background:linear-gradient(145deg,${color} 0%,${darker} 100%);
      color:white;min-height:140px;display:flex;flex-direction:column;
      justify-content:space-between;position:relative;overflow:hidden;
      box-shadow:0 3px 16px ${color}35;
    ">
      <div style="position:absolute;top:-30px;right:-30px;width:110px;height:110px;border-radius:50%;background:rgba(255,255,255,.07);pointer-events:none;"></div>
      <div style="position:absolute;bottom:-20px;left:10px;width:80px;height:80px;border-radius:50%;background:rgba(255,255,255,.05);pointer-events:none;"></div>

      <!-- Top -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;position:relative;z-index:1;">
        <div>
          <div style="font-size:var(--font-size-sm);font-weight:700;letter-spacing:-.2px;">${escapeHtml(bank.name)}</div>
          <div style="font-size:10px;opacity:.7;margin-top:2px;">${typeLabel}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
          <div style="width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:11px;">${initials}</div>
          ${bank.isMain ? `<div style="background:rgba(255,255,255,.22);border-radius:999px;padding:1px 7px;font-size:9px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;">Principal</div>` : ''}
        </div>
      </div>

      <!-- Balance -->
      <div style="position:relative;z-index:1;">
        <div style="font-size:9px;opacity:.6;letter-spacing:.7px;text-transform:uppercase;margin-bottom:3px;">Saldo Atual</div>
        <div style="font-size:var(--font-size-xl);font-weight:700;letter-spacing:-.3px;">${formatCurrency(bank.effectiveBalance ?? bank.balance ?? 0)}</div>
        ${(bank.balance || 0) !== (bank.effectiveBalance ?? bank.balance ?? 0) ? `<div style="font-size:10px;opacity:.55;margin-top:1px;">Inicial: ${formatCurrency(bank.balance || 0)}</div>` : ''}
      </div>

      <!-- Actions -->
      <div style="display:flex;justify-content:flex-end;gap:5px;position:relative;z-index:1;margin-top:6px;padding-top:10px;border-top:1px solid rgba(255,255,255,.12);">
        <button class="edit-bank-btn" data-id="${bank.id}"
          style="background:rgba(255,255,255,.18);border:none;border-radius:8px;padding:4px 10px;color:white;cursor:pointer;font-size:var(--font-size-xs);display:flex;align-items:center;gap:3px;">
          ${icons.edit} Editar
        </button>
        <button class="delete-bank-btn" data-id="${bank.id}" data-name="${escapeHtml(bank.name)}"
          style="background:rgba(0,0,0,.18);border:none;border-radius:8px;padding:4px 8px;color:rgba(255,255,255,.75);cursor:pointer;display:flex;align-items:center;">
          ${icons.trash}
        </button>
      </div>
    </div>
  `;
}

// ── Bank events & modal ───────────────────────────────────────────────────────

function bindBanksEvents(banks, banksWithBalance = banks) {
  document.getElementById('btn-add-bank')?.addEventListener('click', () => openBankModal(null));

  document.querySelectorAll('.edit-bank-btn').forEach(btn => {
    // Use original bank (without computed effectiveBalance) for editing
    const bank = banks.find(b => b.id === btn.dataset.id);
    btn.addEventListener('click', () => openBankModal(bank));
  });

  document.querySelectorAll('.delete-bank-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm(`Excluir "${btn.dataset.name}"? Esta ação é permanente.`)) {
        deleteBank(btn.dataset.id);
        renderDashboardContent(getFilterDates());
      }
    });
  });
}

function openBankModal(bank) {
  const isEdit = !!bank;

  openModal(
    isEdit ? `Editar — ${escapeHtml(bank.name)}` : 'Adicionar Banco',
    `<div style="display:flex;flex-direction:column;gap:var(--space-4);">
      <div class="form-group">
        <label class="form-label">Banco / Instituição</label>
        <select id="bank-preset" class="form-input">
          <option value="">— Selecione para preencher automaticamente —</option>
          ${BANK_PRESETS.map(p => `<option value="${p.key}" data-color="${p.color}" ${bank?.bankKey===p.key?'selected':''}>${p.name}</option>`).join('')}
        </select>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);">
        <div class="form-group">
          <label class="form-label">Nome *</label>
          <input type="text" id="bank-name" class="form-input" placeholder="Ex: Nubank" value="${escapeHtml(bank?.name||'')}" required>
        </div>
        <div class="form-group">
          <label class="form-label">Tipo de conta *</label>
          <select id="bank-type" class="form-input">
            ${Object.entries(ACCOUNT_TYPE_LABELS).map(([k,v]) => `<option value="${k}" ${bank?.accountType===k?'selected':''}>${v}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Saldo atual (R$)</label>
        <input type="number" id="bank-balance" class="form-input" placeholder="0,00" step="0.01" min="0" value="${bank?.balance ?? ''}">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);">
        <div class="form-group">
          <label class="form-label">Agência <span style="color:var(--color-gray-400);font-weight:normal;">(opcional)</span></label>
          <input type="text" id="bank-agency" class="form-input" placeholder="0001" value="${escapeHtml(bank?.agency||'')}">
        </div>
        <div class="form-group">
          <label class="form-label">Conta <span style="color:var(--color-gray-400);font-weight:normal;">(opcional)</span></label>
          <input type="text" id="bank-account" class="form-input" placeholder="12345-6" value="${escapeHtml(bank?.account||'')}">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Cor do card</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px;">
          ${BANK_COLOR_PALETTE.map(c => `
            <button type="button" class="bank-color-btn" data-color="${c}"
              style="width:26px;height:26px;border-radius:50%;background:${c};border:3px solid ${(bank?.color||'#820AD1')===c?'var(--color-gray-800)':'transparent'};cursor:pointer;transition:border-color .12s;flex-shrink:0;"></button>
          `).join('')}
        </div>
        <input type="hidden" id="bank-color" value="${bank?.color||'#820AD1'}">
      </div>
      <div class="form-group">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--font-size-sm);">
          <input type="checkbox" id="bank-is-main" ${bank?.isMain?'checked':''}>
          <span>Definir como banco principal</span>
        </label>
      </div>
    </div>`,
    `<button type="button" class="btn btn-secondary" id="modal-cancel">Cancelar</button>
     <button type="button" class="btn btn-primary" id="bank-save">${isEdit ? 'Salvar' : 'Adicionar'}</button>`
  );

  // Preset auto-fill (name + color + account type)
  document.getElementById('bank-preset').addEventListener('change', e => {
    const preset = BANK_PRESETS.find(p => p.key === e.target.value);
    if (!preset) return;
    document.getElementById('bank-name').value = preset.name;
    document.getElementById('bank-color').value = preset.color;
    if (preset.defaultType) document.getElementById('bank-type').value = preset.defaultType;
    document.querySelectorAll('.bank-color-btn').forEach(b => {
      b.style.borderColor = b.dataset.color === preset.color ? 'var(--color-gray-800)' : 'transparent';
    });
  });

  // Color picker
  document.querySelectorAll('.bank-color-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('bank-color').value = btn.dataset.color;
      document.querySelectorAll('.bank-color-btn').forEach(b => {
        b.style.borderColor = b.dataset.color === btn.dataset.color ? 'var(--color-gray-800)' : 'transparent';
      });
    });
  });

  document.getElementById('modal-cancel').addEventListener('click', closeModal);

  document.getElementById('bank-save').addEventListener('click', () => {
    const name = document.getElementById('bank-name').value.trim();
    if (!name) { showToast('Informe o nome do banco.', 'error'); return; }

    const data = {
      name,
      bankKey:     document.getElementById('bank-preset').value || 'custom',
      accountType: document.getElementById('bank-type').value,
      balance:     parseFloat(document.getElementById('bank-balance').value) || 0,
      agency:      document.getElementById('bank-agency').value.trim(),
      account:     document.getElementById('bank-account').value.trim(),
      color:       document.getElementById('bank-color').value,
      isMain:      document.getElementById('bank-is-main').checked,
    };

    if (data.isMain) {
      getBanks().forEach(b => { if (b.id !== bank?.id && b.isMain) updateBank(b.id, { isMain: false }); });
    }

    if (isEdit) { updateBank(bank.id, data); showToast('Banco atualizado!', 'success'); }
    else        { addBank(data);             showToast('Banco adicionado!', 'success'); }

    closeModal();
    renderDashboardContent(getFilterDates());
  });
}

// ── Chart ─────────────────────────────────────────────────────────────────────

function buildDailyChart(transactions, dates) {
  const expenses = transactions.filter(t => t.type === 'expense');
  const daily = {};
  expenses.forEach(t => { daily[t.date] = (daily[t.date] || 0) + t.amount; });

  const start = new Date(dates.start + 'T00:00:00');
  const end   = new Date(dates.end   + 'T00:00:00');
  const labels = [];
  const data   = [];
  const d      = new Date(start);
  let cumulative = 0;
  const totalDays = Math.ceil((end - start) / (1000*60*60*24)) + 1;

  if (totalDays <= 31) {
    while (d <= end) {
      const ds = d.toISOString().split('T')[0];
      labels.push(d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }));
      cumulative += daily[ds] || 0;
      data.push(cumulative);
      d.setDate(d.getDate() + 1);
    }
  } else {
    let weekSum = 0, weekStart = new Date(d), dayCount = 0;
    while (d <= end) {
      const ds = d.toISOString().split('T')[0];
      weekSum += daily[ds] || 0;
      dayCount++;
      if (dayCount % 7 === 0 || d.getTime() === end.getTime()) {
        labels.push(weekStart.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }));
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
