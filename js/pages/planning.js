// ============================================
// FINANÇAS PRO — Planejamento Financeiro
// ============================================

import { icons, formatCurrency, escapeHtml } from '../utils.js';
import { getFinancialPlan, saveFinancialPlan, getUserTransactions } from '../storage.js';
import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js';
import { renderHeader, bindHeaderEvents } from '../components/header.js';
import { openModal, closeModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { destroyAllCharts } from '../components/charts.js';
import { generateId } from '../utils.js';

// ── Entry point ───────────────────────────────────────────────────────────────

export function renderPlanning() {
  destroyAllCharts();
  const app = document.getElementById('app');

  app.innerHTML = `
    <div class="app-shell">
      ${renderSidebar()}
      <div class="app-main">
        ${renderHeader('Planejamento Financeiro')}
        <div class="content">
          <div id="planning-content"></div>
        </div>
      </div>
    </div>
  `;

  bindSidebarEvents();
  bindHeaderEvents();
  renderPlanningContent();
}

// ── Main render ───────────────────────────────────────────────────────────────

function renderPlanningContent() {
  const container = document.getElementById('planning-content');
  if (!container) return;

  const plan = getFinancialPlan();
  const nonCreditTotal  = (plan.nonCreditExpenses || []).reduce((s, e) => s + (e.amount || 0), 0);
  const rendaNecessaria = plan.maxCreditLimit + nonCreditTotal + (plan.monthlyInvestment || 0);

  // Last month date range
  const now = new Date();
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lmYear  = lastMonthDate.getFullYear();
  const lmMonth = String(lastMonthDate.getMonth() + 1).padStart(2, '0');
  const lmStart = `${lmYear}-${lmMonth}-01`;
  const lmEnd   = `${lmYear}-${lmMonth}-${String(new Date(lmYear, lastMonthDate.getMonth() + 1, 0).getDate()).padStart(2, '0')}`;
  const lmLabel = lastMonthDate.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });

  const allTx      = getUserTransactions();
  const lmTx       = allTx.filter(t => t.date >= lmStart && t.date <= lmEnd);
  const lmIncome   = lmTx.filter(t => t.type === 'income').reduce((s, t)  => s + t.amount, 0);
  const lmExpenses = lmTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  container.innerHTML = `
    <!-- Page header -->
    <div style="margin-bottom:var(--space-5);">
      <h2 style="margin:0;font-size:var(--font-size-xl);font-weight:700;color:var(--color-gray-900);">Planejamento Financeiro</h2>
      <p style="margin:4px 0 0;font-size:var(--font-size-sm);color:var(--color-gray-400);">Defina seus limites e organize suas finanças mensais</p>
    </div>

    <!-- 2x2 quadrant grid -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4);margin-bottom:var(--space-4);">

      <!-- Q1: Ideal de gasto no crédito -->
      ${renderValueQuadrant({
        title: 'Ideal de Gasto no Crédito',
        subtitle: 'Quanto você deveria gastar no cartão por mês',
        value: plan.idealCreditSpend,
        color: '#6366F1',
        icon: '💳',
        field: 'idealCreditSpend',
        tip: 'Referência saudável — tente não ultrapassar este valor.',
      })}

      <!-- Q2: Limite máximo no crédito -->
      ${renderValueQuadrant({
        title: 'Limite Máximo no Crédito',
        subtitle: 'Teto absoluto que não pode ser ultrapassado',
        value: plan.maxCreditLimit,
        color: '#EF4444',
        icon: '🚫',
        field: 'maxCreditLimit',
        tip: 'Nunca ultrapasse este valor no cartão de crédito.',
      })}

      <!-- Q3: Meta de investimento -->
      ${renderValueQuadrant({
        title: 'Meta de Investimento Mensal',
        subtitle: 'Quanto você precisa separar para investir',
        value: plan.monthlyInvestment || 0,
        color: '#22C55E',
        icon: '📈',
        field: 'monthlyInvestment',
        tip: 'Pague-se primeiro — reserve isto antes de gastar.',
      })}

      <!-- Q4: Despesas fora do crédito -->
      ${renderNonCreditQuadrant(plan.nonCreditExpenses || [], nonCreditTotal)}

    </div>

    <!-- Renda necessária — full width abaixo -->
    ${renderIncomeQuadrant(rendaNecessaria, plan.maxCreditLimit, nonCreditTotal, plan.monthlyInvestment || 0, lmIncome, lmExpenses, lmLabel)}
  `;

  // Bind value quadrant edit buttons
  container.querySelectorAll('[data-edit-field]').forEach(btn => {
    btn.addEventListener('click', () => {
      const field = btn.dataset.editField;
      const label = btn.dataset.editLabel;
      openValueModal(field, label, plan[field] || 0);
    });
  });

  // Bind non-credit expense actions
  document.getElementById('btn-add-nce')?.addEventListener('click', () => openNonCreditModal());

  container.querySelectorAll('[data-edit-nce]').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = (plan.nonCreditExpenses || []).find(e => e.id === btn.dataset.editNce);
      if (item) openNonCreditModal(item);
    });
  });

  container.querySelectorAll('[data-delete-nce]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('Remover esta despesa do planejamento?')) {
        const plan = getFinancialPlan();
        saveFinancialPlan({
          nonCreditExpenses: (plan.nonCreditExpenses || []).filter(e => e.id !== btn.dataset.deleteNce),
        });
        showToast('Despesa removida', 'success');
        renderPlanningContent();
      }
    });
  });
}

