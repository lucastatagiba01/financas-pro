// ============================================
// FINANÇAS PRO — Goals (Metas) Page
// ============================================

import { icons, formatCurrency, escapeHtml, getTodayStr } from '../utils.js';
import {
  getGoals, addGoal, updateGoal, deleteGoal,
  getUserTransactions, getCategories, getCategoryById,
} from '../storage.js';
import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js';
import { renderHeader, bindHeaderEvents } from '../components/header.js';
import { openModal, closeModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { destroyAllCharts } from '../components/charts.js';

const GOAL_TYPES = {
  savings:       { label: 'Poupança',              icon: '💰', color: '#22C55E' },
  expense_limit: { label: 'Limite de Gasto',       icon: '🧾', color: '#EF4444' },
  income:        { label: 'Meta de Receita',        icon: '📈', color: '#3B82F6' },
  emergency:     { label: 'Reserva de Emergência', icon: '🛡️', color: '#F59E0B' },
};

const GOAL_ICONS = ['🎯','💰','🏠','✈️','🚗','📚','💊','💍','🎓','🛡️','📈','🎮','🌴','💻','🎁','🏖️','🏋️','🎵','🐶','👶'];
const GOAL_COLORS = ['#22C55E','#3B82F6','#F59E0B','#EF4444','#8B5CF6','#EC4899','#06B6D4','#F97316','#14B8A6','#6366F1'];

let activeFilter = 'all';
let statusFilter = 'active';

// ── Entry point ───────────────────────────────────────────────────────────────

export function renderGoals() {
  destroyAllCharts();
  const app = document.getElementById('app');

  app.innerHTML = `
    <div class="app-shell">
      ${renderSidebar()}
      <div class="app-main">
        ${renderHeader('Metas')}
        <div class="content">
          <div id="goals-content"></div>
        </div>
      </div>
    </div>
  `;

  bindSidebarEvents();
  bindHeaderEvents();
  renderGoalsContent();
}

// ── Progress computation ──────────────────────────────────────────────────────

function computeGoalProgress(goal, allTransactions) {
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const monthEnd   = getTodayStr();

  if (goal.type === 'expense_limit') {
    const txs = allTransactions.filter(t =>
      t.type === 'expense' &&
      (!goal.categoryId || t.categoryId === goal.categoryId) &&
      t.date >= monthStart && t.date <= monthEnd
    );
    return txs.reduce((s, t) => s + t.amount, 0);
  }

  if (goal.type === 'income') {
    const txs = allTransactions.filter(t =>
      t.type === 'income' &&
      t.date >= monthStart && t.date <= monthEnd
    );
    return txs.reduce((s, t) => s + t.amount, 0);
  }

  return goal.currentAmount || 0;
}

function computeGoalStatus(goal, current) {
  const now      = new Date();
  const deadline = goal.deadline ? new Date(goal.deadline + 'T00:00:00') : null;
  const pct      = goal.targetAmount > 0 ? (current / goal.targetAmount) * 100 : 0;

  if (goal.type === 'expense_limit') {
    if (pct >= 100) return { label: 'Excedido',  cls: 'danger',  color: '#EF4444' };
    if (pct >= 80)  return { label: 'Em Risco',  cls: 'warning', color: '#F59E0B' };
    return               { label: 'No Prazo',   cls: 'success', color: '#22C55E' };
  }

  if (pct >= 100) return { label: 'Concluída', cls: 'success', color: '#22C55E' };
  if (deadline && deadline < now) return { label: 'Atrasada', cls: 'danger', color: '#EF4444' };

  if (deadline) {
    const createdAt    = new Date(goal.createdAt);
    const totalDays    = Math.max(1, (deadline - createdAt) / 86400000);
    const elapsed      = Math.max(0, (now - createdAt) / 86400000);
    const expectedPct  = (elapsed / totalDays) * 100;
    if (pct < expectedPct * 0.6) return { label: 'Em Risco', cls: 'warning', color: '#F59E0B' };
  }

  return { label: 'No Prazo', cls: 'success', color: '#22C55E' };
}

// ── Main render ───────────────────────────────────────────────────────────────

function renderGoalsContent() {
  const container = document.getElementById('goals-content');
  if (!container) return;

  const allTransactions = getUserTransactions();
  const goals           = getGoals();
  const categories      = getCategories();

  const goalsEnriched = goals.map(g => {
    const current = computeGoalProgress(g, allTransactions);
    const status  = computeGoalStatus(g, current);
    const pct     = g.targetAmount > 0 ? Math.min((current / g.targetAmount) * 100, 100) : 0;
    return { ...g, current, status, pct };
  });

  const total     = goalsEnriched.length;
  const onTrack   = goalsEnriched.filter(g => g.status.cls === 'success' && g.pct < 100).length;
  const completed = goalsEnriched.filter(g => g.pct >= 100).length;
  const atRisk    = goalsEnriched.filter(g => g.status.cls === 'warning' || g.status.cls === 'danger').length;

  let filtered = goalsEnriched;
  if (activeFilter !== 'all') filtered = filtered.filter(g => g.type === activeFilter);
  if (statusFilter === 'active')    filtered = filtered.filter(g => g.pct < 100 && g.status.label !== 'Concluída');
  if (statusFilter === 'completed') filtered = filtered.filter(g => g.pct >= 100 || g.status.label === 'Concluída');

  container.innerHTML = `
    <!-- Page header -->
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-5);">
      <div>
        <h2 style="margin:0;font-size:var(--font-size-xl);font-weight:700;color:var(--color-gray-900);">Minhas Metas</h2>
        <p style="margin:4px 0 0;font-size:var(--font-size-sm);color:var(--color-gray-400);">Acompanhe seus objetivos financeiros</p>
      </div>
      <button class="btn btn-primary" id="btn-add-goal">
        ${icons.plus} Nova Meta
      </button>
    </div>

    <!-- KPI strip -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:var(--space-3);margin-bottom:var(--space-5);">
      ${[
        { label: 'Total de Metas', value: total,     emoji: '🎯', color: '#6366F1' },
        { label: 'No Prazo',       value: onTrack,   emoji: '✅', color: '#22C55E' },
        { label: 'Em Risco',       value: atRisk,    emoji: '⚠️', color: '#F59E0B' },
        { label: 'Concluídas',     value: completed, emoji: '🏆', color: '#3B82F6' },
      ].map(s => `
        <div class="card animate-fade-in-up" style="padding:var(--space-4);display:flex;align-items:center;gap:var(--space-3);">
          <div style="font-size:1.5rem;line-height:1;">${s.emoji}</div>
          <div>
            <div style="font-size:var(--font-size-xs);color:var(--color-gray-400);font-weight:500;">${s.label}</div>
            <div style="font-size:var(--font-size-2xl);font-weight:800;color:${s.color};line-height:1.1;">${s.value}</div>
          </div>
        </div>
      `).join('')}
    </div>

    <!-- Filters -->
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-4);flex-wrap:wrap;gap:var(--space-3);">
      <div style="display:flex;gap:var(--space-2);flex-wrap:wrap;">
        ${[
          ['all',           'Todas'],
          ['savings',       '💰 Poupança'],
          ['expense_limit', '🧾 Limite de Gasto'],
          ['income',        '📈 Receita'],
          ['emergency',     '🛡️ Reserva'],
        ].map(([key, lbl]) => `
          <button class="btn btn-sm ${activeFilter === key ? 'btn-primary' : 'btn-secondary'}" data-goal-filter="${key}">${lbl}</button>
        `).join('')}
      </div>
      <div style="display:flex;gap:var(--space-2);">
        ${[
          ['active',    'Ativas'],
          ['completed', 'Concluídas'],
          ['all',       'Todas'],
        ].map(([key, lbl]) => `
          <button class="btn btn-sm ${statusFilter === key ? 'btn-primary' : 'btn-secondary'}" data-status-filter="${key}">${lbl}</button>
        `).join('')}
      </div>
    </div>

    <!-- Goals grid -->
    ${filtered.length === 0 ? `
      <div class="card">
        <div class="empty-state">
          ${icons.emptyBox}
          <h3>Nenhuma meta encontrada</h3>
          <p>Crie sua primeira meta clicando em "+ Nova Meta".</p>
        </div>
      </div>
    ` : `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:var(--space-4);">
        ${filtered.map(g => renderGoalCard(g, categories)).join('')}
      </div>
    `}

    <!-- Legend for auto-tracked types -->
    ${goals.some(g => g.type === 'expense_limit' || g.type === 'income') ? `
      <div style="margin-top:var(--space-4);padding:var(--space-3) var(--space-4);background:var(--color-gray-50);border-radius:12px;font-size:var(--font-size-xs);color:var(--color-gray-400);display:flex;align-items:center;gap:var(--space-2);">
        ${icons.info || ''}
        <span>⚡ Limite de gasto e meta de receita são atualizados automaticamente com base nas movimentações do mês atual.</span>
      </div>
    ` : ''}
  `;

  // Filter buttons
  container.querySelectorAll('[data-goal-filter]').forEach(btn => {
    btn.addEventListener('click', () => { activeFilter = btn.dataset.goalFilter; renderGoalsContent(); });
  });
  container.querySelectorAll('[data-status-filter]').forEach(btn => {
    btn.addEventListener('click', () => { statusFilter = btn.dataset.statusFilter; renderGoalsContent(); });
  });

  document.getElementById('btn-add-goal').addEventListener('click', () => openGoalModal());

  container.querySelectorAll('[data-edit-goal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const goal = goals.find(g => g.id === btn.dataset.editGoal);
      if (goal) openGoalModal(goal);
    });
  });

  container.querySelectorAll('[data-delete-goal]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('Deseja excluir esta meta?')) {
        deleteGoal(btn.dataset.deleteGoal);
        showToast('Meta excluída', 'success');
        renderGoalsContent();
      }
    });
  });

  container.querySelectorAll('[data-update-progress]').forEach(btn => {
    btn.addEventListener('click', () => {
      const goal = goals.find(g => g.id === btn.dataset.updateProgress);
      if (goal) openUpdateProgressModal(goal);
    });
  });
}

