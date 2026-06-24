// ============================================
// FINANÇAS PRO — Investments Page
// ============================================

import { formatCurrency, formatDate, escapeHtml, icons } from '../utils.js';
import { getRates, calcCurrentValueRF, calcReturn, formatRateLabel, daysSince } from '../services/rates.js';
import {
  getInvestmentsRF, addInvestmentRF, deleteInvestmentRF,
  getInvestmentsRV, addInvestmentRV, deleteInvestmentRV,
  getRedemptions, addRedemption, deleteRedemption,
  getAmortConfirmations, confirmAmortization, deleteAmortConfirmation,
  addTransaction,
} from '../storage.js';
import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js';
import { renderHeader, bindHeaderEvents } from '../components/header.js';
import { createDoughnutChart, destroyAllCharts } from '../components/charts.js';
import { showToast } from '../components/toast.js';
import { openModal, closeModal } from '../components/modal.js';

let _tabChangeHandler = null;
let _rates = null; // cache das taxas BCB
let _rfSearch = '';
let _rfSort = 'maturity_asc';
let _rvSearch = '';
let _rvSort = 'value_desc';
let _carteiraSearch = '';
let _carteiraSort = 'value_desc';

const SECTOR_LABELS = {
  tecnologia: 'Tecnologia', financas: 'Finanças', energia: 'Energia',
  saude: 'Saúde', consumo: 'Consumo', industrial: 'Industrial',
  utilities: 'Utilities', imobiliario: 'Imobiliário',
  papel: 'Papel (FII)', tijolo: 'Tijolo (FII)', logistica: 'Logística (FII)',
  shoppings: 'Shoppings (FII)', fof: 'FoF (FII)', outros: 'Outros',
};

const ASSET_LABELS = {
  acao: 'Ação', fii: 'FII', etf: 'ETF', bdr: 'BDR', cripto: 'Cripto', outro: 'Outro',
};

// ── Entry Point ──

export function renderInvestments() {
  destroyAllCharts();

  if (_tabChangeHandler) {
    document.removeEventListener('inv-tab-change', _tabChangeHandler);
  }

  const app = document.getElementById('app');
  const activeTab = sessionStorage.getItem('invActiveTab') || 'carteira';

  app.innerHTML = `
    <div class="app-shell">
      ${renderSidebar()}
      <div class="app-main">
        ${renderHeader('Investimentos')}
        <div class="content">
          <div id="inv-content"></div>
        </div>
      </div>
    </div>
  `;

  bindSidebarEvents();
  bindHeaderEvents();
  renderTabContent(activeTab);

  _tabChangeHandler = (e) => renderTabContent(e.detail.tab);
  document.addEventListener('inv-tab-change', _tabChangeHandler);
}

async function renderTabContent(tab) {
  destroyAllCharts();
  sessionStorage.setItem('invActiveTab', tab);
  const rf = getInvestmentsRF();
  const rv = getInvestmentsRV();
  const redemptions = getRedemptions();
  const amortConfirms = getAmortConfirmations();
  const container = document.getElementById('inv-content');
  if (!container) return;

  // Busca taxas (usa cache se disponível, busca do BC se necessário)
  if (!_rates) {
    container.innerHTML = `<div style="padding:var(--space-8);text-align:center;color:var(--color-gray-400);">Buscando taxas do Banco Central...</div>`;
    _rates = await getRates();
  }
  const rates = _rates;

  switch (tab) {
    case 'carteira':
      container.innerHTML = renderCarteiraTab(rf, rv, redemptions, rates, amortConfirms);
      buildCarteiraCharts(rf, rv, redemptions);
      bindCarteiraFilterEvents(rf, rv, redemptions);
      bindAmortConfirmEvents();
      break;
    case 'rf':
      container.innerHTML = renderRendaFixaTab(rf, redemptions, rates, amortConfirms);
      buildRFChart(rf);
      bindRFDeleteEvents();
      bindRFFilterEvents(rf, redemptions, rates, amortConfirms);
      bindAmortConfirmEvents();
      break;
    case 'rv':
      container.innerHTML = renderRendaVariavelTab(rv, redemptions);
      buildRVChart(rv);
      bindRVDeleteEvents();
      bindRVFilterEvents(rv, redemptions);
      break;
    case 'formulario':
      container.innerHTML = renderFormularioTab();
      bindFormEvents();
      break;
  }
}

// ── Helpers de resgate ──

// Frequência → meses entre parcelas
const AMORT_FREQ_MONTHS = {
  monthly: 1, bimonthly: 2, quarterly: 3, semiannual: 6, annual: 12,
};

/**
 * Calcula o cronograma completo de amortizações de um título.
 * Retorna array de { date, amount, index, isPast, isThisMonth }
 */
