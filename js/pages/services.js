// ============================================
// FINANÇAS PRO — Serviços & Bancos
// ============================================

import { icons, formatCurrency, formatDate, escapeHtml, getTodayStr } from '../utils.js';
import {
  getBanks, addBank, updateBank, deleteBank,
  getSubscriptions, addSubscription, updateSubscription, deleteSubscription, toggleSubscriptionActive,
  addTransaction, getCategories,
} from '../storage.js';
import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js';
import { renderHeader, bindHeaderEvents } from '../components/header.js';
import { openModal, closeModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { destroyAllCharts, createDoughnutChart } from '../components/charts.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const BANK_PRESETS = [
  { key: 'nubank',    name: 'Nubank',           color: '#820AD1' },
  { key: 'itau',      name: 'Itaú',             color: '#FF8C00' },
  { key: 'bradesco',  name: 'Bradesco',          color: '#CC0000' },
  { key: 'bb',        name: 'Banco do Brasil',   color: '#1A6BB5' },
  { key: 'santander', name: 'Santander',         color: '#EC0000' },
  { key: 'caixa',     name: 'Caixa',             color: '#0070AF' },
  { key: 'xp',        name: 'XP',               color: '#1A1A2E' },
  { key: 'inter',     name: 'Inter',             color: '#FF7A00' },
  { key: 'c6',        name: 'C6 Bank',           color: '#242424' },
  { key: 'picpay',    name: 'PicPay',            color: '#21C25E' },
  { key: 'neon',      name: 'Neon',              color: '#1282A2' },
  { key: 'sicoob',    name: 'Sicoob',            color: '#006B3F' },
  { key: 'custom',    name: 'Outro banco',       color: '#64748B' },
];

const SUB_CATEGORIES = {
  streaming: { label: 'Streaming',       color: '#8B5CF6' },
  musica:    { label: 'Música',          color: '#EC4899' },
  saude:     { label: 'Saúde',           color: '#EF4444' },
  educacao:  { label: 'Educação',        color: '#3B82F6' },
  software:  { label: 'Software/SaaS',   color: '#06B6D4' },
  jogos:     { label: 'Jogos',           color: '#F59E0B' },
  nuvem:     { label: 'Armazenamento',   color: '#0EA5E9' },
  outros:    { label: 'Outros',          color: '#64748B' },
};

const ACCOUNT_TYPE_LABELS = {
  corrente:    'Conta Corrente',
  poupanca:    'Conta Poupança',
  digital:     'Conta Digital',
  investimento:'Conta Investimento',
  salario:     'Conta Salário',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function darkenColor(hex, amount = 50) {
  const h = (hex || '#333333').replace('#', '');
  const num = parseInt(h.length === 3 ? h.split('').map(c => c+c).join('') : h, 16);
  const r = Math.max(0, (num >> 16) - amount);
  const g = Math.max(0, ((num >> 8) & 0xff) - amount);
  const b = Math.max(0, (num & 0xff) - amount);
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

function bankInitials(name = '') {
  return name.split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
}

function thisMonthStr() {
  return new Date().toISOString().substring(0, 7);
}

function isPaidThisMonth(sub) {
  return sub.lastConfirmedMonth === thisMonthStr();
}

function monthlyEquivalent(sub) {
  if (!sub.active) return 0;
  return sub.billingCycle === 'annual' ? (sub.amount / 12) : sub.amount;
}

function nextBillingDate(sub) {
  const day = parseInt(sub.billingDay) || 1;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let candidate = new Date(today.getFullYear(), today.getMonth(), day);
  if (candidate <= today) candidate = new Date(today.getFullYear(), today.getMonth() + 1, day);
  return candidate.toISOString().split('T')[0];
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(dateStr + 'T00:00:00') - today) / (1000 * 60 * 60 * 24));
}

// ── Entry point ───────────────────────────────────────────────────────────────