// ── Goal card ─────────────────────────────────────────────────────────────────

function renderGoalCard(goal, categories) {
  const typeInfo = GOAL_TYPES[goal.type] || GOAL_TYPES.savings;
  const cat      = goal.categoryId ? getCategoryById(goal.categoryId) : null;
  const now      = new Date();
  const deadline = goal.deadline ? new Date(goal.deadline + 'T00:00:00') : null;
  const daysLeft = deadline ? Math.ceil((deadline - now) / 86400000) : null;
  const accentColor = goal.color || typeInfo.color;

  const barColor = goal.type === 'expense_limit'
    ? (goal.pct >= 100 ? '#EF4444' : goal.pct >= 80 ? '#F59E0B' : '#22C55E')
    : (goal.pct >= 100 ? '#22C55E' : accentColor);

  const isAutoTracked = goal.type === 'expense_limit' || goal.type === 'income';
  const canUpdateProgress = !isAutoTracked;

  return `
    <div class="card animate-fade-in-up" style="padding:0;overflow:hidden;border-top:4px solid ${accentColor};">
      <!-- Header -->
      <div style="padding:var(--space-4) var(--space-4) var(--space-2);display:flex;justify-content:space-between;align-items:flex-start;">
        <div style="display:flex;align-items:center;gap:var(--space-3);flex:1;min-width:0;">
          <div style="width:44px;height:44px;border-radius:12px;background:${accentColor}18;display:flex;align-items:center;justify-content:center;font-size:1.4rem;flex-shrink:0;">
            ${goal.icon || typeInfo.icon}
          </div>
          <div style="min-width:0;">
            <div style="font-size:var(--font-size-sm);font-weight:700;color:var(--color-gray-900);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(goal.name)}</div>
            <div style="display:flex;align-items:center;gap:5px;margin-top:3px;flex-wrap:wrap;">
              <span style="font-size:10px;font-weight:600;padding:2px 7px;border-radius:999px;background:${typeInfo.color}18;color:${typeInfo.color};">${typeInfo.label}</span>
              ${cat ? `<span style="font-size:10px;color:var(--color-gray-400);">${cat.icon} ${escapeHtml(cat.name)}</span>` : ''}
              ${isAutoTracked ? `<span style="font-size:9px;color:var(--color-gray-300);font-style:italic;">⚡ auto</span>` : ''}
            </div>
          </div>
        </div>
        <div style="display:flex;gap:2px;flex-shrink:0;margin-left:var(--space-2);">
          ${canUpdateProgress ? `
            <button class="btn btn-ghost btn-sm" data-update-progress="${goal.id}" title="Atualizar progresso"
              style="padding:4px 8px;font-size:13px;font-weight:700;color:${accentColor};">+
            </button>` : ''}
          <button class="btn btn-ghost btn-sm" data-edit-goal="${goal.id}" title="Editar">${icons.edit}</button>
          <button class="btn btn-ghost btn-sm" data-delete-goal="${goal.id}" title="Excluir" style="color:var(--color-danger-500);">${icons.trash}</button>
        </div>
      </div>

      <!-- Progress -->
      <div style="padding:var(--space-2) var(--space-4) var(--space-3);">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;">
          <div>
            <span style="font-size:var(--font-size-xl);font-weight:800;color:var(--color-gray-900);">${formatCurrency(goal.current)}</span>
            <span style="font-size:var(--font-size-xs);color:var(--color-gray-400);"> / ${formatCurrency(goal.targetAmount)}</span>
          </div>
          <span style="font-size:var(--font-size-sm);font-weight:700;color:${barColor};">${goal.pct.toFixed(1)}%</span>
        </div>
        <div style="height:8px;border-radius:999px;background:var(--color-gray-100);overflow:hidden;">
          <div style="height:100%;width:${goal.pct}%;border-radius:999px;background:${barColor};transition:width .5s ease;"></div>
        </div>
      </div>

      <!-- Footer -->
      <div style="padding:var(--space-2) var(--space-4) var(--space-4);display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--color-gray-100);">
        <span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;padding:3px 10px;border-radius:999px;background:${goal.status.color}15;color:${goal.status.color};">
          ${goal.status.label}
        </span>
        ${deadline ? `
          <span style="font-size:var(--font-size-xs);color:${daysLeft !== null && daysLeft < 0 ? 'var(--color-danger-500)' : daysLeft !== null && daysLeft < 30 ? '#F59E0B' : 'var(--color-gray-400)'};">
            ${daysLeft === null ? '' : daysLeft < 0 ? `Venceu há ${Math.abs(daysLeft)}d` : daysLeft === 0 ? 'Vence hoje' : `${daysLeft}d restantes`}
          </span>
        ` : `<span style="font-size:var(--font-size-xs);color:var(--color-gray-300);">Sem prazo</span>`}
      </div>
    </div>
  `;
}