function getAmortizationSchedule(inv) {
  const a = inv.amortization;
  if (!a || !a.firstDate || !a.value) return [];

  const freqMonths = AMORT_FREQ_MONTHS[a.frequency] || 6;
  const maturity   = new Date(inv.maturityDate + 'T00:00:00');
  const schedule   = [];
  let   current    = new Date(a.firstDate + 'T00:00:00');
  let   balance    = inv.value;
  let   index      = 0;
  const today      = new Date(); today.setHours(0,0,0,0);
  const thisMonth  = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`;

  while (current <= maturity && balance > 0.01 && index < 240) {
    const amount = a.type === 'percentage'
      ? balance * (a.value / 100)
      : Math.min(a.value, balance);

    const dateStr = current.toISOString().split('T')[0];
    const dMonth  = `${current.getFullYear()}-${String(current.getMonth()+1).padStart(2,'0')}`;

    schedule.push({
      index,
      date:        dateStr,
      amount,
      balance:     balance - amount,
      isPast:      current < today,
      isToday:     current.getTime() === today.getTime(),
      isThisMonth: dMonth === thisMonth,
    });

    balance -= amount;

    // Avança para próxima data
    const next = new Date(current);
    next.setMonth(next.getMonth() + freqMonths);
    current = next;
    index++;
  }

  return schedule;
}

// Saldo do principal após amortizações automáticas já ocorridas
function principalAfterAmortizations(inv) {
  if (!inv.amortization || !inv.amortization.firstDate) return inv.value;
  const schedule = getAmortizationSchedule(inv);
  const pastAmort = schedule.filter(p => p.isPast).reduce((s, p) => s + p.amount, 0);
  return Math.max(0, inv.value - pastAmort);
}

function netValue(inv, redemptions) {
  const principal = principalAfterAmortizations(inv);
  const redeemed  = redemptions
    .filter(r => r.investmentId === inv.id)
    .reduce((s, r) => s + r.amount, 0);
  return Math.max(0, principal - redeemed);
}

function totalRedeemed(inv, redemptions) {
  return redemptions.filter(r => r.investmentId === inv.id).reduce((s, r) => s + r.amount, 0);
}

const ICON_REDEEM = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v10"/><path d="m4.93 10.93 1.41 1.41"/><path d="M2 18h2"/><path d="M20 18h2"/><path d="m19.07 10.93-1.41 1.41"/><path d="M22 22H2"/><path d="m8 22 4-10 4 10"/></svg>`;

// ── Tab 1: Minha Carteira ──

function applyCarteiraFilters(posicoes) {
  let list = [...posicoes];
  if (_carteiraSearch) {
    const t = _carteiraSearch.toLowerCase();
    list = list.filter(p => p.nome.toLowerCase().includes(t) || (p.ticker||'').toLowerCase().includes(t));
  }
  switch (_carteiraSort) {
    case 'value_desc': list.sort((a,b) => b.netValue - a.netValue); break;
    case 'value_asc':  list.sort((a,b) => a.netValue - b.netValue); break;
    case 'name_asc':   list.sort((a,b) => a.nome.localeCompare(b.nome)); break;
    case 'tipo':       list.sort((a,b) => a.tipo.localeCompare(b.tipo)); break;
  }
  return list;
}

function renderCarteiraTab(rf, rv, redemptions, rates = {}, amortConfirms = []) {
  const totalRF = rf.reduce((s, i) => s + netValue(i, redemptions), 0);
  const totalCripto = rv.filter(i => i.assetType === 'cripto').reduce((s, i) => s + netValue(i, redemptions), 0);
  const totalRVsemCripto = rv.reduce((s, i) => s + netValue(i, redemptions), 0) - totalCripto;
  const total = totalRF + totalRVsemCripto + totalCripto;

  const allInv = [...rf, ...rv];
  const totalBrasil = allInv.filter(i => i.geography === 'brasil').reduce((s, i) => s + netValue(i, redemptions), 0);
  const totalGlobal = allInv.filter(i => i.geography === 'global').reduce((s, i) => s + netValue(i, redemptions), 0);

  const pct = (v) => total > 0 ? ((v / total) * 100).toFixed(1) : '0.0';

  // Vencimentos próximos: RF que vence nos próximos 7 dias e tem saldo > 0
  const today = new Date(); today.setHours(0,0,0,0);
  const in7   = new Date(today); in7.setDate(in7.getDate() + 7);
  const vencendo = rf.filter(i => {
    const d = new Date(i.maturityDate + 'T00:00:00');
    return d >= today && d <= in7 && netValue(i, redemptions) > 0;
  }).sort((a, b) => a.maturityDate.localeCompare(b.maturityDate));

  // Amortizações deste mês
  const amortizandoMes = rf
    .filter(i => i.amortization && netValue(i, redemptions) > 0)
    .flatMap(i => getAmortizationSchedule(i)
      .filter(p => p.isThisMonth)
      .map(p => ({ ...p, invName: i.name, invId: i.id }))
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  // Posições consolidadas: RF + RV juntos com valores líquidos
  const posicoes = [
    ...rf.map(i => ({ tipo: 'RF', icon: '🏦', nome: i.name, ticker: '', detalhe: returnTypeLabel(i), value: i.value, netValue: netValue(i, redemptions), geography: i.geography })),
    ...rv.map(i => ({ tipo: 'RV', icon: '📈', nome: i.name, ticker: i.ticker, detalhe: ASSET_LABELS[i.assetType] || i.assetType, value: i.value, netValue: netValue(i, redemptions), geography: i.geography })),
  ].filter(p => p.netValue > 0);

  const filtered = applyCarteiraFilters(posicoes);

  return `
    <div class="animate-fade-in-up">
      <div class="inv-total-card">
        <div class="inv-total-label">Total Investido</div>
        <div class="inv-total-value">${formatCurrency(total)}</div>
      </div>

      <div class="dashboard-stats" style="margin-top:var(--space-5);">
        <div class="stat-card">
          <div class="stat-icon" style="background:rgba(59,130,246,.1);color:#3B82F6;">🏦</div>
          <div class="stat-content">
            <div class="stat-label">Renda Fixa</div>
            <div class="stat-value">${formatCurrency(totalRF)}</div>
            <div class="inv-pct-label">${pct(totalRF)}% do total</div>
          </div>
        </div>
        <div class="stat-card stagger-1">
          <div class="stat-icon" style="background:rgba(34,197,94,.1);color:#22C55E;">📈</div>
          <div class="stat-content">
            <div class="stat-label">Renda Variável</div>
            <div class="stat-value">${formatCurrency(totalRVsemCripto)}</div>
            <div class="inv-pct-label">${pct(totalRVsemCripto)}% do total</div>
          </div>
        </div>
        <div class="stat-card stagger-2">
          <div class="stat-icon" style="background:rgba(168,85,247,.1);color:#A855F7;">₿</div>
          <div class="stat-content">
            <div class="stat-label">Criptoativos</div>
            <div class="stat-value">${formatCurrency(totalCripto)}</div>
            <div class="inv-pct-label">${pct(totalCripto)}% do total</div>
          </div>
        </div>
      </div>

      <!-- Vencimentos Próximos -->
      ${vencendo.length > 0 ? `
      <div class="inv-alert-card">
        <div class="inv-alert-header">
          <span class="inv-alert-icon">⚠️</span>
          <strong>Vencimentos nos próximos 7 dias</strong>
          <span class="inv-alert-count">${vencendo.length} título${vencendo.length > 1 ? 's' : ''}</span>
        </div>
        <div class="inv-alert-list">
          ${vencendo.map(inv => {
            const d = new Date(inv.maturityDate + 'T00:00:00');
            const diffDays = Math.ceil((d - today) / (1000*60*60*24));
            const urgency = diffDays === 0 ? 'Vence hoje!' : diffDays === 1 ? 'Vence amanhã' : `Vence em ${diffDays} dias`;
            return `
              <div class="inv-alert-item">
                <div>
                  <div class="inv-alert-name">${escapeHtml(inv.name)}</div>
                  <div class="inv-alert-sub">${returnTypeLabel(inv)}</div>
                </div>
                <div style="text-align:right;">
                  <div style="font-weight:var(--font-weight-semibold);">${formatCurrency(inv.value)}</div>
                  <div class="inv-alert-urgency ${diffDays <= 1 ? 'urgent' : ''}">${urgency}</div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
      ` : ''}

      <!-- Amortizações deste mês -->
      ${amortizandoMes.length > 0 ? `
      <div class="inv-alert-card" style="border-color:#FDE047;background:#FEFCE8;">
        <div class="inv-alert-header">
          <span class="inv-alert-icon">💰</span>
          <strong>Amortizações este mês</strong>
          <span class="inv-alert-count" style="background:#FEF9C3;color:#713F12;">${amortizandoMes.length} parcela${amortizandoMes.length > 1 ? 's' : ''}</span>
        </div>
        <div class="inv-alert-list">
          ${amortizandoMes.map(p => {
            const confirmed = amortConfirms.find(
              c => c.investmentId === p.invId && c.amortIndex === p.index
            );
            return `
            <div class="inv-alert-item">
              <div>
                <div class="inv-alert-name">${escapeHtml(p.invName)}</div>
                <div class="inv-alert-sub">Parcela ${p.index + 1} · ${formatDate(p.date)}</div>
              </div>
              <div style="display:flex;align-items:center;gap:var(--space-3);">
                <div style="text-align:right;">
                  <div style="font-weight:var(--font-weight-semibold);color:var(--color-success-600);">+ ${formatCurrency(p.amount)}</div>
                  <div style="font-size:var(--font-size-xs);color:var(--color-gray-400);">Saldo após: ${formatCurrency(p.balance)}</div>
                </div>
                ${confirmed
                  ? `<span style="font-size:11px;color:var(--color-success-600);font-weight:600;">✓ Confirmado</span>`
                  : `<button class="btn-amort-confirm" data-inv-id="${p.invId}" data-inv-name="${escapeHtml(p.invName)}" data-index="${p.index}" data-amount="${p.amount}" data-date="${p.date}">
                       ✓ Confirmar
                     </button>`
                }
              </div>
            </div>
          `}).join('')}
        </div>
      </div>
      ` : ''}

      <div class="inv-charts-row">
        <div class="card">
          <div class="card-header"><h3>Distribuição da Carteira</h3></div>
          <div class="chart-container" style="height:240px;">
            ${total > 0 ? '<canvas id="chart-distribuicao"></canvas>' : emptyChart()}
          </div>
        </div>
        <div class="card">
          <div class="card-header"><h3>Brasil vs Global</h3></div>
          <div class="chart-container" style="height:200px;">
            ${total > 0 ? '<canvas id="chart-geo"></canvas>' : emptyChart()}
          </div>
          ${total > 0 ? `
          <div class="inv-geo-summary">
            <div class="inv-geo-item">
              <span class="inv-geo-dot" style="background:#3B82F6;"></span>
              <span>Brasil</span>
              <strong>${formatCurrency(totalBrasil)}</strong>
            </div>
            <div class="inv-geo-item">
              <span class="inv-geo-dot" style="background:#22C55E;"></span>
              <span>Global</span>
              <strong>${formatCurrency(totalGlobal)}</strong>
            </div>
          </div>` : ''}
        </div>
      </div>

      <!-- Posições Consolidadas -->
      <div class="card" style="margin-top:var(--space-5);">
        <div class="card-header"><h3>Posições Consolidadas</h3></div>
        <div class="inv-filter-bar">
          <div class="search-input" style="flex:1;">
            ${icons.search}
            <input type="text" id="carteira-search" placeholder="Buscar por nome ou ticker..." value="${escapeHtml(_carteiraSearch)}">
          </div>
          <select id="carteira-sort" class="form-control" style="width:auto;min-width:160px;">
            <option value="value_desc" ${_carteiraSort==='value_desc'?'selected':''}>Maior valor</option>
            <option value="value_asc"  ${_carteiraSort==='value_asc' ?'selected':''}>Menor valor</option>
            <option value="name_asc"   ${_carteiraSort==='name_asc'  ?'selected':''}>Nome A→Z</option>
            <option value="tipo"       ${_carteiraSort==='tipo'       ?'selected':''}>Tipo (RF/RV)</option>
          </select>
        </div>
        ${filtered.length > 0 ? `
        <div class="inv-table-wrapper">
          <table class="inv-table">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Nome</th>
                <th>Classe</th>
                <th class="text-right">Valor Atual</th>
                <th class="text-right">% Carteira</th>
                <th>Local</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.map(p => `
                <tr>
                  <td><span style="font-size:18px;">${p.icon}</span></td>
                  <td>
                    <strong>${p.ticker ? `<span class="inv-ticker">${escapeHtml(p.ticker)}</span> ` : ''}${escapeHtml(p.nome)}</strong>
                    ${p.netValue < p.value ? `<div style="font-size:var(--font-size-xs);color:var(--color-gray-400);">Original: ${formatCurrency(p.value)}</div>` : ''}
                  </td>
                  <td><span class="inv-badge inv-badge-${p.tipo === 'RF' ? 'pos' : 'type'}">${p.detalhe}</span></td>
                  <td class="text-right"><strong>${formatCurrency(p.netValue)}</strong></td>
                  <td class="text-right">${pct(p.netValue)}%</td>
                  <td>${p.geography === 'brasil' ? '🇧🇷' : '🌎'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        ` : `<div class="empty-state" style="padding:var(--space-6);">${posicoes.length > 0 ? 'Nenhuma posição encontrada.' : 'Nenhuma posição cadastrada ainda.'}</div>`}
      </div>
    </div>
  `;
}

function bindCarteiraFilterEvents(rf, rv, redemptions) {
  const searchEl = document.getElementById('carteira-search');
  const sortEl   = document.getElementById('carteira-sort');
  if (!searchEl || !sortEl) return;
  const rerender = () => {
    const c = document.getElementById('inv-content');
    if (!c) return;
    c.innerHTML = renderCarteiraTab(rf, rv, redemptions);
    buildCarteiraCharts(rf, rv, redemptions);
    bindCarteiraFilterEvents(rf, rv, redemptions);
  };
  searchEl.addEventListener('input', (e) => { _carteiraSearch = e.target.value; rerender(); });
  sortEl.addEventListener('change',  (e) => { _carteiraSort   = e.target.value; rerender(); });
}

function buildCarteiraCharts(rf, rv, redemptions = []) {
  const totalRF = rf.reduce((s, i) => s + netValue(i, redemptions), 0);
  const totalCripto = rv.filter(i => i.assetType === 'cripto').reduce((s, i) => s + netValue(i, redemptions), 0);
  const totalRVnormal = rv.reduce((s, i) => s + netValue(i, redemptions), 0) - totalCripto;
  if (totalRF + totalRVnormal + totalCripto === 0) return;

  const distL = [], distD = [], distC = [];
  if (totalRF > 0)      { distL.push('Renda Fixa');      distD.push(totalRF);      distC.push('#3B82F6'); }
  if (totalRVnormal > 0){ distL.push('Renda Variável');  distD.push(totalRVnormal); distC.push('#22C55E'); }
  if (totalCripto > 0)  { distL.push('Criptoativos');    distD.push(totalCripto);  distC.push('#A855F7'); }
  createDoughnutChart('chart-distribuicao', distL, distD, distC);

  const allInv = [...rf, ...rv];
  const brasil = allInv.filter(i => i.geography === 'brasil').reduce((s, i) => s + netValue(i, redemptions), 0);
  const global  = allInv.filter(i => i.geography === 'global').reduce((s, i) => s + netValue(i, redemptions), 0);
  const geoL = [], geoD = [], geoC = [];
  if (brasil > 0) { geoL.push('Brasil'); geoD.push(brasil); geoC.push('#3B82F6'); }
  if (global > 0) { geoL.push('Global'); geoD.push(global); geoC.push('#22C55E'); }
  if (geoL.length) createDoughnutChart('chart-geo', geoL, geoD, geoC);
}

// ── Tab 2: Renda Fixa ──

function returnTypeLabel(inv) {
  if (inv.returnType === 'pre')    return `Pré ${inv.rate}% a.a.`;
  if (inv.returnType === 'pos')    return `${inv.percentage}% ${inv.indexer}`;
  if (inv.returnType === 'hybrid') return `${inv.indexer} + ${inv.rate}% a.a.`;
  return '—';
}

function applyRFFilters(rf) {
  let list = [...rf];
  if (_rfSearch) {
    const term = _rfSearch.toLowerCase();
    list = list.filter(i => i.name.toLowerCase().includes(term));
  }
  switch (_rfSort) {
    case 'value_desc':   list.sort((a,b) => b.value - a.value); break;
    case 'value_asc':    list.sort((a,b) => a.value - b.value); break;
    case 'maturity_asc': list.sort((a,b) => a.maturityDate.localeCompare(b.maturityDate)); break;
    case 'maturity_desc':list.sort((a,b) => b.maturityDate.localeCompare(a.maturityDate)); break;
    case 'name_asc':     list.sort((a,b) => a.name.localeCompare(b.name)); break;
  }
  return list;
}

function renderRendaFixaTab(rf, redemptions = [], rates = {}, amortConfirms = []) {
  // Calcula totais usando valor ATUAL (com rendimentos)
  const totalAplicado = rf.reduce((s, i) => s + netValue(i, redemptions), 0);
  const totalAtual    = rf.reduce((s, i) => {
    const nv = netValue(i, redemptions);
    return s + calcCurrentValueRF(nv, i, rates);
  }, 0);
  const totalRendimento = totalAtual - totalAplicado;
  const totalPct = totalAplicado > 0 ? (totalRendimento / totalAplicado) * 100 : 0;

  const pre    = rf.filter(i => i.returnType === 'pre').reduce((s, i) => s + netValue(i, redemptions), 0);
  const pos    = rf.filter(i => i.returnType === 'pos').reduce((s, i) => s + netValue(i, redemptions), 0);
  const hybrid = rf.filter(i => i.returnType === 'hybrid').reduce((s, i) => s + netValue(i, redemptions), 0);
  const filtered = applyRFFilters(rf);

  // IPCA anualizado para exibição
  const ipcaAnual = ((1 + (rates.ipca||0)/100)**12 - 1)*100;
  // Badge de atualização das taxas
  const ratesBadge = rates.stale
    ? `<span class="inv-rates-badge stale">⚠️ Taxas desatualizadas — usando fallback</span>`
    : `<span class="inv-rates-badge ok">✓ Atualizado hoje · ${rates.fetchedAt ? new Date(rates.fetchedAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : ''}</span>`;

  return `
    <div class="animate-fade-in-up">

      <!-- Barra de taxas do BC -->
      <div class="inv-rates-bar">
        <span class="inv-rates-title">📡 Banco Central</span>
        <div class="inv-rates-list">
          <div class="inv-rate-item">
            <span class="inv-rate-label">CDI</span>
            <span class="inv-rate-value">${(rates.cdi||0).toFixed(2)}% a.a.</span>
            ${rates.cdiDaily ? `<span style="font-size:10px;color:var(--color-gray-400);">${rates.cdiDaily.toFixed(4)}%/dia</span>` : ''}
          </div>
          <div class="inv-rate-item">
            <span class="inv-rate-label">SELIC</span>
            <span class="inv-rate-value">${(rates.selic||0).toFixed(2)}% a.a.</span>
          </div>
          <div class="inv-rate-item">
            <span class="inv-rate-label">IPCA</span>
            <span class="inv-rate-value">${(rates.ipca||0).toFixed(2)}%/mês</span>
            <span style="font-size:10px;color:var(--color-gray-400);">${ipcaAnual.toFixed(2)}% a.a.</span>
          </div>
        </div>
        ${ratesBadge}
      </div>

      <div class="dashboard-stats" style="margin-bottom:var(--space-5);">
        <div class="stat-card">
          <div class="stat-icon" style="background:rgba(59,130,246,.1);color:#3B82F6;">🏦</div>
          <div class="stat-content">
            <div class="stat-label">Valor Aplicado</div>
            <div class="stat-value">${formatCurrency(totalAplicado)}</div>
          </div>
        </div>
        <div class="stat-card stagger-1">
          <div class="stat-icon" style="background:rgba(34,197,94,.1);color:#22C55E;">💰</div>
          <div class="stat-content">
            <div class="stat-label">Valor Atual</div>
            <div class="stat-value">${formatCurrency(totalAtual)}</div>
          </div>
        </div>
        <div class="stat-card stagger-2">
          <div class="stat-icon" style="background:rgba(16,185,129,.1);color:#10B981;">📈</div>
          <div class="stat-content">
            <div class="stat-label">Rendimento Total</div>
            <div class="stat-value" style="color:${totalRendimento >= 0 ? 'var(--color-success-600)' : 'var(--color-danger-600)'};">
              ${totalRendimento >= 0 ? '+' : ''}${formatCurrency(totalRendimento)}
            </div>
            <div class="inv-pct-label" style="color:${totalPct >= 0 ? 'var(--color-success-600)' : 'var(--color-danger-600)'};">
              ${totalPct >= 0 ? '+' : ''}${totalPct.toFixed(2)}% desde aplicação
            </div>
          </div>
        </div>
        <div class="stat-card stagger-3">
          <div class="stat-icon" style="background:rgba(99,102,241,.1);color:#6366F1;">📄</div>
          <div class="stat-content">
            <div class="stat-label">Títulos</div>
            <div class="stat-value">${rf.length}</div>
          </div>
        </div>
      </div>

      <div class="inv-charts-row" style="margin-bottom:var(--space-5);">
        <div class="card">
          <div class="card-header"><h3>Distribuição por Tipo</h3></div>
          <div class="chart-container" style="height:220px;">
            ${rf.length > 0 ? '<canvas id="chart-rf-tipo"></canvas>' : emptyChart()}
          </div>
        </div>
        <div class="card">
          <div class="card-header"><h3>Resumo por Tipo</h3></div>
          <div class="inv-rf-legend">
            <div class="inv-rf-type-item">
              <span class="inv-geo-dot" style="background:#3B82F6;"></span>
              <span>Pré-fixado</span>
              <strong>${formatCurrency(pre)}</strong>
            </div>
            <div class="inv-rf-type-item">
              <span class="inv-geo-dot" style="background:#22C55E;"></span>
              <span>Pós-fixado</span>
              <strong>${formatCurrency(pos)}</strong>
            </div>
            <div class="inv-rf-type-item">
              <span class="inv-geo-dot" style="background:#F59E0B;"></span>
              <span>Híbrido</span>
              <strong>${formatCurrency(hybrid)}</strong>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3>Títulos Cadastrados</h3>
        </div>
        <!-- Filtros -->
        <div class="inv-filter-bar">
          <div class="search-input" style="flex:1;">
            ${icons.search}
            <input type="text" id="rf-search" placeholder="Buscar por nome..." value="${escapeHtml(_rfSearch)}">
          </div>
          <select id="rf-sort" class="form-control" style="width:auto;min-width:180px;">
            <option value="maturity_asc"  ${_rfSort==='maturity_asc'  ?'selected':''}>Vencimento próximo</option>
            <option value="maturity_desc" ${_rfSort==='maturity_desc' ?'selected':''}>Vencimento distante</option>
            <option value="value_desc"    ${_rfSort==='value_desc'    ?'selected':''}>Maior valor</option>
            <option value="value_asc"     ${_rfSort==='value_asc'     ?'selected':''}>Menor valor</option>
            <option value="name_asc"      ${_rfSort==='name_asc'      ?'selected':''}>Nome A→Z</option>
          </select>
        </div>

        ${filtered.length > 0 ? `
        <div class="inv-table-wrapper">
          <table class="inv-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Aplicado</th>
                <th>Valor Atual</th>
                <th>Rendimento</th>
                <th>Taxa</th>
                <th>Dias</th>
                <th>Vencimento</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${filtered.map(inv => {
                const nv       = netValue(inv, redemptions);
                const current  = calcCurrentValueRF(nv, inv, rates);
                const { returnBRL, returnPct } = calcReturn(nv, current);
                const redeemed = totalRedeemed(inv, redemptions);
                const dias     = daysSince(inv.applicationDate);
                const rateLabel = formatRateLabel(inv, rates);

                const today2  = new Date(); today2.setHours(0,0,0,0);
                const matDate = new Date(inv.maturityDate + 'T00:00:00');
                const diffDays = Math.ceil((matDate - today2) / (1000*60*60*24));
                const isNear   = diffDays >= 0 && diffDays <= 7;

                return `
                  <tr>
                    <td>
                      <div style="font-weight:var(--font-weight-medium);">${escapeHtml(inv.name)}</div>
                      <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:2px;">
                        <span class="inv-badge inv-badge-${inv.returnType}">${returnTypeLabel(inv)}</span>
                        ${inv.amortization ? `<span class="inv-badge" style="background:#FEF9C3;color:#713F12;">Amortiza</span>` : ''}
                      </div>
                      ${redeemed > 0 ? `<div style="font-size:var(--font-size-xs);color:var(--color-danger-500);margin-top:2px;">Resgatado: ${formatCurrency(redeemed)}</div>` : ''}
                    </td>
                    <td style="color:var(--color-gray-600);">${formatCurrency(nv)}</td>
                    <td>
                      <strong style="color:var(--color-gray-800);">${formatCurrency(current)}</strong>
                    </td>
                    <td>
                      <span style="color:${returnBRL >= 0 ? 'var(--color-success-600)' : 'var(--color-danger-600)'};font-weight:var(--font-weight-semibold);">
                        ${returnBRL >= 0 ? '+' : ''}${formatCurrency(returnBRL)}
                      </span>
                      <div style="font-size:var(--font-size-xs);color:${returnPct >= 0 ? 'var(--color-success-600)' : 'var(--color-danger-600)'};">
                        ${returnPct >= 0 ? '+' : ''}${returnPct.toFixed(2)}%
                      </div>
                    </td>
                    <td style="font-size:var(--font-size-xs);color:var(--color-gray-500);max-width:140px;">${rateLabel}</td>
                    <td style="color:var(--color-gray-500);font-size:var(--font-size-sm);">${dias}d</td>
                    <td>
                      <div>${formatDate(inv.maturityDate)}</div>
                      ${isNear ? `<span class="inv-near-badge">⚠️ ${diffDays === 0 ? 'hoje' : diffDays + 'd'}</span>` : ''}
                    </td>
                    <td style="display:flex;gap:var(--space-1);align-items:center;">
                      ${nv > 0 ? `<button class="btn-redeem redeem-rf" data-id="${inv.id}" data-name="${escapeHtml(inv.name)}" data-net="${nv}" title="Resgatar">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v10"/><path d="m16 6-4 4-4-4"/><rect x="2" y="14" width="20" height="8" rx="2"/></svg>
                        Resgatar
                      </button>` : ''}
                      <button class="btn-icon btn-danger delete-rf" data-id="${inv.id}" title="Excluir">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                      </button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
        ` : `<div class="empty-state" style="padding:var(--space-6);">${rf.length > 0 ? 'Nenhum título encontrado para o filtro.' : 'Nenhum título cadastrado.'}</div>`}
      </div>

      <!-- Cronograma de Amortizações -->
      ${renderAmortizationCalendar(rf, amortConfirms)}
    </div>
  `;
}

function renderAmortizationCalendar(rf, amortConfirms = []) {
  const titlesWithAmort = rf.filter(i => i.amortization && i.amortization.firstDate);
  if (titlesWithAmort.length === 0) return '';

  return `
    <div class="card" style="margin-top:var(--space-5);">
      <div class="card-header" style="border-bottom:1px solid var(--color-gray-100);">
        <h3>📅 Cronograma de Amortizações</h3>
        <span style="font-size:var(--font-size-xs);color:var(--color-gray-400);">Projeção baseada nas regras cadastradas</span>
      </div>

      ${titlesWithAmort.map(inv => {
        const schedule = getAmortizationSchedule(inv);
        if (schedule.length === 0) return '';

        const freqLabel = {
          monthly: 'Mensal', bimonthly: 'Bimestral', quarterly: 'Trimestral',
          semiannual: 'Semestral', annual: 'Anual',
        }[inv.amortization.frequency] || inv.amortization.frequency;

        const typeLabel = inv.amortization.type === 'percentage'
          ? `${inv.amortization.value}% do saldo`
          : `${formatCurrency(inv.amortization.value)} fixo`;

        const totalAmort   = schedule.reduce((s, p) => s + p.amount, 0);
        const pastCount    = schedule.filter(p => p.isPast).length;
        const nextUpcoming = schedule.find(p => !p.isPast);

        return `
          <div class="inv-amort-title-block">
            <div class="inv-amort-title-header">
              <div>
                <div style="font-weight:var(--font-weight-semibold);color:var(--color-gray-800);">${escapeHtml(inv.name)}</div>
                <div style="font-size:var(--font-size-xs);color:var(--color-gray-500);margin-top:2px;">
                  ${freqLabel} · ${typeLabel} · ${schedule.length} parcelas · ${pastCount} realizadas
                  ${nextUpcoming ? `· Próxima: <strong>${formatDate(nextUpcoming.date)}</strong>` : ' · Concluído'}
                </div>
              </div>
              <div style="text-align:right;">
                <div style="font-size:var(--font-size-xs);color:var(--color-gray-400);">Total previsto</div>
                <div style="font-weight:var(--font-weight-semibold);color:var(--color-success-600);">${formatCurrency(totalAmort)}</div>
              </div>
            </div>

            <div class="inv-amort-schedule">
              ${schedule.map(p => {
                const confirmed = amortConfirms.find(
                  c => c.investmentId === inv.id && c.amortIndex === p.index
                );
                const canConfirm = (p.isPast || p.isThisMonth) && !confirmed;
                const rowClass   = confirmed ? 'past' : p.isPast ? 'past' : p.isThisMonth ? 'this-month' : 'future';

                return `
                  <div class="inv-amort-row ${rowClass}">
                    <span class="inv-amort-index">${p.index + 1}</span>
                    <span class="inv-amort-date">${formatDate(p.date)}</span>
                    <span class="inv-amort-amount">+ ${formatCurrency(p.amount)}</span>
                    <span class="inv-amort-balance">saldo: ${formatCurrency(p.balance)}</span>
                    ${p.isThisMonth && !confirmed ? `<span class="inv-amort-badge">Este mês</span>` : ''}
                    ${confirmed
                      ? `<span style="font-size:11px;color:var(--color-success-600);font-weight:600;">✓ Recebido ${formatDate(confirmed.confirmedAt?.split('T')[0])}</span>
                         <button class="btn-icon btn-danger amort-unconfirm" data-id="${confirmed.id}" title="Desfazer">
                           <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/></svg>
                         </button>`
                      : canConfirm
                        ? `<button class="btn-amort-confirm" data-inv-id="${inv.id}" data-inv-name="${escapeHtml(inv.name)}" data-index="${p.index}" data-amount="${p.amount}" data-date="${p.date}">
                             ✓ Confirmar recebimento
                           </button>`
                        : ''
                    }
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function buildRFChart(rf) {
  if (!rf.length) return;
  const pre    = rf.filter(i => i.returnType === 'pre').reduce((s, i) => s + i.value, 0);
  const pos    = rf.filter(i => i.returnType === 'pos').reduce((s, i) => s + i.value, 0);
  const hybrid = rf.filter(i => i.returnType === 'hybrid').reduce((s, i) => s + i.value, 0);
  const l = [], d = [], c = [];
  if (pre)    { l.push('Pré-fixado');  d.push(pre);    c.push('#3B82F6'); }
  if (pos)    { l.push('Pós-fixado');  d.push(pos);    c.push('#22C55E'); }
  if (hybrid) { l.push('Híbrido');     d.push(hybrid); c.push('#F59E0B'); }
  createDoughnutChart('chart-rf-tipo', l, d, c);
}

function bindRFDeleteEvents() {
  document.querySelectorAll('.delete-rf').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!confirm('Excluir este título?')) return;
      deleteInvestmentRF(btn.dataset.id);
      renderTabContent('rf');
    });
  });
}

function bindRFFilterEvents(rf, redemptions = [], rates = {}, amortConfirms = []) {
  const searchEl = document.getElementById('rf-search');
  const sortEl   = document.getElementById('rf-sort');
  if (!searchEl || !sortEl) return;

  const rerender = () => {
    const container = document.getElementById('inv-content');
    if (!container) return;
    container.innerHTML = renderRendaFixaTab(rf, redemptions, rates, amortConfirms);
    buildRFChart(rf);
    bindRFDeleteEvents();
    bindRFFilterEvents(rf, redemptions, rates, amortConfirms);
    bindRedeemEvents('redeem-rf', 'rf', redemptions);
    bindAmortConfirmEvents();
  };

  searchEl.addEventListener('input', (e) => { _rfSearch = e.target.value; rerender(); });
  sortEl.addEventListener('change', (e) => { _rfSort   = e.target.value; rerender(); });
  bindRedeemEvents('redeem-rf', 'rf', redemptions);
}

function bindAmortConfirmEvents() {
  // Confirmar recebimento — abre modal com valor editável
  document.querySelectorAll('.btn-amort-confirm').forEach(btn => {
    btn.addEventListener('click', () => {
      const { invId, invName, index, amount, date } = btn.dataset;
      openAmortConfirmModal({
        invId, invName,
        index:     parseInt(index),
        projected: parseFloat(amount),
        date,
      });
    });
  });

  // Desfazer confirmação
  document.querySelectorAll('.amort-unconfirm').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!confirm('Desfazer esta confirmação?')) return;
      deleteAmortConfirmation(btn.dataset.id);
      showToast('Confirmação removida.', 'success');
      renderTabContent(sessionStorage.getItem('invActiveTab') || 'rf');
    });
  });
}

function openAmortConfirmModal({ invId, invName, index, projected, date }) {
  const bodyHtml = `
    <form id="amort-confirm-form">
      <div class="inv-info-box" style="margin-bottom:var(--space-4);">
        <strong>${escapeHtml(invName)}</strong> — Parcela ${index + 1}
        <div style="font-size:var(--font-size-xs);color:var(--color-gray-500);margin-top:2px;">
          Valor projetado: <strong>${formatCurrency(projected)}</strong>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Valor recebido (R$) *</label>
        <input type="number" id="amort-actual-amount" class="form-control"
          value="${projected.toFixed(2)}" step="0.01" min="0" required>
        <div style="font-size:var(--font-size-xs);color:var(--color-gray-400);margin-top:4px;">
          Edite se o valor recebido foi diferente do projetado
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Data de recebimento *</label>
        <input type="date" id="amort-actual-date" class="form-control" value="${date}" required>
      </div>

      <div class="form-group">
        <label class="form-label">Observação (opcional)</label>
        <input type="text" id="amort-note" class="form-control" placeholder="Ex: Valor com deságio, pagamento antecipado...">
      </div>
    </form>
  `;

  const footerHtml = `
    <button class="btn btn-secondary" id="amort-cancel-btn">Cancelar</button>
    <button class="btn btn-primary" id="amort-save-btn">✓ Confirmar recebimento</button>
  `;

  openModal('✓ Confirmar Recebimento de Amortização', bodyHtml, footerHtml);

  document.getElementById('amort-cancel-btn').addEventListener('click', closeModal);
  document.getElementById('amort-save-btn').addEventListener('click', () => {
    const actualAmount = parseFloat(document.getElementById('amort-actual-amount').value);
    const actualDate   = document.getElementById('amort-actual-date').value;
    const note         = document.getElementById('amort-note').value.trim();

    if (!actualAmount || actualAmount <= 0) {
      showToast('Informe o valor recebido.', 'error');
      return;
    }
    if (!actualDate) {
      showToast('Informe a data de recebimento.', 'error');
      return;
    }

    confirmAmortization({
      investmentId:    invId,
      investmentName:  invName,
      amortIndex:      index,
      projectedAmount: projected,
      amount:          actualAmount,
      date:            actualDate,
      note,
    });

    // Lança receita em Movimentações automaticamente
    addTransaction({
      description: `Amortização — ${invName} (parcela ${index + 1})`,
      amount:      actualAmount,
      date:        actualDate,
      type:        'income',
      categoryId:  'cat_investimentos',
      note:        note || '',
      fromInvestment: true,
    });

    closeModal();
    const diff = actualAmount - projected;
    const diffMsg = diff !== 0
      ? ` (${diff > 0 ? '+' : ''}${formatCurrency(diff)} do projetado)`
      : '';
    showToast(`Amortização de ${formatCurrency(actualAmount)} confirmada e lançada em Movimentações!${diffMsg}`, 'success');
    renderTabContent(sessionStorage.getItem('invActiveTab') || 'rf');
  });
}

// ── Tab 3: Renda Variável ──

function applyRVFilters(rv, redemptions = []) {
  let list = [...rv];
  if (_rvSearch) {
    const t = _rvSearch.toLowerCase();
    list = list.filter(i => i.name.toLowerCase().includes(t) || (i.ticker||'').toLowerCase().includes(t));
  }
  switch (_rvSort) {
    case 'value_desc': list.sort((a,b) => netValue(b, redemptions) - netValue(a, redemptions)); break;
    case 'value_asc':  list.sort((a,b) => netValue(a, redemptions) - netValue(b, redemptions)); break;
    case 'name_asc':   list.sort((a,b) => a.name.localeCompare(b.name)); break;
    case 'sector':     list.sort((a,b) => (a.sector||'').localeCompare(b.sector||'')); break;
    case 'type':       list.sort((a,b) => (a.assetType||'').localeCompare(b.assetType||'')); break;
  }
  return list;
}

function renderRendaVariavelTab(rv, redemptions = []) {
  const total = rv.reduce((s, i) => s + netValue(i, redemptions), 0);
  const numEmpresas = new Set(rv.filter(i => i.assetType === 'acao').map(i => i.ticker)).size;
  const filtered = applyRVFilters(rv, redemptions);

  return `
    <div class="animate-fade-in-up">
      <div class="dashboard-stats" style="margin-bottom:var(--space-5);">
        <div class="stat-card">
          <div class="stat-icon" style="background:rgba(34,197,94,.1);color:#22C55E;">📈</div>
          <div class="stat-content">
            <div class="stat-label">Total em Renda Variável</div>
            <div class="stat-value">${formatCurrency(total)}</div>
          </div>
        </div>
        <div class="stat-card stagger-1">
          <div class="stat-icon" style="background:rgba(59,130,246,.1);color:#3B82F6;">💼</div>
          <div class="stat-content">
            <div class="stat-label">Total de Ativos</div>
            <div class="stat-value">${rv.length}</div>
          </div>
        </div>
        <div class="stat-card stagger-2">
          <div class="stat-icon" style="background:rgba(168,85,247,.1);color:#A855F7;">🏭</div>
          <div class="stat-content">
            <div class="stat-label">Empresas (Ações)</div>
            <div class="stat-value">${numEmpresas}</div>
          </div>
        </div>
      </div>

      <div class="inv-charts-row" style="margin-bottom:var(--space-5);">
        <div class="card">
          <div class="card-header"><h3>Por Setor</h3></div>
          <div class="chart-container" style="height:220px;">
            ${rv.length > 0 ? '<canvas id="chart-rv-setor"></canvas>' : emptyChart()}
          </div>
        </div>
        <div class="card">
          <div class="card-header"><h3>Por Classe de Ativo</h3></div>
          <div class="chart-container" style="height:220px;">
            ${rv.length > 0 ? '<canvas id="chart-rv-tipo"></canvas>' : emptyChart()}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h3>Posição em Renda Variável</h3></div>
        <div class="inv-filter-bar">
          <div class="search-input" style="flex:1;">
            ${icons.search}
            <input type="text" id="rv-search" placeholder="Buscar por nome ou ticker..." value="${escapeHtml(_rvSearch)}">
          </div>
          <select id="rv-sort" class="form-control" style="width:auto;min-width:160px;">
            <option value="value_desc" ${_rvSort==='value_desc'?'selected':''}>Maior valor</option>
            <option value="value_asc"  ${_rvSort==='value_asc' ?'selected':''}>Menor valor</option>
            <option value="name_asc"   ${_rvSort==='name_asc'  ?'selected':''}>Nome A→Z</option>
            <option value="sector"     ${_rvSort==='sector'    ?'selected':''}>Por setor</option>
            <option value="type"       ${_rvSort==='type'      ?'selected':''}>Por tipo</option>
          </select>
        </div>
        ${filtered.length > 0 ? `
        <div class="inv-table-wrapper">
          <table class="inv-table">
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Nome</th>
                <th>Tipo</th>
                <th>Setor</th>
                <th>Qtde</th>
                <th>Preço Médio</th>
                <th>Valor Atual</th>
                <th>Local</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${filtered.map(inv => {
                const nv = netValue(inv, redemptions);
                const redeemed = totalRedeemed(inv, redemptions);
                return `
                  <tr>
                    <td><strong class="inv-ticker">${escapeHtml(inv.ticker || '—')}</strong></td>
                    <td>
                      ${escapeHtml(inv.name)}
                      ${redeemed > 0 ? `<div style="font-size:var(--font-size-xs);color:var(--color-danger-500);">Resgatado: ${formatCurrency(redeemed)}</div>` : ''}
                    </td>
                    <td><span class="inv-badge inv-badge-type">${ASSET_LABELS[inv.assetType] || inv.assetType}</span></td>
                    <td>${SECTOR_LABELS[inv.sector] || inv.sector || '—'}</td>
                    <td>${inv.quantity}</td>
                    <td>${formatCurrency(inv.avgPrice)}</td>
                    <td><strong>${formatCurrency(nv)}</strong>
                      ${redeemed > 0 ? `<div style="font-size:var(--font-size-xs);color:var(--color-gray-400);">Original: ${formatCurrency(inv.value)}</div>` : ''}
                    </td>
                    <td>${inv.geography === 'brasil' ? '🇧🇷' : '🌎'}</td>
                    <td style="display:flex;gap:var(--space-1);">
                      ${nv > 0 ? `<button class="btn-icon btn-redeem redeem-rv" data-id="${inv.id}" data-name="${escapeHtml(inv.name)}" data-net="${nv}" title="Resgatar">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v10"/><path d="m16 6-4 4-4-4"/><rect x="2" y="14" width="20" height="8" rx="2"/></svg>
                      </button>` : ''}
                      <button class="btn-icon btn-danger delete-rv" data-id="${inv.id}" title="Excluir">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                      </button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
        ` : emptySection('Nenhum ativo cadastrado.', 'formulario')}
      </div>
    </div>
  `;
}

function bindRVFilterEvents(rv, redemptions = []) {
  const searchEl = document.getElementById('rv-search');
  const sortEl   = document.getElementById('rv-sort');
  if (!searchEl || !sortEl) return;
  const rerender = () => {
    const c = document.getElementById('inv-content');
    if (!c) return;
    c.innerHTML = renderRendaVariavelTab(rv, redemptions);
    buildRVChart(rv);
    bindRVDeleteEvents();
    bindRVFilterEvents(rv, redemptions);
    bindRedeemEvents('redeem-rv', 'rv', redemptions);
  };
  searchEl.addEventListener('input', (e) => { _rvSearch = e.target.value; rerender(); });
  sortEl.addEventListener('change',  (e) => { _rvSort   = e.target.value; rerender(); });
  bindRedeemEvents('redeem-rv', 'rv', redemptions);
}

function buildRVChart(rv) {
  if (!rv.length) return;
  const COLORS = ['#3B82F6','#22C55E','#F59E0B','#EF4444','#A855F7','#06B6D4','#F97316','#14B8A6','#8B5CF6','#EC4899'];

  const bySector = {};
  rv.forEach(i => { const k = i.sector || 'outros'; bySector[k] = (bySector[k] || 0) + i.value; });
  const sL = Object.keys(bySector).map(k => SECTOR_LABELS[k] || k);
  const sD = Object.values(bySector);
  createDoughnutChart('chart-rv-setor', sL, sD, COLORS.slice(0, sL.length));

  const byType = {};
  rv.forEach(i => { const k = i.assetType || 'outro'; byType[k] = (byType[k] || 0) + i.value; });
  const tL = Object.keys(byType).map(k => ASSET_LABELS[k] || k);
  const tD = Object.values(byType);
  createDoughnutChart('chart-rv-tipo', tL, tD, COLORS.slice(0, tL.length));
}

function bindRVDeleteEvents() {
  document.querySelectorAll('.delete-rv').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!confirm('Excluir este ativo?')) return;
      deleteInvestmentRV(btn.dataset.id);
      renderTabContent('rv');
    });
  });
}

// ── Tab 4: Lançamentos ──

function renderFormularioTab() {
  const rf = getInvestmentsRF();
  const rv = getInvestmentsRV();
  const redemptions = getRedemptions();

  // Lançamentos: entradas (RF+RV) e saídas (resgates) unificados
  const entries = [
    ...rf.map(i => ({ id: i.id, _kind: 'rf', _dir: 'entrada', name: i.name, ticker: '', assetType: null, returnType: i.returnType, indexer: i.indexer, percentage: i.percentage, rate: i.rate, sector: i.sector, value: i.value, date: i.applicationDate, createdAt: i.createdAt, maturityDate: i.maturityDate })),
    ...rv.map(i => ({ id: i.id, _kind: 'rv', _dir: 'entrada', name: i.name, ticker: i.ticker, assetType: i.assetType, sector: i.sector, value: i.value, date: i.createdAt?.split('T')[0], createdAt: i.createdAt })),
    ...redemptions.map(r => {
      const inv = r.investmentType === 'rf' ? rf.find(i => i.id === r.investmentId) : rv.find(i => i.id === r.investmentId);
      return { id: r.id, _kind: r.investmentType, _dir: 'saida', name: inv ? inv.name : 'Investimento removido', ticker: inv?.ticker || '', value: r.amount, date: r.date, createdAt: r.createdAt, note: r.note, _redemptionId: r.id };
    }),
  ].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  return `
    <div class="animate-fade-in-up">
      <div class="transactions-header" style="margin-bottom:var(--space-5);">
        <div>
          <h2 style="font-size:var(--font-size-lg);font-weight:var(--font-weight-semibold);color:var(--color-gray-800);margin:0;">Lançamentos</h2>
          <p style="font-size:var(--font-size-sm);color:var(--color-gray-400);margin:var(--space-1) 0 0;">${entries.length} movimentaç${entries.length !== 1 ? 'ões' : 'ão'}</p>
        </div>
        <button class="btn btn-primary" id="btn-add-inv">
          ${icons.plus}
          <span>Novo Investimento</span>
        </button>
      </div>

      <div class="card animate-fade-in-up" style="padding:0;overflow:hidden;">
        ${entries.length > 0 ? `
        <div class="table-container">
          <table class="table">
            <thead>
              <tr>
                <th>Direção</th>
                <th>Nome</th>
                <th>Detalhes</th>
                <th>Data</th>
                <th class="text-right">Valor</th>
                <th class="text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              ${entries.map(inv => {
                const isSaida = inv._dir === 'saida';
                const isRF = inv._kind === 'rf';
                const icon = isSaida ? '🔴' : (isRF ? '🏦' : '📈');
                const badge = isSaida
                  ? `<span class="inv-badge" style="background:var(--color-danger-50);color:var(--color-danger-600);">Resgate</span>`
                  : isRF
                    ? `<span class="inv-badge inv-badge-${inv.returnType}">${returnTypeLabel(inv)}</span>`
                    : `<span class="inv-badge inv-badge-type">${ASSET_LABELS[inv.assetType] || inv.assetType}</span>`;
                const detail = isSaida
                  ? (inv.note || '—')
                  : isRF
                    ? `Vence ${formatDate(inv.maturityDate)}`
                    : `${SECTOR_LABELS[inv.sector] || inv.sector || '—'}`;
                const deleteClass = isSaida ? 'delete-launch-redemption' : isRF ? 'delete-launch-rf' : 'delete-launch-rv';
                const deleteId = isSaida ? inv._redemptionId : inv.id;

                return `
                  <tr>
                    <td>
                      <div style="display:flex;align-items:center;gap:var(--space-2);">
                        <span style="font-size:18px;">${icon}</span>
                        ${badge}
                      </div>
                    </td>
                    <td>
                      <div style="font-weight:var(--font-weight-medium);">
                        ${inv.ticker ? `<span class="inv-ticker">${escapeHtml(inv.ticker)}</span> ` : ''}${escapeHtml(inv.name)}
                      </div>
                    </td>
                    <td style="color:var(--color-gray-400);font-size:var(--font-size-sm);">${detail}</td>
                    <td style="color:var(--color-gray-500);font-size:var(--font-size-sm);">${inv.date ? formatDate(inv.date) : '—'}</td>
                    <td class="text-right">
                      <span style="font-weight:var(--font-weight-semibold);color:${isSaida ? 'var(--color-danger-600)' : 'var(--color-success-600)'};">
                        ${isSaida ? '−' : '+'} ${formatCurrency(inv.value)}
                      </span>
                    </td>
                    <td class="text-right">
                      <button class="btn-icon btn-danger ${deleteClass}" data-id="${deleteId}" title="Excluir">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                      </button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
        ` : `
        <div class="empty-state" style="padding:var(--space-12);">
          ${icons.emptyBox}
          <h3 style="margin-top:var(--space-4);">Nenhum lançamento ainda</h3>
          <p>Clique em "Novo Investimento" para começar.</p>
        </div>
        `}
      </div>
    </div>
  `;
}

function renderRFFields() {
  return `
    <input type="hidden" name="formType" value="rf">
    <div class="form-group">
      <label class="form-label">Nome do Título *</label>
      <input type="text" name="name" class="form-control" placeholder="Ex: Tesouro Selic 2027, CDB Bradesco" required>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Valor Aplicado (R$) *</label>
        <input type="number" name="value" class="form-control" placeholder="0.00" step="0.01" min="0" required>
      </div>
      <div class="form-group">
        <label class="form-label">Localização</label>
        <select name="geography" class="form-control">
          <option value="brasil">🇧🇷 Brasil</option>
          <option value="global">🌎 Global</option>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Data de Aplicação *</label>
        <input type="date" name="applicationDate" class="form-control" required>
      </div>
      <div class="form-group">
        <label class="form-label">Data de Vencimento *</label>
        <input type="date" name="maturityDate" class="form-control" required>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Tipo de Rentabilidade</label>
      <div class="inv-return-toggle">
        <button type="button" class="inv-return-btn active" data-return="pre">Pré-fixado</button>
        <button type="button" class="inv-return-btn" data-return="pos">Pós-fixado</button>
        <button type="button" class="inv-return-btn" data-return="hybrid">Híbrido</button>
      </div>
      <input type="hidden" name="returnType" value="pre">
    </div>
    <div id="rf-pre-fields">
      <div class="form-group">
        <label class="form-label">Taxa (% a.a.) *</label>
        <input type="number" name="preRate" class="form-control" placeholder="Ex: 12.5" step="0.01" min="0">
      </div>
    </div>
    <div id="rf-pos-fields" style="display:none;">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">% do Indexador</label>
          <input type="number" name="posPercentage" class="form-control" placeholder="Ex: 100" step="0.01" min="0">
        </div>
        <div class="form-group">
          <label class="form-label">Indexador</label>
          <select name="posIndexer" class="form-control">
            <option value="CDI">CDI</option>
            <option value="SELIC">SELIC</option>
            <option value="IPCA">IPCA</option>
            <option value="IGPM">IGP-M</option>
          </select>
        </div>
      </div>
    </div>
    <div id="rf-hybrid-fields" style="display:none;">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Indexador</label>
          <select name="hybridIndexer" class="form-control">
            <option value="IPCA">IPCA</option>
            <option value="CDI">CDI</option>
            <option value="IGPM">IGP-M</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Taxa adicional (% a.a.)</label>
          <input type="number" name="hybridRate" class="form-control" placeholder="Ex: 6.0" step="0.01" min="0">
        </div>
      </div>
    </div>

    <!-- Amortização -->
    <div class="inv-amort-toggle-row">
      <label class="inv-amort-toggle-label">
        <input type="checkbox" name="hasAmortization" id="rf-has-amort" value="true">
        <span>Este título possui amortizações periódicas</span>
        <span style="font-size:var(--font-size-xs);color:var(--color-gray-400);margin-left:4px;">(CRI, CRA, Debênture, etc.)</span>
      </label>
    </div>
    <div id="rf-amort-fields" style="display:none;">
      <div class="inv-amort-box">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Frequência</label>
            <select name="amortFrequency" class="form-control">
              <option value="monthly">Mensal</option>
              <option value="bimonthly">Bimestral</option>
              <option value="quarterly">Trimestral</option>
              <option value="semiannual" selected>Semestral</option>
              <option value="annual">Anual</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Tipo de amortização</label>
            <select name="amortType" class="form-control" id="rf-amort-type">
              <option value="percentage">% do saldo devedor</option>
              <option value="fixed">Valor fixo (R$)</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label" id="rf-amort-value-label">Percentual por parcela (%)</label>
            <input type="number" name="amortValue" class="form-control" placeholder="Ex: 10" step="0.01" min="0">
          </div>
          <div class="form-group">
            <label class="form-label">Data da 1ª amortização *</label>
            <input type="date" name="firstAmortDate" class="form-control">
          </div>
        </div>
        <div class="inv-info-box" style="margin-top:0;">
          💡 O app vai calcular todas as datas de amortização automaticamente e alertar quando chegar a hora.
        </div>
      </div>
    </div>
  `;
}

function renderRVFields() {
  return `
    <input type="hidden" name="formType" value="rv">
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Ticker / Código</label>
        <input type="text" name="ticker" class="form-control" placeholder="Ex: PETR4, BTC, HGLG11" style="text-transform:uppercase;">
      </div>
      <div class="form-group">
        <label class="form-label">Nome *</label>
        <input type="text" name="name" class="form-control" placeholder="Ex: Petrobras, Bitcoin" required>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Classe de Ativo *</label>
        <select name="assetType" class="form-control" required>
          <option value="acao">Ação</option>
          <option value="fii">FII</option>
          <option value="etf">ETF</option>
          <option value="bdr">BDR</option>
          <option value="cripto">Cripto</option>
          <option value="outro">Outro</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Setor / Segmento</label>
        <select name="sector" class="form-control">
          <optgroup label="Ações">
            <option value="tecnologia">Tecnologia</option>
            <option value="financas">Finanças</option>
            <option value="energia">Energia</option>
            <option value="saude">Saúde</option>
            <option value="consumo">Consumo</option>
            <option value="industrial">Industrial</option>
            <option value="utilities">Utilities</option>
            <option value="imobiliario">Imobiliário</option>
          </optgroup>
          <optgroup label="FIIs">
            <option value="papel">Papel</option>
            <option value="tijolo">Tijolo</option>
            <option value="logistica">Logística</option>
            <option value="shoppings">Shoppings</option>
            <option value="fof">FoF</option>
          </optgroup>
          <option value="outros">Outros</option>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Quantidade *</label>
        <input type="number" name="quantity" class="form-control" placeholder="Ex: 100" step="0.00000001" min="0" required>
      </div>
      <div class="form-group">
        <label class="form-label">Preço Médio (R$) *</label>
        <input type="number" name="avgPrice" class="form-control" placeholder="Ex: 32.50" step="0.01" min="0" required>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Localização</label>
      <select name="geography" class="form-control">
        <option value="brasil">🇧🇷 Brasil</option>
        <option value="global">🌎 Global</option>
      </select>
    </div>
    <div class="inv-info-box">
      Valor total calculado automaticamente: <strong>Quantidade × Preço Médio</strong>
    </div>
  `;
}

function bindFormEvents() {
  const addBtn = document.getElementById('btn-add-inv');
  if (addBtn) addBtn.addEventListener('click', openInvModal);

  document.querySelectorAll('.delete-launch-rf').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!confirm('Excluir este lançamento?')) return;
      deleteInvestmentRF(btn.dataset.id);
      renderTabContent('formulario');
    });
  });

  document.querySelectorAll('.delete-launch-rv').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!confirm('Excluir este lançamento?')) return;
      deleteInvestmentRV(btn.dataset.id);
      renderTabContent('formulario');
    });
  });

  document.querySelectorAll('.delete-launch-redemption').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!confirm('Excluir este resgate?')) return;
      deleteRedemption(btn.dataset.id);
      renderTabContent('formulario');
    });
  });
}