// ── Quadrant renderers ────────────────────────────────────────────────────────

function renderValueQuadrant({ id, title, subtitle, value, color, icon, field, tip }) {
  return `
    <div class="card animate-fade-in-up" style="padding:0;overflow:hidden;">
      <!-- Colored header band -->
      <div style="background:${color};padding:var(--space-4) var(--space-5);display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <div style="display:flex;align-items:center;gap:var(--space-2);margin-bottom:4px;">
            <span style="font-size:1.2rem;">${icon}</span>
            <span style="font-size:var(--font-size-sm);font-weight:700;color:white;">${title}</span>
          </div>
          <div style="font-size:11px;color:rgba(255,255,255,.7);">${subtitle}</div>
        </div>
        <button class="btn" data-edit-field="${field}" data-edit-label="${title}"
          style="padding:6px 12px;border-radius:8px;background:rgba(255,255,255,.2);color:white;font-size:12px;font-weight:600;border:1px solid rgba(255,255,255,.3);cursor:pointer;white-space:nowrap;">
          ✏️ Editar
        </button>
      </div>

      <!-- Value display -->
      <div style="padding:var(--space-5) var(--space-5) var(--space-4);">
        <div style="font-size:2.2rem;font-weight:900;color:${color};letter-spacing:-.5px;line-height:1;">
          ${formatCurrency(value)}
        </div>
        <div style="margin-top:var(--space-3);padding:var(--space-2) var(--space-3);background:${color}10;border-radius:8px;border-left:3px solid ${color};">
          <div style="font-size:11px;color:var(--color-gray-500);">${tip}</div>
        </div>
      </div>
    </div>
  `;
}

