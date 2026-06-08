// ============================================
// FINANÇAS PRO — Period Filter Component
// ============================================

import { getDateRange } from '../utils.js';

let currentFilter = 'current';
let customStart = '';
let customEnd = '';
const listeners = [];

export function getCurrentFilter() {
  return currentFilter;
}

export function getFilterDates() {
  if (currentFilter === 'custom' && customStart && customEnd) {
    return { start: customStart, end: customEnd };
  }
  return getDateRange(currentFilter);
}

export function onFilterChange(callback) {
  listeners.push(callback);
}

function notifyListeners() {
  const dates = getFilterDates();
  listeners.forEach(cb => cb(currentFilter, dates));
}

export function renderFilter(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const options = [
    { value: 'current', label: 'Mês Atual' },
    { value: 'previous', label: 'Mês Anterior' },
    { value: 'last3', label: '3 Meses' },
    { value: 'last6', label: '6 Meses' },
    { value: 'last12', label: '12 Meses' },
    { value: 'custom', label: 'Personalizado' },
  ];

  container.innerHTML = `
    <div class="period-filter" id="period-filter">
      ${options.map(o => `
        <span class="filter-option ${o.value === currentFilter ? 'active' : ''}" data-filter="${o.value}">
          ${o.label}
        </span>
      `).join('')}
    </div>
    <div class="date-range-picker" id="date-range-picker" style="display: ${currentFilter === 'custom' ? 'flex' : 'none'}; margin-top: 8px;">
      <input type="date" id="filter-start" value="${customStart}">
      <span style="color: var(--color-gray-400);">até</span>
      <input type="date" id="filter-end" value="${customEnd}">
      <button class="btn btn-sm btn-primary" id="filter-apply-custom">Aplicar</button>
    </div>
  `;

  // Click handlers
  container.querySelectorAll('.filter-option').forEach(el => {
    el.addEventListener('click', () => {
      currentFilter = el.dataset.filter;

      container.querySelectorAll('.filter-option').forEach(o => o.classList.remove('active'));
      el.classList.add('active');

      const picker = document.getElementById('date-range-picker');
      if (picker) {
        picker.style.display = currentFilter === 'custom' ? 'flex' : 'none';
      }

      if (currentFilter !== 'custom') {
        notifyListeners();
      }
    });
  });

  // Custom date apply
  const applyBtn = document.getElementById('filter-apply-custom');
  if (applyBtn) {
    applyBtn.addEventListener('click', () => {
      customStart = document.getElementById('filter-start').value;
      customEnd = document.getElementById('filter-end').value;
      if (customStart && customEnd) {
        notifyListeners();
      }
    });
  }
}

export function getFilterLabel() {
  const labels = {
    current: 'Mês Atual',
    previous: 'Mês Anterior',
    last3: 'Últimos 3 Meses',
    last6: 'Últimos 6 Meses',
    last12: 'Últimos 12 Meses',
    custom: 'Período Personalizado',
  };
  return labels[currentFilter] || 'Mês Atual';
}