function openInvModal() {
  const bodyHtml = `
    <div class="inv-toggle-group" style="margin-bottom:var(--space-5);">
      <button class="inv-toggle active" data-type="rf">🏦 Renda Fixa</button>
      <button class="inv-toggle" data-type="rv">📈 Renda Variável</button>
    </div>
    <form id="inv-form">
      <div id="inv-form-fields">${renderRFFields()}</div>
    </form>
  `;

  openModal(
    'Novo Investimento',
    bodyHtml,
    `<button type="button" class="btn btn-ghost" id="modal-cancel">Cancelar</button>
     <button type="button" class="btn btn-primary" id="modal-save">Salvar</button>`
  );

  document.getElementById('modal-cancel')?.addEventListener('click', closeModal);

  document.querySelectorAll('.inv-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.inv-toggle').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const fieldsEl = document.getElementById('inv-form-fields');
      if (!fieldsEl) return;
      fieldsEl.innerHTML = btn.dataset.type === 'rf' ? renderRFFields() : renderRVFields();
      if (btn.dataset.type === 'rf') bindReturnTypeEvents();
    });
  });

  bindReturnTypeEvents();

  document.getElementById('modal-save')?.addEventListener('click', () => {
    const form = document.getElementById('inv-form');
    if (!form) return;
    const data = Object.fromEntries(new FormData(form));
    data.formType === 'rf' ? handleAddRF(data) : handleAddRV(data);
  });
}

