// ============================================
// FINANÇAS PRO — Categories Page
// ============================================

import { icons, escapeHtml, getCategoryColor } from '../utils.js';
import { getCategories, addCategory, updateCategory, deleteCategory, getCategoryById } from '../storage.js';
import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js';
import { renderHeader, bindHeaderEvents } from '../components/header.js';
import { openModal, closeModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { destroyAllCharts } from '../components/charts.js';

const EMOJI_OPTIONS = [
  '🍽️','🛒','🍕','📱','🏠','💧','⚡','🌐','🚗','⛽','🏥','💪','📚','🎮','📈','💳','📦','💰',
  '✈️','🎬','👕','💊','🐾','🎓','🍺','☕','🎁','🏋️','🎸','📷','🎯','🛍️','🧴','💈','🎪','🏖️',
];

const COLOR_OPTIONS = [
  '#3B82F6','#EF4444','#22C55E','#F59E0B','#A855F7','#06B6D4','#EC4899',
  '#F97316','#14B8A6','#8B5CF6','#6366F1','#84CC16','#0EA5E9','#E11D48',
  '#D946EF','#10B981','#FB923C','#64748B',
];

export function renderCategories() {
  destroyAllCharts();
  const app = document.getElementById('app');

  app.innerHTML = `
    <div class="app-shell">
      ${renderSidebar()}
      <div class="app-main">
        ${renderHeader('Categorias')}
        <div class="content">
          <div id="categories-content"></div>
        </div>
      </div>
    </div>
  `;

  bindSidebarEvents();
  bindHeaderEvents();
  renderCategoriesContent();
}

function renderCategoriesContent() {
  const container = document.getElementById('categories-content');
  if (!container) return;

  const categories = getCategories();
  const defaults = categories.filter(c => c.isDefault);
  const custom = categories.filter(c => !c.isDefault);

  container.innerHTML = `
    <!-- Header -->
    <div class="categories-header animate-fade-in-up">
      <div>
        <p class="categories-desc">Gerencie suas categorias personalizadas de receitas e despesas.</p>
      </div>
      <button class="btn btn-primary" id="btn-add-category">
        ${icons.plus}
        <span>Nova Categoria</span>
      </button>
    </div>

    <!-- Custom Categories -->
    ${custom.length > 0 ? `
      <div class="animate-fade-in-up stagger-1">
        <h3 class="section-title">Categorias Personalizadas</h3>
        <div class="categories-grid">
          ${custom.map(c => renderCategoryCard(c, true)).join('')}
        </div>
      </div>
    ` : ''}

    <!-- Default Categories -->
    <div class="animate-fade-in-up stagger-2">
      <h3 class="section-title">Categorias Padrão</h3>
      <div class="categories-grid">
        ${defaults.map(c => renderCategoryCard(c, false)).join('')}
      </div>
    </div>
  `;

  // Bind add
  document.getElementById('btn-add-category').addEventListener('click', () => openCategoryModal());

  // Bind edit/delete on custom
  container.querySelectorAll('.btn-edit-cat').forEach(btn => {
    btn.addEventListener('click', () => {
      const cat = getCategoryById(btn.dataset.id);
      if (cat) openCategoryModal(cat);
    });
  });

  container.querySelectorAll('.btn-delete-cat').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('Deseja excluir esta categoria? As movimentações vinculadas não serão afetadas.')) {
        deleteCategory(btn.dataset.id);
        showToast('Categoria excluída', 'success');
        renderCategoriesContent();
      }
    });
  });
}

function renderCategoryCard(cat, isEditable) {
  return `
    <div class="category-card" style="--cat-color: ${cat.color};">
      <div class="category-card-icon">${cat.icon}</div>
      <div class="category-card-info">
        <div class="category-card-name">${escapeHtml(cat.name)}</div>
        <div class="category-card-badge ${cat.isDefault ? 'badge-default' : 'badge-custom'}">
          ${cat.isDefault ? 'Padrão' : 'Personalizada'}
        </div>
      </div>
      ${isEditable ? `
        <div class="category-card-actions">
          <button class="btn btn-ghost btn-sm btn-edit-cat" data-id="${cat.id}" title="Editar">
            ${icons.edit}
          </button>
          <button class="btn btn-ghost btn-sm btn-delete-cat" data-id="${cat.id}" title="Excluir" style="color: var(--color-danger-500);">
            ${icons.trash}
          </button>
        </div>
      ` : ''}
    </div>
  `;
}

function openCategoryModal(editCat = null) {
  const isEdit = !!editCat;
  const title = isEdit ? 'Editar Categoria' : 'Nova Categoria';

  let selectedEmoji = isEdit ? editCat.icon : EMOJI_OPTIONS[0];
  let selectedColor = isEdit ? editCat.color : COLOR_OPTIONS[0];

  const body = `
    <div id="cat-form">
      <div class="form-group">
        <label class="form-label">Nome da categoria</label>
        <input class="form-input" type="text" id="cat-name"
          placeholder="Ex: Streaming, Pet, Viagens..." value="${isEdit ? escapeHtml(editCat.name) : ''}" required />
      </div>

      <div class="form-group">
        <label class="form-label">Ícone</label>
        <div class="emoji-picker">
          ${EMOJI_OPTIONS.map(e => `
            <button type="button" class="emoji-option ${e === selectedEmoji ? 'selected' : ''}" data-emoji="${e}">${e}</button>
          `).join('')}
        </div>
        <div class="emoji-selected-preview">
          Selecionado: <span id="emoji-preview">${selectedEmoji}</span>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Cor</label>
        <div class="color-picker">
          ${COLOR_OPTIONS.map(col => `
            <button type="button" class="color-option ${col === selectedColor ? 'selected' : ''}"
              data-color="${col}" style="background: ${col};">
              ${col === selectedColor ? '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
            </button>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  const footer = `
    <button class="btn btn-secondary" id="cat-cancel">Cancelar</button>
    <button class="btn btn-primary" id="cat-save">${isEdit ? 'Salvar' : 'Criar'}</button>
  `;

  openModal(title, body, footer);

  // Emoji picker
  document.querySelectorAll('.emoji-option').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.emoji-option').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedEmoji = btn.dataset.emoji;
      document.getElementById('emoji-preview').textContent = selectedEmoji;
    });
  });

  // Color picker
  document.querySelectorAll('.color-option').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.color-option').forEach(b => {
        b.classList.remove('selected');
        b.innerHTML = '';
      });
      btn.classList.add('selected');
      btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
      selectedColor = btn.dataset.color;
    });
  });

  document.getElementById('cat-cancel').addEventListener('click', closeModal);

  document.getElementById('cat-save').addEventListener('click', () => {
    const name = document.getElementById('cat-name').value.trim();
    if (!name) {
      showToast('Digite um nome para a categoria', 'error');
      return;
    }

    if (isEdit) {
      updateCategory(editCat.id, { name, icon: selectedEmoji, color: selectedColor });
      showToast('Categoria atualizada!', 'success');
    } else {
      addCategory({ name, icon: selectedEmoji, color: selectedColor });
      showToast('Categoria criada!', 'success');
    }

    closeModal();
    renderCategoriesContent();
  });
}