// ── Modal: add / edit goal ────────────────────────────────────────────────────

function openGoalModal(editGoal = null) {
  const isEdit     = !!editGoal;
  const categories = getCategories();
  const title      = isEdit ? 'Editar Meta' : 'Nova Meta';

  const defaultIcon  = isEdit ? (editGoal.icon  || '🎯')     : '🎯';
  const defaultColor = isEdit ? (editGoal.color || '#3B82F6') : '#3B82F6';

  const body = `
    <form id="goal-form">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4);">

        <div class="form-group" style="grid-column:1/-1;">
          <label class="form-label">Nome da Meta *</label>
          <input class="form-input" type="text" id="goal-name"
            placeholder="Ex: Viagem para Europa"
            value="${isEdit ? escapeHtml(editGoal.name) : ''}" required>
        </div>

        <div class="form-group">
          <label class="form-label">Tipo *</label>
          <select class="form-input" id="goal-type">
            ${Object.entries(GOAL_TYPES).map(([k, v]) =>
              `<option value="${k}" ${isEdit && editGoal.type === k ? 'selected' : ''}>${v.icon} ${v.label}</option>`
            ).join('')}
          </select>
        </div>

        <div class="form-group" id="goal-category-group" style="${isEdit && editGoal.type === 'expense_limit' ? '' : 'display:none;'}">
          <label class="form-label">Categoria</label>
          <select class="form-input" id="goal-category">
            <option value="">— Todas as despesas —</option>
            ${categories.map(c =>
              `<option value="${c.id}" ${isEdit && editGoal.categoryId === c.id ? 'selected' : ''}>${c.icon} ${c.name}</option>`
            ).join('')}
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">Valor Alvo (R$) *</label>
          <input class="form-input" type="number" id="goal-target"
            step="0.01" min="0.01" placeholder="0,00"
            value="${isEdit ? editGoal.targetAmount : ''}">
        </div>

        <div class="form-group">
          <label class="form-label">Prazo</label>
          <input class="form-input" type="date" id="goal-deadline"
            value="${isEdit && editGoal.deadline ? editGoal.deadline : ''}">
        </div>

        ${isEdit && (editGoal.type === 'savings' || editGoal.type === 'emergency') ? `
        <div class="form-group" style="grid-column:1/-1;">
          <label class="form-label">Progresso Atual (R$)</label>
          <input class="form-input" type="number" id="goal-current"
            step="0.01" min="0" value="${editGoal.currentAmount || 0}">
        </div>` : ''}

        <!-- Icon picker -->
        <div class="form-group" style="grid-column:1/-1;">
          <label class="form-label">Ícone</label>
          <div style="display:flex;flex-wrap:wrap;gap:6px;padding:8px;background:var(--color-gray-50);border-radius:10px;">
            ${GOAL_ICONS.map(ic => `
              <button type="button" data-icon="${ic}"
                style="font-size:1.3rem;padding:5px;width:36px;height:36px;border-radius:8px;
                  border:2px solid ${defaultIcon === ic ? 'var(--color-primary-500)' : 'transparent'};
                  background:${defaultIcon === ic ? 'var(--color-primary-50)' : 'white'};
                  cursor:pointer;transition:all .15s;" class="goal-icon-btn">${ic}</button>
            `).join('')}
          </div>
          <input type="hidden" id="goal-icon" value="${defaultIcon}">
        </div>

        <!-- Color picker -->
        <div class="form-group" style="grid-column:1/-1;">
          <label class="form-label">Cor de Destaque</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            ${GOAL_COLORS.map(c => `
              <button type="button" data-color="${c}"
                style="width:28px;height:28px;border-radius:50%;background:${c};
                  border:3px solid ${defaultColor === c ? 'var(--color-gray-800)' : 'transparent'};
                  cursor:pointer;transition:border-color .15s;" class="goal-color-btn"></button>
            `).join('')}
          </div>
          <input type="hidden" id="goal-color" value="${defaultColor}">
        </div>

        <div class="form-group" style="grid-column:1/-1;">
          <label class="form-label">Observações</label>
          <textarea class="form-input" id="goal-notes" rows="2"
            placeholder="Opcional...">${isEdit ? escapeHtml(editGoal.notes || '') : ''}</textarea>
        </div>
      </div>
    </form>
  `;

  const footer = `
    <button class="btn btn-secondary" id="goal-cancel">Cancelar</button>
    <button class="btn btn-primary" id="goal-save">${isEdit ? 'Salvar' : 'Criar Meta'}</button>
  `;

  openModal(title, body, footer);

  // Show/hide category field
  document.getElementById('goal-type').addEventListener('change', e => {
    document.getElementById('goal-category-group').style.display =
      e.target.value === 'expense_limit' ? '' : 'none';
  });

  // Icon picker
  document.querySelectorAll('.goal-icon-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.goal-icon-btn').forEach(b => {
        b.style.borderColor = 'transparent';
        b.style.background  = 'white';
      });
      btn.style.borderColor = 'var(--color-primary-500)';
      btn.style.background  = 'var(--color-primary-50)';
      document.getElementById('goal-icon').value = btn.dataset.icon;
    });
  });

  // Color picker
  document.querySelectorAll('.goal-color-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.goal-color-btn').forEach(b => b.style.borderColor = 'transparent');
      btn.style.borderColor = 'var(--color-gray-800)';
      document.getElementById('goal-color').value = btn.dataset.color;
    });
  });

  document.getElementById('goal-cancel').addEventListener('click', closeModal);

  document.getElementById('goal-save').addEventListener('click', () => {
    const name         = document.getElementById('goal-name').value.trim();
    const type         = document.getElementById('goal-type').value;
    const targetAmount = parseFloat(document.getElementById('goal-target').value);
    const deadline     = document.getElementById('goal-deadline').value || null;
    const icon         = document.getElementById('goal-icon').value || '🎯';
    const color        = document.getElementById('goal-color').value || '#3B82F6';
    const categoryId   = document.getElementById('goal-category')?.value || null;
    const notes        = document.getElementById('goal-notes').value.trim();
    const currentEl    = document.getElementById('goal-current');
    const currentAmount = currentEl ? parseFloat(currentEl.value) || 0 : (isEdit ? editGoal.currentAmount || 0 : 0);

    if (!name || !targetAmount || targetAmount <= 0) {
      showToast('Preencha nome e valor alvo', 'error');
      return;
    }

    const data = {
      name, type, targetAmount, deadline, icon, color,
      categoryId: type === 'expense_limit' ? categoryId : null,
      notes, currentAmount,
    };

    if (isEdit) {
      updateGoal(editGoal.id, data);
      showToast('Meta atualizada!', 'success');
    } else {
      addGoal(data);
      showToast('Meta criada!', 'success');
    }

    closeModal();
    renderGoalsContent();
  });
}