function bindReturnTypeEvents() {
  document.querySelectorAll('.inv-return-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.inv-return-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const rt = btn.dataset.return;
      const rtInput = document.querySelector('[name="returnType"]');
      if (rtInput) rtInput.value = rt;
      document.getElementById('rf-pre-fields').style.display    = rt === 'pre'    ? '' : 'none';
      document.getElementById('rf-pos-fields').style.display    = rt === 'pos'    ? '' : 'none';
      document.getElementById('rf-hybrid-fields').style.display = rt === 'hybrid' ? '' : 'none';
    });
  });

  // Toggle amortização
  const amortCheck = document.getElementById('rf-has-amort');
  const amortFields = document.getElementById('rf-amort-fields');
  if (amortCheck && amortFields) {
    amortCheck.addEventListener('change', () => {
      amortFields.style.display = amortCheck.checked ? '' : 'none';
    });
  }

  // Troca label ao mudar tipo de amortização
  const amortType = document.getElementById('rf-amort-type');
  const amortLabel = document.getElementById('rf-amort-value-label');
  if (amortType && amortLabel) {
    amortType.addEventListener('change', () => {
      amortLabel.textContent = amortType.value === 'percentage'
        ? 'Percentual por parcela (%)'
        : 'Valor fixo por parcela (R$)';
    });
  }
}