export function renderServices() {
  destroyAllCharts();
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="app-shell">
      ${renderSidebar()}
      <div class="app-main">
        ${renderHeader('Serviços & Bancos')}
        <div class="content">
          <div id="services-content"></div>
        </div>
      </div>
    </div>
  `;
  bindSidebarEvents();
  bindHeaderEvents();
  renderServicesContent();
}

function renderServicesContent() {
  const tab = sessionStorage.getItem('servicesTab') || 'bancos';
  sessionStorage.setItem('servicesTab', tab);

  const banks = getBanks();
  const subs  = getSubscriptions();
  const container = document.getElementById('services-content');
  if (!container) return;

  const subTabBar = `
    <div class="rv-subtab-bar" style="margin-bottom:var(--space-5);">
      <button class="rv-subtab ${tab === 'bancos' ? 'active' : ''}" data-services-tab="bancos">
        ${icons.balance} Meus Bancos
        ${banks.length > 0 ? `<span style="font-size:10px;background:rgba(59,130,246,.15);color:#3B82F6;border-radius:999px;padding:1px 6px;margin-left:4px;">${banks.length}</span>` : ''}
      </button>
      <button class="rv-subtab ${tab === 'assinaturas' ? 'active' : ''}" data-services-tab="assinaturas">
        ${icons.fixed} Assinaturas
        ${subs.filter(s=>s.active).length > 0 ? `<span style="font-size:10px;background:rgba(139,92,246,.15);color:#8B5CF6;border-radius:999px;padding:1px 6px;margin-left:4px;">${subs.filter(s=>s.active).length}</span>` : ''}
      </button>
      <button class="rv-subtab ${tab === 'resumo' ? 'active' : ''}" data-services-tab="resumo">
        ${icons.analysis} Resumo
      </button>
    </div>
  `;

  let content = '';
  if (tab === 'bancos')      content = renderBancosTab(banks);
  else if (tab === 'assinaturas') content = renderAssinaturasTab(subs, banks);
  else                       content = renderResumoTab(subs, banks);

  container.innerHTML = subTabBar + content;

  // Bind sub-tab switching
  container.querySelectorAll('[data-services-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      sessionStorage.setItem('servicesTab', btn.dataset.servicesTab);
      destroyAllCharts();
      renderServicesContent();
    });
  });

  // Bind tab-specific events
  if (tab === 'bancos')      bindBancosEvents(banks);
  else if (tab === 'assinaturas') bindAssinaturasEvents(subs, banks);
  else                       buildResumoChart(subs);
}

// ── Bancos Tab ────────────────────────────────────────────────────────────────

function renderBancosTab(banks) {
  const totalBalance = banks.reduce((s, b) => s + (b.balance || 0), 0);
  const mainBank     = banks.find(b => b.isMain);

  return `
    <div class="animate-fade-in-up">

      <!-- KPIs -->
      <div class="dashboard-stats" style="grid-template-columns:repeat(3,1fr);margin-bottom:var(--space-5);">
        <div class="stat-card">
          <div class="stat-icon" style="background:rgba(59,130,246,.1);color:#3B82F6;">${icons.wallet}</div>
          <div class="stat-content">
            <div class="stat-label">Saldo Total</div>
            <div class="stat-value">${formatCurrency(totalBalance)}</div>
            <div class="inv-pct-label">${banks.length} conta${banks.length !== 1 ? 's' : ''}</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background:rgba(34,197,94,.1);color:#22C55E;">${icons.check}</div>
          <div class="stat-content">
            <div class="stat-label">Banco Principal</div>
            <div class="stat-value" style="font-size:var(--font-size-base);font-weight:700;">${mainBank ? escapeHtml(mainBank.name) : '—'}</div>
            <div class="inv-pct-label">${mainBank ? (ACCOUNT_TYPE_LABELS[mainBank.accountType] || mainBank.accountType) : 'não definido'}</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background:rgba(245,158,11,.1);color:#F59E0B;">${icons.trendingUp}</div>
          <div class="stat-content">
            <div class="stat-label">Maior Saldo</div>
            <div class="stat-value">${banks.length > 0 ? formatCurrency(Math.max(...banks.map(b => b.balance||0))) : '—'}</div>
            <div class="inv-pct-label">${banks.length > 0 ? escapeHtml([...banks].sort((a,b)=>(b.balance||0)-(a.balance||0))[0].name) : ''}</div>
          </div>
        </div>
      </div>

      <!-- Add button -->
      <div style="display:flex;justify-content:flex-end;margin-bottom:var(--space-4);">
        <button class="btn btn-primary" id="btn-add-bank">
          ${icons.plus} Adicionar Banco
        </button>
      </div>

      ${banks.length === 0 ? `
        <div class="card">
          <div class="empty-state" style="padding:var(--space-12);">
            ${icons.emptyBox}
            <h3>Nenhum banco cadastrado</h3>
            <p>Adicione seus bancos e contas para acompanhar seu saldo.</p>
          </div>
        </div>
      ` : `
        <!-- Bank cards grid -->
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:var(--space-4);">
          ${banks.map(bank => renderBankCard(bank)).join('')}
        </div>
      `}
    </div>
  `;
}

function renderBankCard(bank) {
  const color  = bank.color || '#64748B';
  const darker = darkenColor(color, 40);
  const initials = bankInitials(bank.name);
  const typeLabel = ACCOUNT_TYPE_LABELS[bank.accountType] || bank.accountType || '';

  return `
    <div style="
      border-radius:20px;
      padding:22px 24px 20px;
      background:linear-gradient(145deg, ${color} 0%, ${darker} 100%);
      color:white;
      min-height:180px;
      display:flex;
      flex-direction:column;
      justify-content:space-between;
      position:relative;
      overflow:hidden;
      box-shadow:0 4px 24px ${color}40;
    ">
      <!-- Decorative circles -->
      <div style="position:absolute;top:-40px;right:-40px;width:150px;height:150px;border-radius:50%;background:rgba(255,255,255,.08);pointer-events:none;"></div>
      <div style="position:absolute;bottom:-30px;left:20px;width:100px;height:100px;border-radius:50%;background:rgba(255,255,255,.05);pointer-events:none;"></div>

      <!-- Top row: bank name + initials + main badge -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;position:relative;z-index:1;">
        <div>
          <div style="font-size:var(--font-size-lg);font-weight:700;letter-spacing:-.3px;line-height:1.2;">${escapeHtml(bank.name)}</div>
          <div style="font-size:var(--font-size-xs);opacity:.75;margin-top:3px;">${typeLabel}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
          <div style="width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:var(--font-size-sm);letter-spacing:-.5px;">
            ${initials}
          </div>
          ${bank.isMain ? `<div style="background:rgba(255,255,255,.25);border-radius:999px;padding:2px 8px;font-size:9px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;">Principal</div>` : ''}
        </div>
      </div>

      <!-- Balance -->
      <div style="position:relative;z-index:1;">
        <div style="font-size:10px;opacity:.65;letter-spacing:.8px;text-transform:uppercase;margin-bottom:4px;">Saldo</div>
        <div style="font-size:var(--font-size-2xl);font-weight:700;letter-spacing:-.5px;">${formatCurrency(bank.balance || 0)}</div>
        ${bank.agency || bank.account ? `
          <div style="font-size:10px;opacity:.6;margin-top:6px;">
            ${bank.agency ? `Ag. ${escapeHtml(bank.agency)}` : ''}${bank.agency && bank.account ? ' · ' : ''}${bank.account ? `CC ${escapeHtml(bank.account)}` : ''}
          </div>` : ''}
      </div>

      <!-- Actions -->
      <div style="display:flex;justify-content:space-between;align-items:center;position:relative;z-index:1;margin-top:8px;padding-top:12px;border-top:1px solid rgba(255,255,255,.15);">
        <div style="font-size:10px;opacity:.55;">${bank.notes ? escapeHtml(bank.notes.substring(0,30)) : ''}</div>
        <div style="display:flex;gap:6px;">
          <button class="edit-bank" data-id="${bank.id}"
            style="background:rgba(255,255,255,.18);border:none;border-radius:8px;padding:5px 10px;color:white;cursor:pointer;font-size:var(--font-size-xs);display:flex;align-items:center;gap:4px;">
            ${icons.edit} Editar
          </button>
          <button class="delete-bank" data-id="${bank.id}" data-name="${escapeHtml(bank.name)}"
            style="background:rgba(0,0,0,.2);border:none;border-radius:8px;padding:5px 10px;color:rgba(255,255,255,.8);cursor:pointer;font-size:var(--font-size-xs);display:flex;align-items:center;gap:4px;">
            ${icons.trash}
          </button>
        </div>
      </div>
    </div>
  `;
}

function bindBancosEvents(banks) {
  document.getElementById('btn-add-bank')?.addEventListener('click', () => openBankModal(null));

  document.querySelectorAll('.edit-bank').forEach(btn => {
    const bank = banks.find(b => b.id === btn.dataset.id);
    btn.addEventListener('click', () => openBankModal(bank));
  });

  document.querySelectorAll('.delete-bank').forEach(btn => {
    btn.addEventListener('click', () => {
      openConfirmModal(
        'Excluir banco?',
        `Excluir "${btn.dataset.name}" é uma ação permanente.`,
        () => { deleteBank(btn.dataset.id); renderServicesContent(); }
      );
    });
  });
}

function openBankModal(bank) {
  const isEdit = !!bank;
  const presetOptions = BANK_PRESETS.map(p =>
    `<option value="${p.key}" data-color="${p.color}" ${bank?.bankKey === p.key ? 'selected' : ''}>${p.name}</option>`
  ).join('');

  const colorPalette = [
    '#820AD1','#FF8C00','#CC0000','#1A6BB5','#EC0000',
    '#0070AF','#1A1A2E','#FF7A00','#242424','#21C25E',
    '#1282A2','#006B3F','#3B82F6','#22C55E','#64748B',
  ];

  openModal(
    isEdit ? `Editar — ${escapeHtml(bank.name)}` : 'Adicionar Banco',
    `<div style="display:flex;flex-direction:column;gap:var(--space-4);">
      <div class="form-group">
        <label class="form-label">Banco / Instituição *</label>
        <select id="bank-preset" class="form-control">
          <option value="">-- Selecione ou deixe em branco --</option>
          ${presetOptions}
        </select>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Nome personalizado *</label>
          <input type="text" id="bank-name" class="form-control" placeholder="Ex: Nubank" value="${escapeHtml(bank?.name || '')}" required>
        </div>
        <div class="form-group">
          <label class="form-label">Tipo de conta *</label>
          <select id="bank-type" class="form-control">
            ${Object.entries(ACCOUNT_TYPE_LABELS).map(([k,v]) => `<option value="${k}" ${bank?.accountType===k?'selected':''}>${v}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Saldo atual (R$) *</label>
        <input type="number" id="bank-balance" class="form-control" placeholder="0,00" step="0.01" min="0" value="${bank?.balance ?? ''}">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Agência <span style="color:var(--color-gray-400);font-weight:normal;">(opcional)</span></label>
          <input type="text" id="bank-agency" class="form-control" placeholder="0001" value="${escapeHtml(bank?.agency || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">Conta <span style="color:var(--color-gray-400);font-weight:normal;">(opcional)</span></label>
          <input type="text" id="bank-account" class="form-control" placeholder="12345-6" value="${escapeHtml(bank?.account || '')}">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Cor do card</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${colorPalette.map(c => `
            <button type="button" class="bank-color-pick" data-color="${c}"
              style="width:28px;height:28px;border-radius:50%;background:${c};border:3px solid ${(bank?.color||'#820AD1')===c?'var(--color-gray-800)':'transparent'};cursor:pointer;transition:border-color .15s;"></button>
          `).join('')}
        </div>
        <input type="hidden" id="bank-color" value="${bank?.color || '#820AD1'}">
      </div>
      <div class="form-group">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
          <input type="checkbox" id="bank-is-main" ${bank?.isMain ? 'checked' : ''}>
          <span>Banco principal</span>
          <span style="font-size:var(--font-size-xs);color:var(--color-gray-400);">(usado como referência no dashboard)</span>
        </label>
      </div>
      <div class="form-group">
        <label class="form-label">Notas <span style="color:var(--color-gray-400);font-weight:normal;">(opcional)</span></label>
        <input type="text" id="bank-notes" class="form-control" placeholder="Ex: conta principal para pagamentos" value="${escapeHtml(bank?.notes || '')}">
      </div>
    </div>`,
    `<button type="button" class="btn btn-ghost" id="modal-cancel">Cancelar</button>
     <button type="button" class="btn btn-primary" id="bank-save">${isEdit ? 'Salvar' : 'Adicionar'}</button>`
  );

  // Preset auto-fill
  document.getElementById('bank-preset').addEventListener('change', e => {
    const opt = e.target.selectedOptions[0];
    const preset = BANK_PRESETS.find(p => p.key === e.target.value);
    if (preset) {
      document.getElementById('bank-name').value = preset.name;
      document.getElementById('bank-color').value = preset.color;
      document.querySelectorAll('.bank-color-pick').forEach(b => {
        b.style.borderColor = b.dataset.color === preset.color ? 'var(--color-gray-800)' : 'transparent';
      });
    }
  });

  // Color picker
  document.querySelectorAll('.bank-color-pick').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('bank-color').value = btn.dataset.color;
      document.querySelectorAll('.bank-color-pick').forEach(b => {
        b.style.borderColor = b.dataset.color === btn.dataset.color ? 'var(--color-gray-800)' : 'transparent';
      });
    });
  });

  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('bank-save').addEventListener('click', () => {
    const name    = document.getElementById('bank-name').value.trim();
    const balance = parseFloat(document.getElementById('bank-balance').value) || 0;
    if (!name) { showToast('Informe o nome do banco.', 'error'); return; }

    const data = {
      name,
      bankKey:     document.getElementById('bank-preset').value || 'custom',
      accountType: document.getElementById('bank-type').value,
      balance,
      agency:  document.getElementById('bank-agency').value.trim(),
      account: document.getElementById('bank-account').value.trim(),
      color:   document.getElementById('bank-color').value,
      isMain:  document.getElementById('bank-is-main').checked,
      notes:   document.getElementById('bank-notes').value.trim(),
    };

    if (isEdit) {
      // If this bank is set as main, clear main from others first
      if (data.isMain) {
        getBanks().forEach(b => { if (b.id !== bank.id && b.isMain) updateBank(b.id, { isMain: false }); });
      }
      updateBank(bank.id, data);
      showToast('Banco atualizado!', 'success');
    } else {
      if (data.isMain) {
        getBanks().forEach(b => { if (b.isMain) updateBank(b.id, { isMain: false }); });
      }
      addBank(data);
      showToast('Banco adicionado!', 'success');
    }
    closeModal();
    renderServicesContent();
  });
}