function renderNonCreditQuadrant(expenses, total) {
  return `
    <div class="card animate-fade-in-up stagger-3" style="padding:0;overflow:hidden;">
      <!-- Colored header band -->
      <div style="background:#F59E0B;padding:var(--space-4) var(--space-5);display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <div style="display:flex;align-items:center;gap:var(--space-2);margin-bottom:4px;">
            <span style="font-size:1.2rem;">💸</span>
            <span style="font-size:var(--font-size-sm);font-weight:700;color:white;">Despesas Fora do Crédito</span>
          </div>
          <div style="font-size:11px;color:rgba(255,255,255,.7);">Gastos que só podem ser pagos via PIX ou boleto</div>
        </div>
        <button id="btn-add-nce"
          style="padding:6px 12px;border-radius:8px;background:rgba(255,255,255,.2);color:white;font-size:12px;font-weight:600;border:1px solid rgba(255,255,255,.3);cursor:pointer;white-space:nowrap;">
          + Adicionar
        </button>
      </div>

      <!-- List -->
      <div style="padding:var(--space-4) var(--space-5);">
        ${expenses.length === 0 ? `
          <div style="text-align:center;padding:var(--space-6) 0;color:var(--color-gray-300);">
            <div style="font-size:1.8rem;margin-bottom:var(--space-2);">💸</div>
            <div style="font-size:var(--font-size-sm);">Nenhuma despesa cadastrada</div>
            <div style="font-size:var(--font-size-xs);margin-top:4px;">Ex: Aluguel, Água, Luz...</div>
          </div>
        ` : `
          <div style="display:flex;flex-direction:column;gap:var(--space-2);max-height:220px;overflow-y:auto;">
            ${expenses.map(e => `
              <div style="display:flex;align-items:center;justify-content:space-between;padding:var(--space-2) var(--space-3);background:var(--color-gray-50);border-radius:8px;gap:var(--space-2);">
                <div style="display:flex;align-items:center;gap:var(--space-2);min-width:0;flex:1;">
                  <span style="width:8px;height:8px;border-radius:50%;background:#F59E0B;flex-shrink:0;"></span>
                  <span style="font-size:var(--font-size-sm);color:var(--color-gray-700);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(e.name)}</span>
                </div>
                <div style="display:flex;align-items:center;gap:var(--space-2);flex-shrink:0;">
                  <span style="font-size:var(--font-size-sm);font-weight:700;color:#F59E0B;">${formatCurrency(e.amount)}</span>
                  <button class="btn btn-ghost btn-sm" data-edit-nce="${e.id}" title="Editar" style="padding:2px 4px;">${icons.edit}</button>
                  <button class="btn btn-ghost btn-sm" data-delete-nce="${e.id}" title="Remover" style="padding:2px 4px;color:var(--color-danger-500);">${icons.trash}</button>
                </div>
              </div>
            `).join('')}
          </div>

          <!-- Total -->
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:var(--space-3);padding-top:var(--space-3);border-top:2px solid var(--color-gray-100);">
            <span style="font-size:var(--font-size-xs);color:var(--color-gray-400);font-weight:600;text-transform:uppercase;letter-spacing:.5px;">Total</span>
            <span style="font-size:var(--font-size-lg);font-weight:800;color:#F59E0B;">${formatCurrency(total)}</span>
          </div>
        `}
      </div>
    </div>
  `;
}

// ── Quadrant: renda necessária (calculada) ────────────────────────────────────