function handleAddRF(data) {
  if (!data.name || !data.value || !data.applicationDate || !data.maturityDate) {
    showToast('Preencha todos os campos obrigatórios.', 'error');
    return;
  }
  const returnType = data.returnType || 'pre';
  const rate       = returnType === 'pre'    ? parseFloat(data.preRate)    || 0
                   : returnType === 'hybrid'  ? parseFloat(data.hybridRate) || 0
                   : 0;
  const percentage = returnType === 'pos'    ? parseFloat(data.posPercentage) || 0 : 0;
  const indexer    = returnType === 'pos'    ? (data.posIndexer    || 'CDI')
                   : returnType === 'hybrid'  ? (data.hybridIndexer || 'IPCA')
                   : '';

  // Amortização
  const hasAmortization = data.hasAmortization === 'true';
  const amortization = hasAmortization ? {
    frequency:      data.amortFrequency   || 'semiannual',
    type:           data.amortType        || 'percentage',
    value:          parseFloat(data.amortValue) || 0,
    firstDate:      data.firstAmortDate   || '',
  } : null;

  addInvestmentRF({
    name: data.name.trim(),
    value: parseFloat(data.value),
    applicationDate: data.applicationDate,
    maturityDate: data.maturityDate,
    returnType,
    rate,
    percentage,
    indexer,
    geography: data.geography || 'brasil',
    amortization,
  });
  closeModal();
  showToast('Título adicionado com sucesso!', 'success');
  renderTabContent('formulario');
}