// ── Modal: update progress ────────────────────────────────────────────────────

function openUpdateProgressModal(goal) {
  const typeInfo = GOAL_TYPES[goal.type] || GOAL_TYPES.savings;
  const accentColor = goal.color || typeInfo.color;

  const body = `
    <div style="text-align:center;padding:var(--space-2) 0 var(--space-4);">
      <div style="width:60px;height:60px;border-radius:16px;background:${accentColor}18;display:flex;align-items:center;justify-content:center;font-size:2rem;margin:0 auto var(--space-3);">
        ${goal.icon || typeInfo.icon}
      </div>
      <div style="font-weight:700;color:var(--color-gray-900);margin-bottom:var(--space-1);">${escapeHtml(goal.name)}</div>
      <div style="font-size:var(--font-size-xs);color:var(--color-gray-400);margin-bottom:var(--space-5);">Meta: ${formatCurrency(goal.targetAmount)}</div>
      <div class="form-group">
        <label class="form-label">Valor atual guardado (R$)</label>
        <input class="form-input" type="number" id="progress-amount"
          step="0.01" min="0" value="${goal.currentAmount || 0}"
          style="font-size:var(--font-size-xl);text-align:center;font-weight:800;">
      </div>
    </div>
  `;

  const footer = `
    <button class="btn btn-secondary" id="prog-cancel">Cancelar</button>
    <button class="btn btn-primary" id="prog-save">Salvar Progresso</button>
  `;

  openModal('Atualizar Progresso', body, footer);

  document.getElementById('prog-cancel').addEventListener('click', closeModal);
  document.getElementById('prog-save').addEventListener('click', () => {
    const amount = parseFloat(document.getElementById('progress-amount').value) || 0;
    updateGoal(goal.id, { currentAmount: amount });
    showToast('Progresso atualizado!', 'success');
    closeModal();
    renderGoalsContent();
  });
}