function renderIncomeQuadrant(rendaNecessaria, maxCredit, nonCreditTotal, investment, lmIncome, lmExpenses, lmLabel) {
  const metaAtingida   = lmIncome >= rendaNecessaria;
  const gastoOk        = lmExpenses <= maxCredit;
  const incomeGap      = lmIncome - rendaNecessaria;
  const expenseGap     = maxCredit - lmExpenses;
  const hasLastMonth   = lmIncome > 0 || lmExpenses > 0;

  return `
    <div class="card animate-fade-in-up" style="padding:0;overflow:hidden;">
      <!-- Header band -->
      <div style="background:linear-gradient(135deg,#0EA5E9 0%,#0284C7 100%);padding:var(--space-4) var(--space-5);display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="display:flex;align-items:center;gap:var(--space-2);margin-bottom:4px;">
            <span style="font-size:1.2rem;">💼</span>
            <span style="font-size:var(--font-size-sm);font-weight:700;color:white;">Renda Mínima Necessária</span>
          </div>
          <div style="font-size:11px;color:rgba(255,255,255,.75);">Soma de todas as despesas — quanto você precisa ganhar para cobrir tudo</div>
        </div>
        <div style="font-size:1.8rem;font-weight:900;color:white;letter-spacing:-.5px;white-space:nowrap;">
          ${formatCurrency(rendaNecessaria)}
        </div>
      </div>

      <!-- Breakdown planejado -->
      <div style="padding:var(--space-4) var(--space-5) var(--space-3);display:grid;grid-template-columns:repeat(3,1fr);gap:var(--space-3);">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:var(--space-3) var(--space-4);background:var(--color-gray-50);border-radius:10px;border-left:3px solid #EF4444;">
          <div>
            <div style="font-size:10px;color:var(--color-gray-400);margin-bottom:2px;">Limite máximo no crédito</div>
            <div style="font-size:var(--font-size-lg);font-weight:800;color:#EF4444;">${formatCurrency(maxCredit)}</div>
          </div>
          <span style="font-size:1.2rem;">🚫</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:var(--space-3) var(--space-4);background:var(--color-gray-50);border-radius:10px;border-left:3px solid #F59E0B;">
          <div>
            <div style="font-size:10px;color:var(--color-gray-400);margin-bottom:2px;">Despesas fora do crédito</div>
            <div style="font-size:var(--font-size-lg);font-weight:800;color:#F59E0B;">${formatCurrency(nonCreditTotal)}</div>
          </div>
          <span style="font-size:1.2rem;">💸</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:var(--space-3) var(--space-4);background:var(--color-gray-50);border-radius:10px;border-left:3px solid #22C55E;">
          <div>
            <div style="font-size:10px;color:var(--color-gray-400);margin-bottom:2px;">Meta de investimento</div>
            <div style="font-size:var(--font-size-lg);font-weight:800;color:#22C55E;">${formatCurrency(investment)}</div>
          </div>
          <span style="font-size:1.2rem;">📈</span>
        </div>
      </div>

      <!-- Mês anterior -->
      <div style="margin:0 var(--space-5) var(--space-5);border-top:1px solid var(--color-gray-100);padding-top:var(--space-4);">
        <div style="font-size:var(--font-size-xs);font-weight:700;color:var(--color-gray-400);text-transform:uppercase;letter-spacing:.5px;margin-bottom:var(--space-3);">
          📅 Resultado do mês anterior — ${lmLabel}
        </div>

        ${!hasLastMonth ? `
          <div style="text-align:center;padding:var(--space-4);color:var(--color-gray-300);font-size:var(--font-size-sm);">
            Sem movimentações registradas em ${lmLabel}.
          </div>
        ` : `
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);">

            <!-- Receita vs meta -->
            <div style="padding:var(--space-4);border-radius:12px;background:${metaAtingida ? '#22C55E12' : '#EF444412'};border:1px solid ${metaAtingida ? '#22C55E30' : '#EF444430'};">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:var(--space-2);">
                <div style="font-size:var(--font-size-xs);color:var(--color-gray-500);font-weight:600;">Receita do mês</div>
                <span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;background:${metaAtingida ? '#22C55E' : '#EF4444'};color:white;">
                  ${metaAtingida ? '✓ Meta atingida' : '✗ Abaixo da meta'}
                </span>
              </div>
              <div style="font-size:var(--font-size-xl);font-weight:800;color:${metaAtingida ? '#22C55E' : '#EF4444'};">${formatCurrency(lmIncome)}</div>
              <div style="font-size:var(--font-size-xs);color:var(--color-gray-400);margin-top:4px;">
                ${incomeGap >= 0
                  ? `<span style="color:#22C55E;">+${formatCurrency(incomeGap)} acima da meta</span>`
                  : `<span style="color:#EF4444;">${formatCurrency(Math.abs(incomeGap))} abaixo da meta</span>`}
              </div>
            </div>

            <!-- Gastos vs limite -->
            <div style="padding:var(--space-4);border-radius:12px;background:${gastoOk ? '#22C55E12' : '#EF444412'};border:1px solid ${gastoOk ? '#22C55E30' : '#EF444430'};">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:var(--space-2);">
                <div style="font-size:var(--font-size-xs);color:var(--color-gray-500);font-weight:600;">Gastos do mês</div>
                <span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;background:${gastoOk ? '#22C55E' : '#EF4444'};color:white;">
                  ${gastoOk ? '✓ Dentro do limite' : '✗ Limite excedido'}
                </span>
              </div>
              <div style="font-size:var(--font-size-xl);font-weight:800;color:${gastoOk ? '#22C55E' : '#EF4444'};">${formatCurrency(lmExpenses)}</div>
              <div style="font-size:var(--font-size-xs);color:var(--color-gray-400);margin-top:4px;">
                ${expenseGap >= 0
                  ? `<span style="color:#22C55E;">${formatCurrency(expenseGap)} de margem</span>`
                  : `<span style="color:#EF4444;">${formatCurrency(Math.abs(expenseGap))} acima do limite</span>`}
              </div>
            </div>

          </div>
        `}
      </div>
    </div>
  `;
}