// ── Assinaturas Tab ───────────────────────────────────────────────────────────

function renderAssinaturasTab(subs, banks) {
  const activeSubs  = subs.filter(s => s.active);
  const totalMensal = activeSubs.reduce((sum, s) => sum + monthlyEquivalent(s), 0);
  const totalAnual  = totalMensal * 12;

  const allDates = subs.filter(s=>s.active&&s.billingDay).map(s => ({
    sub: s,
    date: nextBillingDate(s),
    days: daysUntil(nextBillingDate(s)),
  })).sort((a,b) => a.days - b.days);

  const nextSub = allDates[0];

  const [filterVal, setFilterVal] = [
    sessionStorage.getItem('subsFilter') || 'todas',
    v => sessionStorage.setItem('subsFilter', v),
  ];

  let filtered = [...subs];
  if (filterVal === 'ativas')   filtered = subs.filter(s => s.active);
  if (filterVal === 'pausadas') filtered = subs.filter(s => !s.active);

  return `
    <div class="animate-fade-in-up">
      <!-- KPIs -->
      <div class="dashboard-stats" style="grid-template-columns:repeat(4,1fr);margin-bottom:var(--space-5);">
        <div class="stat-card">
          <div class="stat-icon" style="background:rgba(139,92,246,.1);color:#8B5CF6;">${icons.balance}</div>
          <div class="stat-content">
            <div class="stat-label">Total Mensal</div>
            <div class="stat-value">${formatCurrency(totalMensal)}</div>
            <div class="inv-pct-label">${activeSubs.length} ativa${activeSubs.length!==1?'s':''}</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background:rgba(59,130,246,.1);color:#3B82F6;">${icons.calendar}</div>
          <div class="stat-content">
            <div class="stat-label">Total Anual</div>
            <div class="stat-value">${formatCurrency(totalAnual)}</div>
            <div class="inv-pct-label">estimado</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background:rgba(245,158,11,.1);color:#F59E0B;">${icons.alertCircle}</div>
          <div class="stat-content">
            <div class="stat-label">Próx. Cobrança</div>
            <div class="stat-value" style="font-size:var(--font-size-base);">${nextSub ? formatDate(nextSub.date) : '—'}</div>
            <div class="inv-pct-label">${nextSub ? `${escapeHtml(nextSub.sub.name)} · ${nextSub.days===0?'hoje':nextSub.days+'d'}` : 'nenhuma'}</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background:rgba(34,197,94,.1);color:#22C55E;">${icons.check}</div>
          <div class="stat-content">
            <div class="stat-label">Pagas este mês</div>
            <div class="stat-value">${subs.filter(s => s.active && isPaidThisMonth(s)).length}</div>
            <div class="inv-pct-label">de ${activeSubs.length} ativas</div>
          </div>
        </div>
      </div>

      <!-- Filter + Add -->
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-4);">
        <div style="display:flex;gap:var(--space-2);">
          ${['todas','ativas','pausadas'].map(f => `
            <button class="inv-return-btn subs-filter ${filterVal===f?'active':''}" data-filter="${f}" style="font-size:var(--font-size-xs);padding:4px 12px;">
              ${f.charAt(0).toUpperCase()+f.slice(1)}
            </button>
          `).join('')}
        </div>
        <button class="btn btn-primary" id="btn-add-sub">
          ${icons.plus} Nova Assinatura
        </button>
      </div>

      ${filtered.length === 0 ? `
        <div class="card">
          <div class="empty-state" style="padding:var(--space-12);">
            ${icons.emptyBox}
            <h3>Nenhuma assinatura</h3>
            <p>Adicione suas assinaturas para controlar gastos recorrentes.</p>
          </div>
        </div>
      ` : `
        <div class="card">
          <div class="inv-table-wrapper">
            <table class="inv-table">
              <thead>
                <tr>
                  <th>Serviço</th>
                  <th>Valor</th>
                  <th>Cobrança</th>
                  <th>Próx. vencimento</th>
                  <th>Banco</th>
                  <th>Status</th>
                  <th>Este mês</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${filtered.map(sub => {
                  const cat     = SUB_CATEGORIES[sub.category] || SUB_CATEGORIES.outros;
                  const bank    = banks.find(b => b.id === sub.bankId);
                  const paid    = isPaidThisMonth(sub);
                  const next    = sub.active && sub.billingDay ? nextBillingDate(sub) : null;
                  const days    = next ? daysUntil(next) : null;
                  const isDue   = days !== null && days <= 3;

                  return `
                  <tr style="border-left:3px solid ${cat.color};${!sub.active?'opacity:.55;':''}">
                    <td>
                      <div style="font-weight:var(--font-weight-semibold);color:var(--color-gray-800);">${escapeHtml(sub.name)}</div>
                      <div style="margin-top:3px;">
                        <span style="display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:600;padding:2px 7px;border-radius:999px;background:${cat.color}18;color:${cat.color};">
                          ${cat.label}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div style="font-weight:700;color:var(--color-gray-800);">${formatCurrency(sub.amount)}</div>
                      <div style="font-size:10px;color:var(--color-gray-400);">${sub.billingCycle==='annual'?'Anual · '+formatCurrency(sub.amount/12)+'/mês':'Mensal'}</div>
                    </td>
                    <td style="font-size:var(--font-size-sm);color:var(--color-gray-500);">
                      ${sub.billingDay ? `Todo dia ${sub.billingDay}` : '—'}
                    </td>
                    <td>
                      ${next ? `
                        <div style="font-size:var(--font-size-sm);">${formatDate(next)}</div>
                        <div style="font-size:10px;color:${isDue?'var(--color-danger-500)':'var(--color-gray-400)'};">
                          ${days===0?'Hoje':days===1?'Amanhã':days+'d'}${isDue?' ⚠️':''}
                        </div>` : '<span style="color:var(--color-gray-300);">—</span>'}
                    </td>
                    <td style="font-size:var(--font-size-xs);color:var(--color-gray-500);">
                      ${bank ? `
                        <div style="display:flex;align-items:center;gap:5px;">
                          <div style="width:8px;height:8px;border-radius:50%;background:${bank.color||'#64748B'};flex-shrink:0;"></div>
                          ${escapeHtml(bank.name)}
                        </div>` : '—'}
                    </td>
                    <td>
                      <button class="toggle-sub" data-id="${sub.id}"
                        style="border:none;border-radius:999px;padding:3px 10px;font-size:10px;font-weight:700;cursor:pointer;
                               background:${sub.active?'rgba(34,197,94,.12)':'rgba(100,116,139,.12)'};
                               color:${sub.active?'#16A34A':'#64748B'};">
                        ${sub.active ? 'Ativa' : 'Pausada'}
                      </button>
                    </td>
                    <td>
                      ${sub.active ? (paid
                        ? `<span style="display:inline-flex;align-items:center;gap:4px;font-size:var(--font-size-xs);color:var(--color-success-600);font-weight:600;">
                             ${icons.check} Pago
                           </span>`
                        : `<button class="btn btn-secondary confirm-sub-pay" data-id="${sub.id}" data-name="${escapeHtml(sub.name)}" data-amount="${sub.amount}"
                             style="padding:3px 10px;font-size:var(--font-size-xs);white-space:nowrap;">
                             Confirmar
                           </button>`)
                        : '<span style="color:var(--color-gray-300);font-size:var(--font-size-xs);">—</span>'}
                    </td>
                    <td style="display:flex;gap:var(--space-1);align-items:center;">
                      <button class="btn-icon edit-sub" data-id="${sub.id}" title="Editar">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <button class="btn-icon delete-sub" data-id="${sub.id}" data-name="${escapeHtml(sub.name)}" title="Excluir" style="color:var(--color-danger-500);">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                      </button>
                    </td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `}
    </div>
  `;
}

function bindAssinaturasEvents(subs, banks) {
  // Filter buttons
  document.querySelectorAll('.subs-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      sessionStorage.setItem('subsFilter', btn.dataset.filter);
      renderServicesContent();
    });
  });

  document.getElementById('btn-add-sub')?.addEventListener('click', () => openSubModal(null, banks));

  document.querySelectorAll('.edit-sub').forEach(btn => {
    const sub = subs.find(s => s.id === btn.dataset.id);
    btn.addEventListener('click', () => openSubModal(sub, banks));
  });

  document.querySelectorAll('.delete-sub').forEach(btn => {
    btn.addEventListener('click', () => {
      openConfirmModal(
        'Excluir assinatura?',
        `Excluir "${btn.dataset.name}" é uma ação permanente.`,
        () => { deleteSubscription(btn.dataset.id); renderServicesContent(); }
      );
    });
  });

  document.querySelectorAll('.toggle-sub').forEach(btn => {
    btn.addEventListener('click', () => {
      toggleSubscriptionActive(btn.dataset.id);
      renderServicesContent();
    });
  });

  document.querySelectorAll('.confirm-sub-pay').forEach(btn => {
    const sub = subs.find(s => s.id === btn.dataset.id);
    btn.addEventListener('click', () => openConfirmPaymentModal(sub));
  });
}

function openSubModal(sub, banks) {
  const isEdit = !!sub;
  const cats = getCategories();
  const catOptions = cats.map(c =>
    `<option value="${c.id}" ${sub?.categoryId===c.id?'selected':''}>${c.icon||''} ${c.name}</option>`
  ).join('');

  openModal(
    isEdit ? `Editar — ${escapeHtml(sub.name)}` : 'Nova Assinatura',
    `<div style="display:flex;flex-direction:column;gap:var(--space-4);">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Nome do serviço *</label>
          <input type="text" id="sub-name" class="form-control" placeholder="Ex: Netflix" value="${escapeHtml(sub?.name||'')}" required>
        </div>
        <div class="form-group">
          <label class="form-label">Categoria</label>
          <select id="sub-category" class="form-control">
            ${Object.entries(SUB_CATEGORIES).map(([k,v]) =>
              `<option value="${k}" ${sub?.category===k?'selected':''}>${v.label}</option>`
            ).join('')}
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Valor (R$) *</label>
          <input type="number" id="sub-amount" class="form-control" placeholder="0,00" step="0.01" min="0" value="${sub?.amount??''}">
        </div>
        <div class="form-group">
          <label class="form-label">Periodicidade</label>
          <select id="sub-cycle" class="form-control">
            <option value="monthly" ${sub?.billingCycle==='monthly'||!sub?'selected':''}>Mensal</option>
            <option value="annual"  ${sub?.billingCycle==='annual'?'selected':''}>Anual</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Dia de cobrança</label>
          <input type="number" id="sub-day" class="form-control" placeholder="Ex: 15" min="1" max="28" value="${sub?.billingDay??''}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Banco/Cartão</label>
          <select id="sub-bank" class="form-control">
            <option value="">— Nenhum —</option>
            ${banks.map(b => `<option value="${b.id}" ${sub?.bankId===b.id?'selected':''}>${escapeHtml(b.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Categoria em Movimentações</label>
          <select id="sub-cat-tx" class="form-control">
            ${catOptions}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Notas <span style="color:var(--color-gray-400);font-weight:normal;">(opcional)</span></label>
        <input type="text" id="sub-notes" class="form-control" placeholder="Ex: conta familiar" value="${escapeHtml(sub?.notes||'')}">
      </div>
    </div>`,
    `<button type="button" class="btn btn-ghost" id="modal-cancel">Cancelar</button>
     <button type="button" class="btn btn-primary" id="sub-save">${isEdit ? 'Salvar' : 'Adicionar'}</button>`
  );

  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('sub-save').addEventListener('click', () => {
    const name   = document.getElementById('sub-name').value.trim();
    const amount = parseFloat(document.getElementById('sub-amount').value) || 0;
    if (!name)   { showToast('Informe o nome do serviço.', 'error'); return; }
    if (!amount) { showToast('Informe o valor.', 'error'); return; }

    const data = {
      name,
      category:     document.getElementById('sub-category').value,
      amount,
      billingCycle: document.getElementById('sub-cycle').value,
      billingDay:   parseInt(document.getElementById('sub-day').value) || null,
      bankId:       document.getElementById('sub-bank').value || null,
      categoryId:   document.getElementById('sub-cat-tx').value,
      notes:        document.getElementById('sub-notes').value.trim(),
    };

    if (isEdit) { updateSubscription(sub.id, data); showToast('Assinatura atualizada!', 'success'); }
    else        { addSubscription(data);             showToast('Assinatura adicionada!', 'success'); }
    closeModal();
    renderServicesContent();
  });
}

function openConfirmPaymentModal(sub) {
  const today = getTodayStr();
  openModal(
    `Confirmar pagamento — ${escapeHtml(sub.name)}`,
    `<div style="display:flex;flex-direction:column;gap:var(--space-4);">
      <div style="background:var(--color-gray-50);border-radius:var(--radius-md);padding:var(--space-4);">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
          <span style="color:var(--color-gray-500);">Serviço</span>
          <strong>${escapeHtml(sub.name)}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
          <span style="color:var(--color-gray-500);">Periodicidade</span>
          <span>${sub.billingCycle === 'annual' ? 'Anual' : 'Mensal'}</span>
        </div>
        <div style="display:flex;justify-content:space-between;">
          <span style="color:var(--color-gray-500);">Valor</span>
          <strong style="color:var(--color-danger-600);">− ${formatCurrency(sub.amount)}</strong>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Valor cobrado (R$)</label>
          <input type="number" id="pay-amount" class="form-control" value="${sub.amount.toFixed(2)}" step="0.01" min="0">
        </div>
        <div class="form-group">
          <label class="form-label">Data do pagamento</label>
          <input type="date" id="pay-date" class="form-control" value="${today}">
        </div>
      </div>
      <div style="font-size:var(--font-size-xs);color:var(--color-gray-400);background:rgba(59,130,246,.06);border-radius:var(--radius-md);padding:var(--space-3);">
        ${icons.info} O pagamento será lançado automaticamente em <strong>Movimentações</strong> na categoria selecionada.
      </div>
    </div>`,
    `<button type="button" class="btn btn-ghost" id="modal-cancel">Cancelar</button>
     <button type="button" class="btn btn-danger" id="pay-confirm">Confirmar pagamento</button>`
  );

  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('pay-confirm').addEventListener('click', () => {
    const amount = parseFloat(document.getElementById('pay-amount').value) || sub.amount;
    const date   = document.getElementById('pay-date').value || today;

    // Mark as paid this month
    updateSubscription(sub.id, { lastConfirmedMonth: thisMonthStr() });

    // Log in Movimentações
    addTransaction({
      description: sub.name,
      amount,
      date,
      type: 'expense',
      categoryId: sub.categoryId || 'cat_outros',
      note: `Assinatura ${sub.billingCycle === 'annual' ? 'anual' : 'mensal'} — confirmada manualmente`,
      fromSubscription: true,
    });

    closeModal();
    showToast(`${sub.name} lançado em Movimentações!`, 'success');
    renderServicesContent();
  });
}

// ── Resumo Tab ────────────────────────────────────────────────────────────────

function renderResumoTab(subs, banks) {
  const activeSubs  = subs.filter(s => s.active);
  const totalMensal = activeSubs.reduce((sum, s) => sum + monthlyEquivalent(s), 0);
  const totalAnual  = totalMensal * 12;
  const totalBancos = banks.reduce((s, b) => s + (b.balance || 0), 0);

  // Group by category
  const byCat = {};
  activeSubs.forEach(s => {
    const cat = SUB_CATEGORIES[s.category] || SUB_CATEGORIES.outros;
    if (!byCat[s.category]) byCat[s.category] = { label: cat.label, color: cat.color, total: 0, count: 0 };
    byCat[s.category].total += monthlyEquivalent(s);
    byCat[s.category].count += 1;
  });
  const catEntries = Object.values(byCat).sort((a,b) => b.total - a.total);

  // Upcoming next 30 days
  const upcoming = activeSubs
    .filter(s => s.billingDay)
    .map(s => ({ sub: s, date: nextBillingDate(s), days: daysUntil(nextBillingDate(s)) }))
    .filter(x => x.days >= 0 && x.days <= 30)
    .sort((a,b) => a.days - b.days);

  return `
    <div class="animate-fade-in-up">
      <!-- KPIs -->
      <div class="dashboard-stats" style="grid-template-columns:repeat(3,1fr);margin-bottom:var(--space-5);">
        <div class="stat-card">
          <div class="stat-icon" style="background:rgba(139,92,246,.1);color:#8B5CF6;">${icons.balance}</div>
          <div class="stat-content">
            <div class="stat-label">Gasto Mensal Total</div>
            <div class="stat-value">${formatCurrency(totalMensal)}</div>
            <div class="inv-pct-label">${activeSubs.length} assinatura${activeSubs.length!==1?'s':''} ativa${activeSubs.length!==1?'s':''}</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background:rgba(59,130,246,.1);color:#3B82F6;">${icons.calendar}</div>
          <div class="stat-content">
            <div class="stat-label">Gasto Anual Total</div>
            <div class="stat-value">${formatCurrency(totalAnual)}</div>
            <div class="inv-pct-label">projeção anual</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background:rgba(34,197,94,.1);color:#22C55E;">${icons.wallet}</div>
          <div class="stat-content">
            <div class="stat-label">Saldo em Bancos</div>
            <div class="stat-value">${formatCurrency(totalBancos)}</div>
            <div class="inv-pct-label">${banks.length} conta${banks.length!==1?'s':''}</div>
          </div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-5);margin-bottom:var(--space-5);">
        <!-- Donut chart by category -->
        <div class="card">
          <div class="card-header"><h3>Gastos por Categoria</h3></div>
          ${catEntries.length === 0
            ? `<div style="padding:var(--space-8);text-align:center;color:var(--color-gray-400);">Nenhuma assinatura ativa</div>`
            : `<div style="max-width:180px;margin:var(--space-3) auto;"><canvas id="chart-subs-cat"></canvas></div>
               <div style="padding:0 var(--space-4) var(--space-4);">
                 ${catEntries.map(c => `
                   <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-2);">
                     <div style="display:flex;align-items:center;gap:8px;">
                       <span style="width:10px;height:10px;border-radius:50%;background:${c.color};display:inline-block;flex-shrink:0;"></span>
                       <span style="font-size:var(--font-size-sm);">${c.label} <span style="color:var(--color-gray-400);">(${c.count})</span></span>
                     </div>
                     <div style="text-align:right;">
                       <div style="font-weight:600;font-size:var(--font-size-sm);">${formatCurrency(c.total)}/mês</div>
                       <div style="font-size:10px;color:var(--color-gray-400);">${totalMensal>0?((c.total/totalMensal)*100).toFixed(1):0}%</div>
                     </div>
                   </div>
                 `).join('')}
               </div>`
          }
        </div>

        <!-- Upcoming payments -->
        <div class="card">
          <div class="card-header"><h3>Próximas cobranças (30 dias)</h3></div>
          ${upcoming.length === 0
            ? `<div style="padding:var(--space-8);text-align:center;color:var(--color-gray-400);">Nenhuma cobrança nos próximos 30 dias</div>`
            : `<div style="padding:0 var(--space-4) var(--space-4);">
                 ${upcoming.map(({ sub, date, days }) => {
                   const cat = SUB_CATEGORIES[sub.category] || SUB_CATEGORIES.outros;
                   const paid = isPaidThisMonth(sub);
                   return `
                     <div style="display:flex;justify-content:space-between;align-items:center;padding:var(--space-2) 0;border-bottom:1px solid var(--color-gray-100);">
                       <div style="display:flex;align-items:center;gap:10px;">
                         <div style="width:10px;height:10px;border-radius:50%;background:${cat.color};flex-shrink:0;"></div>
                         <div>
                           <div style="font-size:var(--font-size-sm);font-weight:600;">${escapeHtml(sub.name)}</div>
                           <div style="font-size:10px;color:var(--color-gray-400);">${formatDate(date)} · ${days===0?'hoje':days===1?'amanhã':days+'d'}</div>
                         </div>
                       </div>
                       <div style="text-align:right;">
                         <div style="font-weight:700;font-size:var(--font-size-sm);">${formatCurrency(sub.amount)}</div>
                         ${paid ? `<div style="font-size:10px;color:var(--color-success-600);font-weight:600;">Pago ✓</div>` : `<div style="font-size:10px;color:var(--color-gray-400);">pendente</div>`}
                       </div>
                     </div>`;
                 }).join('')}
               </div>`
          }
        </div>
      </div>

      <!-- Banks balance breakdown -->
      ${banks.length > 0 ? `
        <div class="card">
          <div class="card-header"><h3>Saldos por Banco</h3></div>
          <div style="padding:var(--space-4);">
            ${[...banks].sort((a,b)=>(b.balance||0)-(a.balance||0)).map(bank => {
              const pct = totalBancos > 0 ? ((bank.balance||0) / totalBancos * 100) : 0;
              return `
                <div style="margin-bottom:var(--space-3);">
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                    <div style="display:flex;align-items:center;gap:8px;">
                      <div style="width:10px;height:10px;border-radius:50%;background:${bank.color||'#64748B'};flex-shrink:0;"></div>
                      <span style="font-size:var(--font-size-sm);font-weight:600;">${escapeHtml(bank.name)}</span>
                      <span style="font-size:10px;color:var(--color-gray-400);">${ACCOUNT_TYPE_LABELS[bank.accountType]||bank.accountType||''}</span>
                      ${bank.isMain ? `<span style="font-size:9px;background:rgba(59,130,246,.12);color:#3B82F6;padding:1px 6px;border-radius:999px;font-weight:700;">Principal</span>` : ''}
                    </div>
                    <div style="font-weight:700;font-size:var(--font-size-sm);">${formatCurrency(bank.balance||0)}</div>
                  </div>
                  <div style="height:6px;background:var(--color-gray-100);border-radius:999px;overflow:hidden;">
                    <div style="height:100%;width:${pct.toFixed(1)}%;background:${bank.color||'#64748B'};border-radius:999px;transition:width .4s;"></div>
                  </div>
                  <div style="font-size:10px;color:var(--color-gray-400);margin-top:2px;">${pct.toFixed(1)}% do total</div>
                </div>`;
            }).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

function buildResumoChart(subs) {
  const activeSubs = subs.filter(s => s.active);
  const byCat = {};
  activeSubs.forEach(s => {
    const cat = SUB_CATEGORIES[s.category] || SUB_CATEGORIES.outros;
    if (!byCat[s.category]) byCat[s.category] = { label: cat.label, color: cat.color, total: 0 };
    byCat[s.category].total += monthlyEquivalent(s);
  });
  const entries = Object.values(byCat).filter(e => e.total > 0);
  if (entries.length > 0 && document.getElementById('chart-subs-cat')) {
    createDoughnutChart('chart-subs-cat', entries.map(e=>e.label), entries.map(e=>e.total), entries.map(e=>e.color));
  }
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function openConfirmModal(title, message, onConfirm) {
  openModal(
    title,
    `<p style="margin:0;color:var(--color-gray-600);font-size:var(--font-size-sm);line-height:1.6;">${message}</p>`,
    `<button class="btn btn-ghost" id="cm-cancel">Cancelar</button>
     <button class="btn btn-danger" id="cm-confirm">Excluir</button>`
  );
  document.getElementById('cm-cancel').addEventListener('click', closeModal);
  document.getElementById('cm-confirm').addEventListener('click', () => { closeModal(); onConfirm(); });
}
