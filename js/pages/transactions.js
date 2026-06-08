// ============================================
// FINANÇAS PRO — Transactions Page
// ============================================

import { icons, formatCurrency, formatDate, escapeHtml, getTodayStr } from '../utils.js';
import { getFilteredTransactions, getCategories, getCategoryById, addTransaction, updateTransaction, deleteTransaction } from '../storage.js';
import { getFilterDates, renderFilter, onFilterChange } from '../components/filters.js';
import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js';
import { renderHeader, bindHeaderEvents } from '../components/header.js';
import { openModal, closeModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { destroyAllCharts } from '../components/charts.js';

let searchTerm = '';

export function renderTransactions() {
  destroyAllCharts();
  const app = document.getElementById('app');

  app.innerHTML = `
    <div class="app-shell">
      ${renderSidebar()}
      <div class="app-main">
        ${renderHeader('Movimentações')}
        <div class="content">
          <div id="filter-container" style="margin-bottom: var(--space-5);"></div>
          <div class="transactions-header">
            <div class="transactions-filters">
              <div class="search-input">
                ${icons.search}
                <input type="text" id="tx-search" placeholder="Buscar movimentação..." value="${searchTerm}">
              </div>
            </div>
            <button class="btn btn-primary" id="btn-add-tx">
              ${icons.plus}
              <span>Adicionar</span>
            </button>
          </div>
          <div id="transactions-list"></div>
        </div>
      </div>
    </div>
  `;

  bindSidebarEvents();
  bindHeaderEvents();
  renderFilter('filter-container');

  renderTransactionsList();

  // Add button
  document.getElementById('btn-add-tx').addEventListener('click', () => openTransactionModal());

  // Search
  document.getElementById('tx-search').addEventListener('input', (e) => {
    searchTerm = e.target.value;
    renderTransactionsList();
  });

  onFilterChange(() => renderTransactionsList());
}

function renderTransactionsList() {
  const container = document.getElementById('transactions-list');
  if (!container) return;

  const dates = getFilterDates();
  let transactions = getFilteredTransactions(dates.start, dates.end);

  // Apply search
  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    transactions = transactions.filter(t => {
      const cat = getCategoryById(t.categoryId);
      return t.description.toLowerCase().includes(term) ||
        (cat && cat.name.toLowerCase().includes(term));
    });
  }

  // Sort by date desc
  transactions.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt?.localeCompare(a.createdAt || ''));

  if (transactions.length === 0) {
    container.innerHTML = `
      <div class="card">
        <div class="empty-state">
          ${icons.emptyBox}
          <h3>Nenhuma movimentação</h3>
          <p>Adicione sua primeira movimentação clicando no botão acima.</p>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="card animate-fade-in-up" style="padding: 0; overflow: hidden;">
      <div class="table-container">
        <table class="table">
          <thead>
            <tr>
              <th>Descrição</th>
              <th>Categoria</th>
              <th>Data</th>
              <th>Natureza</th>
              <th class="text-right">Valor</th>
              <th class="text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            ${transactions.map(t => {
              const cat = getCategoryById(t.categoryId);
              return `
                <tr>
                  <td>
                    <span class="transaction-desc">${escapeHtml(t.description)}</span>
                  </td>
                  <td>
                    <div class="transaction-category">
                      <span style="font-size: 16px;">${cat ? cat.icon : '📦'}</span>
                      <span>${cat ? escapeHtml(cat.name) : 'Outros'}</span>
                    </div>
                  </td>
                  <td><span class="transaction-date">${formatDate(t.date)}</span></td>
                  <td>
                    <span class="badge ${t.nature === 'fixed' ? 'badge-fixed' : 'badge-variable'}">
                      ${t.nature === 'fixed' ? 'Fixo' : 'Variável'}
                    </span>
                  </td>
                  <td class="text-right">
                    <span class="transaction-amount ${t.type}">
                      ${t.type === 'income' ? '+' : '-'} ${formatCurrency(t.amount)}
                    </span>
                  </td>
                  <td>
                    <div class="table-actions">
                      <button class="btn btn-ghost btn-sm btn-edit-tx" data-id="${t.id}" title="Editar">
                        ${icons.edit}
                      </button>
                      <button class="btn btn-ghost btn-sm btn-delete-tx" data-id="${t.id}" title="Excluir" style="color: var(--color-danger-500);">
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
  `;

  // Bind edit/delete
  container.querySelectorAll('.btn-edit-tx').forEach(btn => {
    btn.addEventListener('click', () => {
      const tx = transactions.find(t => t.id === btn.dataset.id);
      if (tx) openTransactionModal(tx);
    });
  });

  container.querySelectorAll('.btn-delete-tx').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('Deseja realmente excluir esta movimentação?')) {
        deleteTransaction(btn.dataset.id);
        showToast('Movimentação excluída', 'success');
        renderTransactionsList();
      }
    });
  });
}

function openTransactionModal(editTx = null) {
  const categories = getCategories();
  const isEdit = !!editTx;
  const title = isEdit ? 'Editar Movimentação' : 'Nova Movimentação';

  const body = `
    <form id="tx-form">
      <div class="form-group">
        <label class="form-label">Descrição</label>
        <input class="form-input" type="text" id="tx-description" placeholder="Ex: Almoço" value="${isEdit ? escapeHtml(editTx.description) : ''}" required>
      </div>

      <div class="form-group">
        <label class="form-label">Tipo</label>
        <div class="toggle-group" id="tx-type-toggle">
          <span class="toggle-option ${!isEdit || editTx.type === 'expense' ? 'active active-expense' : ''}" data-value="expense">Despesa</span>
          <span class="toggle-option ${isEdit && editTx.type === 'income' ? 'active active-income' : ''}" data-value="income">Receita</span>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Categoria</label>
        <select class="form-input" id="tx-category">
          <option value="">Selecione...</option>
          ${categories.map(c => `<option value="${c.id}" ${isEdit && editTx.categoryId === c.id ? 'selected' : ''}>${c.icon} ${c.name}</option>`).join('')}
        </select>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4);">
        <div class="form-group">
          <label class="form-label">Valor (R$)</label>
          <input class="form-input" type="number" id="tx-amount" placeholder="0,00" step="0.01" min="0.01" value="${isEdit ? editTx.amount : ''}" required>
        </div>
        <div class="form-group">
          <label class="form-label">Data</label>
          <input class="form-input" type="date" id="tx-date" value="${isEdit ? editTx.date : getTodayStr()}" required>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Natureza</label>
        <div class="toggle-group" id="tx-nature-toggle">
          <span class="toggle-option ${!isEdit || editTx.nature === 'variable' ? 'active' : ''}" data-value="variable">Variável</span>
          <span class="toggle-option ${isEdit && editTx.nature === 'fixed' ? 'active' : ''}" data-value="fixed">Fixo</span>
        </div>
      </div>
    </form>
  `;

  const footer = `
    <button class="btn btn-secondary" id="tx-cancel">Cancelar</button>
    <button class="btn btn-primary" id="tx-save">${isEdit ? 'Salvar' : 'Adicionar'}</button>
  `;

  openModal(title, body, footer);

  // Toggle groups
  document.querySelectorAll('.toggle-group').forEach(group => {
    group.querySelectorAll('.toggle-option').forEach(opt => {
      opt.addEventListener('click', () => {
        group.querySelectorAll('.toggle-option').forEach(o => {
          o.classList.remove('active', 'active-income', 'active-expense');
        });
        opt.classList.add('active');
        if (group.id === 'tx-type-toggle') {
          opt.classList.add(opt.dataset.value === 'income' ? 'active-income' : 'active-expense');
        }
      });
    });
  });

  // Cancel
  document.getElementById('tx-cancel').addEventListener('click', closeModal);

  // Save
  document.getElementById('tx-save').addEventListener('click', () => {
    const description = document.getElementById('tx-description').value.trim();
    const categoryId = document.getElementById('tx-category').value;
    const amount = parseFloat(document.getElementById('tx-amount').value);
    const date = document.getElementById('tx-date').value;
    const type = document.querySelector('#tx-type-toggle .active')?.dataset.value || 'expense';
    const nature = document.querySelector('#tx-nature-toggle .active')?.dataset.value || 'variable';

    if (!description || !categoryId || !amount || !date) {
      showToast('Preencha todos os campos', 'error');
      return;
    }

    if (isEdit) {
      updateTransaction(editTx.id, { description, categoryId, amount, date, type, nature });
      showToast('Movimentação atualizada!', 'success');
    } else {
      addTransaction({ description, categoryId, amount, date, type, nature });
      showToast('Movimentação adicionada!', 'success');
    }

    closeModal();
    renderTransactionsList();
  });
}