// ── Modal: edit single value ──────────────────────────────────────────────────

function openValueModal(field, label, currentValue) {
  const body = `
    <div style="padding:var(--space-2) 0;">
      <div class="form-group">
        <label class="form-label">${label} (R$)</label>
        <input class="form-input" type="number" id="plan-value"
          step="0.01" min="0" value="${currentValue}"
          style="font-size:var(--font-size-xl);font-weight:800;text-align:center;">
      </div>
    </div>
  `;

  const footer = `
    <button class="btn btn-secondary" id="plan-val-cancel">Cancelar</button>
    <button class="btn btn-primary" id="plan-val-save">Salvar</button>
  `;

  openModal(`Editar: ${label}`, body, footer);

  document.getElementById('plan-value').select();
  document.getElementById('plan-val-cancel').addEventListener('click', closeModal);
  document.getElementById('plan-val-save').addEventListener('click', () => {
    const value = parseFloat(document.getElementById('plan-value').value) || 0;
    saveFinancialPlan({ [field]: value });
    showToast('Valor salvo!', 'success');
    closeModal();
    renderPlanningContent();
  });
}

// ── Modal: add / edit non-credit expense ──────────────────────────────────────

function openNonCreditModal(editItem = null) {
  const isEdit = !!editItem;
  const title  = isEdit ? 'Editar Despesa' : 'Nova Despesa Fora do Crédito';

  const body = `
    <form id="nce-form">
      <div class="form-group">
        <label class="form-label">Nome da Despesa *</label>
        <input class="form-input" type="text" id="nce-name"
          placeholder="Ex: Aluguel, Água, Condomínio..."
          value="${isEdit ? escapeHtml(editItem.name) : ''}" required>
      </div>
      <div class="form-group">
        <label class="form-label">Valor Mensal (R$) *</label>
        <input class="form-input" type="number" id="nce-amount"
          step="0.01" min="0.01" placeholder="0,00"
          value="${isEdit ? editItem.amount : ''}">
      </div>
    </form>
  `;

  const footer = `
    <button class="btn btn-secondary" id="nce-cancel">Cancelar</button>
    <button class="btn btn-primary" id="nce-save">${isEdit ? 'Salvar' : 'Adicionar'}</button>
  `;

  openModal(title, body, footer);

  document.getElementById('nce-cancel').addEventListener('click', closeModal);
  document.getElementById('nce-save').addEventListener('click', () => {
    const name   = document.getElementById('nce-name').value.trim();
    const amount = parseFloat(document.getElementById('nce-amount').value);

    if (!name || !amount || amount <= 0) {
      showToast('Preencha nome e valor', 'error');
      return;
    }

    const plan     = getFinancialPlan();
    const expenses = [...(plan.nonCreditExpenses || [])];

    if (isEdit) {
      const idx = expenses.findIndex(e => e.id === editItem.id);
      if (idx !== -1) expenses[idx] = { ...expenses[idx], name, amount };
    } else {
      expenses.push({ id: generateId(), name, amount });
    }

    saveFinancialPlan({ nonCreditExpenses: expenses });
    showToast(isEdit ? 'Despesa atualizada!' : 'Despesa adicionada!', 'success');
    closeModal();
    renderPlanningContent();
  });
}
