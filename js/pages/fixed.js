// ============================================
// FINANÇAS PRO — Fixed Expenses Page
// ============================================

import { icons, formatCurrency, escapeHtml, getTodayStr } from '../utils.js';
import {
  getFixedExpenses, addFixedExpense, updateFixedExpense,
  deleteFixedExpense, toggleFixedExpense, getCategories, getCategoryById
} from '../storage.js';
import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js';
import { renderHeader, bindHeaderEvents } from '../components/header.js';
import { openModal, closeModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { destroyAllCharts } from '../components/charts.js';

export function renderFixed() {
  destroyAllCharts();
  const app = document.getElementById('app');

  app.innerHTML = `
    <div class="app-shell">
      ${renderSidebar()}
      <div class="app-main">
        ${renderHeader('Gastos Fixos')}
        <div class="content">
          <div id="fixed-content"></div>
        </div>
      </div>
    </div>
  `;

  bindSidebarEvents();
  bindHeaderEvents();
  renderFixedContent();
}

function renderFixedContent() {
  const container = document.getElementById('fixed-content');
  if (!container) return;

  const fixedList = getFixedExpenses();
  const total = fixedList.filter(f => f.active).reduce((s, f) => s + f.amount, 0);
  const totalAll = fixedList.reduce((s, f) => s + f.amount, 0);

  container.innerHTML = `
    <!-- Header Actions -->
    <div class="fixed-header animate-fade-in-up">
      <div class="fixed-summary">
        <div class="fixed-summary-card">
          <div class="fixed-summary-label">Total Ativo / Mês</div>
          <div class="fixed-summary-value">${formatCurrency(total)}</div>
        </div>
        <div class="fixed-summary-card">
          <div class="fixed-summary-label">Todos os Fixos / Mês</div>
          <div class="fixed-summary-value">${formatCurrency(totalAll)}</div>
        </div>
        <div class="fixed-summary-card">
          <div class="fixed-summary-label">Quantidade</div>
          <div class="fixed-summary-value">${fixedList.length}</div>
        </div>
      </div>
      <button class="btn btn-primary" id="btn-add-fixed">
        ${icons.plus}
        <span>Novo Gasto Fixo</span>
      </button>
    </div>

    <!-- Info Banner -->
    <div class="info-banner animate-fade-in-up stagger-1">
      ${icons.info}
      <p>Os gastos fixos são lançados automaticamente nas <strong>Movimentações</strong> no início de cada mês.</p>
    </div>

    <!-- Fixed List -->
    <div id="fixed-list" class="animate-fade-in-up stagger-2">
      ${fixedList.length === 0 ? `
        <div class="card">
          <div class="empty-state" style="padding: var(--space-12);">
            ${icons.emptyBox}
            <h3>Nenhum gasto fixo</h3>
            <p>Adicione despesas recorrentes como aluguel, internet, assinaturas...</p>
            <button class="btn btn-primary" id="btn-add-fixed-empty" style="margin-top: var(--space-4);">
              ${icons.plus} Adicionar primeiro gasto fixo
            </button>
          </div>
        </div>
      ` : `
        <div class="card" style="padding: 0; overflow: hidden;">
          <div class="table-container">
            <table class="table">
              <thead>
                <tr>
                  <th>Ativo</th>
                  <th>Descrição</th>
                  <th>Categoria</th>
                  <th>Vencimento</th>
                  <th class="text-right">Valor/mês</th>
                  <th class="text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                ${fixedList.map(f => {
                  const cat = getCategoryById(f.categoryId);
                  return `
                    <tr class="${f.active ? '' : 'row-inactive'}">
                      <td>
                        <label class="toggle-switch">
                          <input type="checkbox" class="fixed-toggle" data-id="${f.id}" ${f.active ? 'checked' : ''}>
                          <span class="toggle-track"></span>
                        </label>
                      </td>
                      <td>
                        <span class="transaction-desc ${f.active ? '' : 'text-muted'}">${escapeHtml(f.description)}</span>
                      </td>
                      <td>
                        <div class="transaction-category">
                          <span>${cat ? cat.icon : '📦'}</span>
                          <span>${cat ? escapeHtml(cat.name) : 'Outros'}</span>
                        </div>
                      </td>
                      <td>
                        <span class="badge badge-fixed">Dia ${f.dueDay || 1}</span>
                      </td>
                      <td class="text-right">
                        <span class="transaction-amount expense ${f.active ? '' : 'text-muted'}">
                          - ${formatCurrency(f.amount)}
                        </span>
                      </td>
                      <td>
                        <div class="table-actions">
                          <button class="btn btn-ghost btn-sm btn-edit-fixed" data-id="${f.id}" title="Editar">
                            ${icons.edit}
                          </button>
                          <button class="btn btn-ghost btn-sm btn-delete-fixed" data-id="${f.id}" title="Excluir" style="color: var(--color-danger-500);">
                            ${icons.trash}
                          </button>
                        </div>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `}
    </div>
  `;

  // Bind events
  document.getElementById('btn-add-fixed')?.addEventListener('click', () => openFixedModal());
  document.getElementById('btn-add-fixed-empty')?.addEventListener('click', () => openFixedModal());

  container.querySelectorAll('.fixed-toggle').forEach(cb => {
    cb.addEventListener('change', () => {
      toggleFixedExpense(cb.dataset.id);
      renderFixedContent();
    });
  });

  container.querySelectorAll('.btn-edit-fixed').forEach(btn => {
    btn.addEventListener('click', () => {
      const f = getFixedExpenses().find(x => x.id === btn.dataset.id);
      if (f) openFixedModal(f);
    });
  });

  container.querySelectorAll('.btn-delete-fixed').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('Deseja realmente excluir este gasto fixo?')) {
        deleteFixedExpense(btn.dataset.id);
        showToast('Gasto fixo removido', 'success');
        renderFixedContent();
      }
    });
  });
}

function openFixedModal(editItem = null) {
  const categories = getCategories();
  const isEdit = !!editItem;
  const title = isEdit ? 'Editar Gasto Fixo' : 'Novo Gasto Fixo';

  const body = `
    <form id="fixed-form">
      <div class="form-group">
        <label class="form-label">Descrição</label>
        <input class="form-input" type="text" id="fixed-description"
          placeholder="Ex: Plano internet, Aluguel..." value="${isEdit ? escapeHtml(editItem.description) : ''}" required />
      </div>

      <div class="form-group">
        <label class="form-label">Categoria</label>
        <select class="form-input" id="fixed-category">
          <option value="">Selecione...</option>
          ${categories.map(c => `<option value="${c.id}" ${isEdit && editItem.categoryId === c.id ? 'selected' : ''}>${c.icon} ${c.name}</option>`).join('')}
        </select>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4);">
        <div class="form-group">
          <label class="form-label">Valor (R$)</label>
          <input class="form-input" type="number" id="fixed-amount"
            placeholder="0,00" step="0.01" min="0.01" value="${isEdit ? editItem.amount : ''}" required />
        </div>
        <div class="form-group">
          <label class="form-label">Dia de vencimento</label>
          <input class="form-input" type="number" id="fixed-dueday"
            placeholder="1 a 31" min="1" max="31" value="${isEdit ? (editItem.dueDay || 1) : 1}" required />
        </div>
      </div>
    </form>
  `;

  const footer = `
    <button class="btn btn-secondary" id="fixed-cancel">Cancelar</button>
    <button class="btn btn-primary" id="fixed-save">${isEdit ? 'Salvar' : 'Adicionar'}</button>
  `;

  openModal(title, body, footer);

  document.getElementById('fixed-cancel').addEventListener('click', closeModal);

  document.getElementById('fixed-save').addEventListener('click', () => {
    const description = document.getElementById('fixed-description').value.trim();
    const categoryId = document.getElementById('fixed-category').value;
    const amount = parseFloat(document.getElementById('fixed-amount').value);
    const dueDay = parseInt(document.getElementById('fixed-dueday').value, 10);

    if (!description || !categoryId || !amount || !dueDay) {
      showToast('Preencha todos os campos', 'error');
      return;
    }

    if (dueDay < 1 || dueDay > 31) {
      showToast('Dia deve ser entre 1 e 31', 'error');
      return;
    }

    if (isEdit) {
      updateFixedExpense(editItem.id, { description, categoryId, amount, dueDay });
      showToast('Gasto fixo atualizado!', 'success');
    } else {
      addFixedExpense({ description, categoryId, amount, dueDay });
      showToast('Gasto fixo adicionado!', 'success');
    }

    closeModal();
    renderFixedContent();
  });
}