function handleAddRV(data) {
  if (!data.name || !data.quantity || !data.avgPrice) {
    showToast('Preencha todos os campos obrigatórios.', 'error');
    return;
  }
  addInvestmentRV({
    ticker: (data.ticker || '').toUpperCase().trim(),
    name: data.name.trim(),
    assetType: data.assetType || 'acao',
    sector: data.sector || 'outros',
    quantity: parseFloat(data.quantity),
    avgPrice: parseFloat(data.avgPrice),
    geography: data.geography || 'brasil',
  });
  closeModal();
  showToast('Ativo adicionado com sucesso!', 'success');
  renderTabContent('formulario');
}

// ── Resgates ──

function bindRedeemEvents(cls, type, redemptions) {
  document.querySelectorAll('.' + cls).forEach(btn => {
    btn.addEventListener('click', () => {
      const id   = btn.dataset.id;
      const name = btn.dataset.name;
      const net  = parseFloat(btn.dataset.net);
      openRedemptionModal(id, name, net, type, redemptions);
    });
  });
}

function openRedemptionModal(id, name, netVal, type, redemptions) {
  openModal(
    'Registrar Resgate',
    `<div class="form-group">
       <label class="form-label">Investimento</label>
       <div style="padding:var(--space-3);background:var(--color-gray-50);border-radius:var(--radius-md);font-weight:var(--font-weight-medium);">${escapeHtml(name)}</div>
     </div>
     <div class="form-group">
       <label class="form-label">Saldo disponível</label>
       <div style="padding:var(--space-3);background:var(--color-success-50);border-radius:var(--radius-md);color:var(--color-success-700);font-weight:var(--font-weight-semibold);">${formatCurrency(netVal)}</div>
     </div>
     <div class="form-row">
       <div class="form-group">
         <label class="form-label">Valor do Resgate (R$) *</label>
         <input type="number" id="redeem-amount" class="form-control" placeholder="0.00" step="0.01" min="0.01" max="${netVal}">
       </div>
       <div class="form-group">
         <label class="form-label">Data do Resgate *</label>
         <input type="date" id="redeem-date" class="form-control" value="${new Date().toISOString().split('T')[0]}">
       </div>
     </div>
     <div class="form-group">
       <label class="form-label">Observação (opcional)</label>
       <input type="text" id="redeem-note" class="form-control" placeholder="Ex: Resgate parcial para emergência">
     </div>`,
    `<button type="button" class="btn btn-ghost" id="modal-cancel">Cancelar</button>
     <button type="button" class="btn btn-danger" id="modal-redeem-save">Confirmar Resgate</button>`
  );

  document.getElementById('modal-cancel')?.addEventListener('click', closeModal);

  document.getElementById('modal-redeem-save')?.addEventListener('click', () => {
    const amount = parseFloat(document.getElementById('redeem-amount')?.value || '0');
    const date   = document.getElementById('redeem-date')?.value || '';
    const note   = document.getElementById('redeem-note')?.value?.trim() || '';

    if (!amount || amount <= 0) { showToast('Informe um valor de resgate.', 'error'); return; }
    if (amount > netVal)        { showToast(`Valor máximo: ${formatCurrency(netVal)}`, 'error'); return; }
    if (!date)                  { showToast('Informe a data do resgate.', 'error'); return; }

    addRedemption({ investmentId: id, investmentType: type, amount, date, note });

    // Lança receita em Movimentações automaticamente
    addTransaction({
      description: `Resgate — ${name}`,
      amount,
      date,
      type: 'income',
      categoryId: 'cat_investimentos',
      note: note || '',
      fromInvestment: true,
    });

    closeModal();
    showToast('Resgate registrado e lançado em Movimentações!', 'success');
    renderTabContent(type === 'rf' ? 'rf' : 'rv');
  });
}

// ── Helpers ──

function emptyChart() {
  return '<div class="empty-state" style="padding:var(--space-6);height:100%;display:flex;align-items:center;justify-content:center;">Sem dados para exibir</div>';
}

function emptySection(msg, tab) {
  return `
    <div class="empty-state" style="padding:var(--space-8);">
      <p>${msg} <button class="btn-link" onclick="document.querySelector('[data-inv-tab=${tab}]').click()">Adicionar agora</button></p>
    </div>
  `;
}
