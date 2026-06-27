// ============================================
// FINANÇAS PRO — Investments Page
// ============================================

import { formatCurrency, formatDate, escapeHtml, icons } from '../utils.js';
import { getRates, calcCurrentValueRF, calcValueRFAtDate, calcReturn, formatRateLabel, daysSince } from '../services/rates.js';
import { getQuotes, getLastUpdateTime, calcRVReturn, getDividends } from '../services/quotes.js';
import { getFundInfo, classifyFund, normalizeCNPJ, getManualQuotas, saveManualQuota, clearFundQuotaCache } from '../services/funds.js';
import {
  getInvestmentsRF, addInvestmentRF, updateInvestmentRF, deleteInvestmentRF,
  getInvestmentsRV, addInvestmentRV, updateInvestmentRV, deleteInvestmentRV,
  getInvestmentsFunds, addInvestmentFund, updateInvestmentFund, deleteInvestmentFund,
  getRedemptions, addRedemption, deleteRedemption,
  getAmortConfirmations, confirmAmortization, deleteAmortConfirmation,
  getDivConfirmations, confirmDividend, deleteDivConfirmation,
  addTransaction, getTransactions,
} from '../storage.js';
import { renderSidebar, bindSidebarEvents } from '../components/sidebar.js';
import { renderHeader, bindHeaderEvents } from '../components/header.js';
import { createDoughnutChart, createLineChart, destroyAllCharts } from '../components/charts.js';
import { showToast } from '../components/toast.js';
import { openModal, closeModal } from '../components/modal.js';

let _tabChangeHandler = null;
let _rates     = null; // cache das taxas BCB
let _quotes    = null; // cache das cotações RV
let _dividends = null; // cache dos dividendos
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
    case 'historico': {
      const carteiraSubTab = tab === 'historico' ? 'historico' : (sessionStorage.getItem('carteiraSubTab') || 'visaogeral');
      sessionStorage.setItem('carteiraSubTab', carteiraSubTab);
      const funds = getInvestmentsFunds();
      container.innerHTML = renderCarteiraWithSubTabs(rf, rv, funds, redemptions, rates, amortConfirms, carteiraSubTab);
      if (carteiraSubTab === 'visaogeral') {
        buildCarteiraCharts(rf, rv, redemptions);
        bindCarteiraFilterEvents(rf, rv, redemptions);
        bindAmortConfirmEvents();
      } else {
        bindHistoricoEvents();
      }
      bindCarteiraSubTabEvents();
      break;
    }
    case 'rf':
    case 'amortizacoes': {
      const rfSubTab = tab === 'amortizacoes' ? 'amortizacoes' : (sessionStorage.getItem('rfSubTab') || 'posicao');
      sessionStorage.setItem('rfSubTab', rfSubTab);
      container.innerHTML = renderRFWithSubTabs(rf, redemptions, rates, amortConfirms, rfSubTab);
      if (rfSubTab === 'posicao') {
        buildRFChart(rf);
        bindRFDeleteEvents();
        bindRFFilterEvents(rf, redemptions, rates, amortConfirms);
      }
      bindAmortConfirmEvents();
      bindRFSubTabEvents();
      break;
    }
    case 'rv':
    case 'dividendos': {
      const tickers = [...new Set(rv.map(i => i.ticker).filter(Boolean))];
      const rvSubTab = tab === 'dividendos' ? 'dividendos' : (sessionStorage.getItem('rvSubTab') || 'posicao');
      sessionStorage.setItem('rvSubTab', rvSubTab);

      // Busca cotações se necessário
      if (tickers.length > 0 && !_quotes) {
        container.innerHTML = `<div style="padding:var(--space-8);text-align:center;color:var(--color-gray-400);">Buscando cotações...</div>`;
        _quotes = await getQuotes(tickers);
      } else if (tickers.length > 0) {
        const missing = tickers.filter(t => !_quotes[t]);
        if (missing.length > 0) {
          const fresh = await getQuotes(missing);
          _quotes = { ..._quotes, ...fresh };
        }
      }

      // Busca dividendos se necessário
      if (rvSubTab === 'dividendos' && tickers.length > 0 && !_dividends) {
        container.innerHTML = `<div style="padding:var(--space-8);text-align:center;color:var(--color-gray-400);">Buscando dividendos...</div>`;
        localStorage.removeItem('fp_dividends_cache');
        _dividends = await getDividends(tickers);
      }

      const quotes     = _quotes || {};
      const divConfirms = getDivConfirmations();
      container.innerHTML = renderRVWithSubTabs(rv, redemptions, quotes, _dividends || {}, divConfirms, rvSubTab);

      if (rvSubTab === 'posicao') {
        buildRVChart(rv);
        bindRVDeleteEvents();
        bindRVFilterEvents(rv, redemptions, quotes);
        bindRedeemEvents('redeem-rv', 'rv', redemptions);
      } else {
        bindDividendEvents();
      }
      bindRVSubTabEvents(rv, redemptions, quotes, divConfirms);
      break;
    }
    case 'fundos': {
      const funds  = getInvestmentsFunds();
      const quotas = getManualQuotas();
      container.innerHTML = renderFundosTab(funds, quotas);
      bindFundEvents();
      break;
    }
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

    <!-- Evolução Patrimonial -->
    <div class="card" style="margin-top:var(--space-5);">
      <div class="card-header">
        <h3>📈 Evolução Patrimonial</h3>
        <span style="font-size:var(--font-size-xs);color:var(--color-gray-400);">Últimos 12 meses · RF estimada com taxa atual · RV e Fundos pelo custo de aquisição</span>
      </div>
      <div style="height:260px;padding:var(--space-4);">
        <canvas id="chart-evolution"></canvas>
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

  const funds = getInvestmentsFunds();
  buildEvolutionChart(rf, rv, funds, redemptions, _rates || {});
}

function buildEvolutionChart(rf, rv, funds, redemptions, rates) {
  const today = new Date(); today.setHours(0, 0, 0, 0);

  // Últimos 12 meses + hoje
  const points = [];
  for (let i = 11; i >= 0; i--) {
    points.push(new Date(today.getFullYear(), today.getMonth() - i, 1));
  }
  points.push(today);

  const labels = points.map(d =>
    d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
  );

  function redeemedBefore(invId, refDate) {
    return redemptions
      .filter(r => r.investmentId === invId && r.date && new Date(r.date + 'T00:00:00') <= refDate)
      .reduce((s, r) => s + (r.amount || 0), 0);
  }

  const aportadoData = points.map(ref => {
    let total = 0;
    rf.forEach(inv => {
      if (new Date(inv.applicationDate + 'T00:00:00') > ref) return;
      total += Math.max(0, inv.value - redeemedBefore(inv.id, ref));
    });
    rv.forEach(inv => {
      if (inv.applicationDate && new Date(inv.applicationDate + 'T00:00:00') > ref) return;
      total += Math.max(0, (inv.quantity || 0) * (inv.avgPrice || 0) - redeemedBefore(inv.id, ref));
    });
    funds.forEach(f => {
      if (f.applicationDate && new Date(f.applicationDate + 'T00:00:00') > ref) return;
      total += Math.max(0, (parseFloat(f.quotas) || 0) * (parseFloat(f.avgQuotaPrice) || 0) - redeemedBefore(f.id, ref));
    });
    return Math.max(0, total);
  });

  const estimadoData = points.map((ref, idx) => {
    const isToday = idx === points.length - 1;
    let total = 0;
    rf.forEach(inv => {
      if (new Date(inv.applicationDate + 'T00:00:00') > ref) return;
      const nv = Math.max(0, inv.value - redeemedBefore(inv.id, ref));
      total += isToday ? calcCurrentValueRF(nv, inv, rates) : calcValueRFAtDate(nv, inv, rates, ref);
    });
    rv.forEach(inv => {
      if (inv.applicationDate && new Date(inv.applicationDate + 'T00:00:00') > ref) return;
      total += Math.max(0, (inv.quantity || 0) * (inv.avgPrice || 0) - redeemedBefore(inv.id, ref));
    });
    funds.forEach(f => {
      if (f.applicationDate && new Date(f.applicationDate + 'T00:00:00') > ref) return;
      total += Math.max(0, (parseFloat(f.quotas) || 0) * (parseFloat(f.avgQuotaPrice) || 0) - redeemedBefore(f.id, ref));
    });
    return Math.max(0, total);
  });

  const hasRF = rf.some(i => i.returnType);
  createLineChart('chart-evolution', labels, [
    { label: 'Capital Investido', data: aportadoData, color: '#94A3B8', fill: false },
    ...(hasRF ? [{ label: 'Valor Estimado', data: estimadoData, color: '#3B82F6', fill: true }] : []),
  ]);
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

  // Liquidez
  const liqDaily     = rf.filter(i => i.liquidity === 'daily').reduce((s, i) => s + netValue(i, redemptions), 0);
  const liqMaturity  = rf.filter(i => !i.liquidity || i.liquidity === 'maturity').reduce((s, i) => s + netValue(i, redemptions), 0);
  const liqPct = totalAplicado > 0 ? (liqDaily / totalAplicado * 100).toFixed(0) : 0;
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

      <!-- Quadrantes de Liquidez -->
      <div class="liq-quadrants">
        <div class="liq-quadrant liq-quadrant-green">
          <div class="liq-q-icon">🛡️</div>
          <div class="liq-q-label">Reserva de Emergência</div>
          <div class="liq-q-value">${formatCurrency(liqDaily)}</div>
          <div class="liq-q-sub">${rf.filter(i => i.liquidity === 'daily').length} título${rf.filter(i => i.liquidity === 'daily').length !== 1 ? 's' : ''} · liquidez diária</div>
          <div class="liq-q-pct">${liqPct}% da carteira</div>
        </div>
        <div class="liq-quadrant liq-quadrant-gray">
          <div class="liq-q-icon">🔒</div>
          <div class="liq-q-label">No Vencimento</div>
          <div class="liq-q-value">${formatCurrency(liqMaturity)}</div>
          <div class="liq-q-sub">${rf.filter(i => !i.liquidity || i.liquidity === 'maturity').length} título${rf.filter(i => !i.liquidity || i.liquidity === 'maturity').length !== 1 ? 's' : ''} · travado</div>
          <div class="liq-q-pct">${totalAplicado > 0 ? (liqMaturity/totalAplicado*100).toFixed(0) : 0}% da carteira</div>
        </div>
      </div>

      <div class="inv-charts-row" style="margin-bottom:var(--space-5);">

        <!-- Por Indexador -->
        <div class="card">
          <div class="card-header"><h3>Por Indexador</h3></div>
          <div class="inv-rf-legend">
            ${[
              { label: 'CDI',      color: '#3B82F6', val: rf.filter(i => (i.returnType==='pos' && (i.posIndexer||i.indexer||'CDI').toUpperCase()==='CDI') ).reduce((s,i)=>s+netValue(i,redemptions),0) },
              { label: 'SELIC',    color: '#6366F1', val: rf.filter(i => (i.returnType==='pos' && (i.posIndexer||i.indexer||'').toUpperCase()==='SELIC') ).reduce((s,i)=>s+netValue(i,redemptions),0) },
              { label: 'Pré',      color: '#22C55E', val: rf.filter(i => i.returnType==='pre').reduce((s,i)=>s+netValue(i,redemptions),0) },
              { label: 'Inflação', color: '#F59E0B', val: rf.filter(i => i.returnType==='hybrid' || (i.returnType==='pos' && ['IPCA','IGPM'].includes((i.posIndexer||i.indexer||'').toUpperCase()))).reduce((s,i)=>s+netValue(i,redemptions),0) },
            ].filter(r => r.val > 0).map(r => `
              <div class="inv-rf-type-item">
                <span class="inv-geo-dot" style="background:${r.color};"></span>
                <span>${r.label}</span>
                <span class="rf-legend-pct">${totalAplicado > 0 ? (r.val/totalAplicado*100).toFixed(0) : 0}%</span>
                <strong>${formatCurrency(r.val)}</strong>
              </div>`).join('') || '<div style="padding:var(--space-4);color:var(--color-gray-400);font-size:var(--font-size-sm);">Nenhum título cadastrado</div>'}
          </div>
        </div>

        <!-- Por Categoria -->
        <div class="card">
          <div class="card-header"><h3>Por Categoria</h3></div>
          <div class="inv-rf-legend">
            ${[
              { label: 'Título Público',  color: '#6366F1', key: 'publico'  },
              { label: 'Bancário',        color: '#3B82F6', key: 'bancario' },
              { label: 'Crédito Privado', color: '#F59E0B', key: 'privado'  },
            ].map(cat => {
              const val = rf.filter(i => (i.category||'bancario') === cat.key).reduce((s,i)=>s+netValue(i,redemptions),0);
              if (!val) return '';
              return `
                <div class="inv-rf-type-item">
                  <span class="inv-geo-dot" style="background:${cat.color};"></span>
                  <span>${cat.label}</span>
                  <span class="rf-legend-pct">${totalAplicado > 0 ? (val/totalAplicado*100).toFixed(0) : 0}%</span>
                  <strong>${formatCurrency(val)}</strong>
                </div>`;
            }).join('') || '<div style="padding:var(--space-4);color:var(--color-gray-400);font-size:var(--font-size-sm);">Nenhum título cadastrado</div>'}
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
                        ${inv.liquidity === 'daily'
                          ? `<span class="liq-badge liq-badge-daily">🛡️ Reserva</span>`
                          : `<span class="liq-badge liq-badge-maturity">🔒 Vencimento</span>`}
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
                      ${nv > 0 ? `<button class="btn-redeem redeem-rf"
                        data-id="${inv.id}" data-name="${escapeHtml(inv.name)}"
                        data-net="${nv}" data-invested="${nv}" data-current="${current}"
                        title="Resgatar">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v10"/><path d="m16 6-4 4-4-4"/><rect x="2" y="14" width="20" height="8" rx="2"/></svg>
                        Resgatar
                      </button>` : ''}
                      <button class="btn-icon edit-rf" data-id="${inv.id}" data-name="${escapeHtml(inv.name)}" title="Editar nome">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
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
  // gráfico removido — substituído por cards de indexador e categoria
}

function bindRFDeleteEvents() {
  document.querySelectorAll('.edit-rf').forEach(btn => {
    btn.addEventListener('click', () =>
      openEditNameModal(btn.dataset.id, btn.dataset.name, updateInvestmentRF, 'rf')
    );
  });

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

// ── Wrapper RV com sub-abas ──────────────────────────────────────────────────

function renderRVWithSubTabs(rv, redemptions, quotes, dividends, divConfirms, activeSubTab) {
  const subTabBar = `
    <div class="rv-subtab-bar">
      <button class="rv-subtab ${activeSubTab === 'posicao' ? 'active' : ''}" data-rv-subtab="posicao">
        📈 Posição
      </button>
      <button class="rv-subtab ${activeSubTab === 'dividendos' ? 'active' : ''}" data-rv-subtab="dividendos">
        💵 Dividendos
      </button>
    </div>
  `;
  const content = activeSubTab === 'dividendos'
    ? renderDividendosTab(rv, dividends, divConfirms)
    : renderRendaVariavelTab(rv, redemptions, quotes);

  return subTabBar + content;
}

function bindRVSubTabEvents(rv, redemptions, quotes, divConfirms) {
  document.querySelectorAll('[data-rv-subtab]').forEach(btn => {
    btn.addEventListener('click', () => {
      sessionStorage.setItem('rvSubTab', btn.dataset.rvSubtab);
      renderTabContent('rv');
    });
  });
}

function renderRendaVariavelTab(rv, redemptions = [], quotes = {}) {
  const numEmpresas = new Set(rv.filter(i => i.assetType === 'acao').map(i => i.ticker)).size;
  const filtered    = applyRVFilters(rv, redemptions);

  // Totais usando preço atual quando disponível
  let totalInvestido = 0;
  let totalAtual     = 0;
  rv.forEach(inv => {
    const q   = quotes[inv.ticker?.toUpperCase()];
    const qty = parseFloat(inv.quantity) || 0;
    totalInvestido += qty * (parseFloat(inv.avgPrice) || 0);
    totalAtual     += q?.price ? qty * q.price : qty * (parseFloat(inv.avgPrice) || 0);
  });
  const totalRetorno    = totalAtual - totalInvestido;
  const totalRetornoPct = totalInvestido > 0 ? (totalRetorno / totalInvestido) * 100 : 0;

  // Última atualização
  const lastUpdate    = getLastUpdateTime(quotes);
  const lastUpdateStr = lastUpdate
    ? `Atualizado às ${lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
    : 'Cotações não carregadas';

  return `
    <div class="animate-fade-in-up">

      <!-- Barra de cotações -->
      <div class="inv-rates-bar">
        <span class="inv-rates-title">📡 Cotações ao vivo</span>
        <div class="inv-rates-list">
          ${rv.filter(i => i.ticker).slice(0, 6).map(inv => {
            const q = quotes[inv.ticker?.toUpperCase()];
            if (!q || !q.price) return `<div class="inv-rate-item"><span class="inv-rate-label">${inv.ticker}</span><span style="font-size:10px;color:var(--color-gray-400);" title="Sem cotação na BRAPI">indisponível</span></div>`;
            const up = q.change >= 0;
            return `
              <div class="inv-rate-item">
                <span class="inv-rate-label">${inv.ticker}</span>
                <span class="inv-rate-value">${formatCurrency(q.price)}</span>
                <span style="font-size:10px;color:${up ? 'var(--color-success-600)' : 'var(--color-danger-600)'};">
                  ${up ? '▲' : '▼'} ${Math.abs(q.change).toFixed(2)}%
                </span>
              </div>`;
          }).join('')}
        </div>
        <span class="inv-rates-badge ok">✓ ${lastUpdateStr}</span>
        <button id="btn-refresh-quotes" style="margin-left:auto;background:none;border:none;cursor:pointer;font-size:var(--font-size-xs);color:var(--color-gray-500);display:flex;align-items:center;gap:4px;" title="Atualizar cotações agora">
          🔄 Atualizar
        </button>
      </div>

      <!-- Cards de resumo -->
      <div class="dashboard-stats" style="margin-bottom:var(--space-5);">
        <div class="stat-card">
          <div class="stat-icon" style="background:rgba(59,130,246,.1);color:#3B82F6;">💰</div>
          <div class="stat-content">
            <div class="stat-label">Total Investido</div>
            <div class="stat-value">${formatCurrency(totalInvestido)}</div>
          </div>
        </div>
        <div class="stat-card stagger-1">
          <div class="stat-icon" style="background:rgba(34,197,94,.1);color:#22C55E;">📈</div>
          <div class="stat-content">
            <div class="stat-label">Valor Atual</div>
            <div class="stat-value">${formatCurrency(totalAtual)}</div>
          </div>
        </div>
        <div class="stat-card stagger-2">
          <div class="stat-icon" style="background:rgba(16,185,129,.1);color:#10B981;">🎯</div>
          <div class="stat-content">
            <div class="stat-label">Rendimento Total</div>
            <div class="stat-value" style="color:${totalRetorno >= 0 ? 'var(--color-success-600)' : 'var(--color-danger-600)'};">
              ${totalRetorno >= 0 ? '+' : ''}${formatCurrency(totalRetorno)}
            </div>
            <div class="inv-pct-label" style="color:${totalRetornoPct >= 0 ? 'var(--color-success-600)' : 'var(--color-danger-600)'};">
              ${totalRetornoPct >= 0 ? '+' : ''}${totalRetornoPct.toFixed(2)}%
            </div>
          </div>
        </div>
        <div class="stat-card stagger-3">
          <div class="stat-icon" style="background:rgba(168,85,247,.1);color:#A855F7;">🏭</div>
          <div class="stat-content">
            <div class="stat-label">Ativos / Empresas</div>
            <div class="stat-value">${rv.length} / ${numEmpresas}</div>
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
                <th>Ativo</th>
                <th>Qtde</th>
                <th>Preço Médio</th>
                <th>Preço Atual</th>
                <th>Valor Atual</th>
                <th>Rendimento</th>
                <th>Hoje</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${filtered.map(inv => {
                const nv       = netValue(inv, redemptions);
                const redeemed = totalRedeemed(inv, redemptions);
                const ticker   = inv.ticker?.toUpperCase();
                const q        = quotes[ticker];
                const rv_ret   = q?.price ? calcRVReturn(inv, q.price) : null;
                const currentVal = rv_ret ? rv_ret.current : nv;
                const dayUp    = (q?.change || 0) >= 0;

                return `
                  <tr>
                    <td>
                      <div style="display:flex;align-items:center;gap:var(--space-2);">
                        <strong class="inv-ticker">${escapeHtml(ticker || '—')}</strong>
                        <span class="inv-badge inv-badge-type">${ASSET_LABELS[inv.assetType] || inv.assetType}</span>
                      </div>
                      <div style="font-size:var(--font-size-xs);color:var(--color-gray-400);margin-top:2px;">
                        ${escapeHtml(inv.name)}
                        ${redeemed > 0 ? `· Resgatado: ${formatCurrency(redeemed)}` : ''}
                      </div>
                    </td>
                    <td style="font-weight:var(--font-weight-medium);">${inv.quantity}</td>
                    <td style="color:var(--color-gray-600);">${formatCurrency(inv.avgPrice)}</td>
                    <td>
                      ${q?.price
                        ? `<strong>${formatCurrency(q.price)}</strong>`
                        : `<span style="color:var(--color-gray-400);font-size:var(--font-size-xs);" title="Ticker não encontrado na BRAPI — verifique se o código está correto">⚠ sem cotação</span>`
                      }
                    </td>
                    <td><strong>${formatCurrency(currentVal)}</strong></td>
                    <td>
                      ${rv_ret
                        ? `<span style="color:${rv_ret.returnBRL >= 0 ? 'var(--color-success-600)' : 'var(--color-danger-600)'};font-weight:var(--font-weight-semibold);">
                             ${rv_ret.returnBRL >= 0 ? '+' : ''}${formatCurrency(rv_ret.returnBRL)}
                           </span>
                           <div style="font-size:var(--font-size-xs);color:${rv_ret.returnPct >= 0 ? 'var(--color-success-600)' : 'var(--color-danger-600)'};">
                             ${rv_ret.returnPct >= 0 ? '+' : ''}${rv_ret.returnPct.toFixed(2)}%
                           </div>`
                        : '<span style="color:var(--color-gray-400);font-size:var(--font-size-xs);">—</span>'
                      }
                    </td>
                    <td>
                      ${q?.change != null
                        ? `<span style="font-size:var(--font-size-xs);font-weight:600;color:${dayUp ? 'var(--color-success-600)' : 'var(--color-danger-600)'};">
                             ${dayUp ? '▲' : '▼'} ${Math.abs(q.change).toFixed(2)}%
                           </span>`
                        : '—'
                      }
                    </td>
                    <td style="display:flex;gap:var(--space-1);">
                      ${nv > 0 ? `<button class="btn-redeem redeem-rv"
                        data-id="${inv.id}" data-name="${escapeHtml(inv.name)}"
                        data-net="${nv}" data-invested="${nv}" data-current="${currentVal}"
                        title="Vender">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v10"/><path d="m16 6-4 4-4-4"/><rect x="2" y="14" width="20" height="8" rx="2"/></svg>
                        Vender
                      </button>` : ''}
                      <button class="btn-icon edit-rv" data-id="${inv.id}" data-name="${escapeHtml(inv.name)}" title="Editar nome">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
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

function bindRVFilterEvents(rv, redemptions = [], quotes = {}) {
  const searchEl = document.getElementById('rv-search');
  const sortEl   = document.getElementById('rv-sort');
  if (!searchEl || !sortEl) return;
  const rerender = () => {
    const c = document.getElementById('inv-content');
    if (!c) return;
    c.innerHTML = renderRendaVariavelTab(rv, redemptions, quotes);
    buildRVChart(rv);
    bindRVDeleteEvents();
    bindRVFilterEvents(rv, redemptions, quotes);
    bindRedeemEvents('redeem-rv', 'rv', redemptions);
  };
  searchEl.addEventListener('input', (e) => { _rvSearch = e.target.value; rerender(); });
  sortEl.addEventListener('change',  (e) => { _rvSort   = e.target.value; rerender(); });
  bindRedeemEvents('redeem-rv', 'rv', redemptions);

  document.getElementById('btn-refresh-quotes')?.addEventListener('click', async () => {
    localStorage.removeItem('fp_quotes_cache');
    _quotes = null;
    renderTabContent('rv');
  });
}

// ── Tab: Fundos ──────────────────────────────────────────────────────────────

function renderFundosTab(funds, quotas) {
  // quotas = { [cnpj]: { quota, date, updatedAt } } — cotas manuais
  let totalInvestido = 0, totalAtual = 0;
  funds.forEach(f => {
    const invested = (parseFloat(f.quotas) || 0) * (parseFloat(f.avgQuotaPrice) || 0);
    const q = quotas[normalizeCNPJ(f.cnpj)];
    const current = q?.quota ? (parseFloat(f.quotas) || 0) * q.quota : invested;
    totalInvestido += invested;
    totalAtual     += current;
  });
  const totalRetorno    = totalAtual - totalInvestido;
  const totalRetornoPct = totalInvestido > 0 ? (totalRetorno / totalInvestido) * 100 : 0;

  // Última atualização das cotas manuais
  const allDates = Object.values(quotas).filter(q => q?.date).map(q => q.date);
  const lastDate = allDates.length ? allDates.sort().at(-1) : null;
  const lastDateStr = lastDate
    ? new Date(lastDate + 'T12:00:00').toLocaleDateString('pt-BR')
    : null;

  return `
    <div class="animate-fade-in-up">

      <!-- Barra de status -->
      <div class="inv-rates-bar">
        <span class="inv-rates-title">🏦 Cotas dos Fundos</span>
        <span class="inv-rates-badge ${lastDate ? 'ok' : 'stale'}">
          ${lastDate ? `✓ Atualizado em ${lastDateStr}` : '⚠ Nenhuma cota registrada'}
        </span>
        <span style="margin-left:auto;font-size:var(--font-size-xs);color:var(--color-gray-400);">
          Clique em ✏️ para atualizar a cota de cada fundo
        </span>
      </div>

      <!-- Cards -->
      <div class="dashboard-stats" style="margin-bottom:var(--space-5);">
        <div class="stat-card">
          <div class="stat-icon" style="background:rgba(59,130,246,.1);color:#3B82F6;">💰</div>
          <div class="stat-content">
            <div class="stat-label">Total Investido</div>
            <div class="stat-value">${formatCurrency(totalInvestido)}</div>
          </div>
        </div>
        <div class="stat-card stagger-1">
          <div class="stat-icon" style="background:rgba(34,197,94,.1);color:#22C55E;">📈</div>
          <div class="stat-content">
            <div class="stat-label">Valor Atual</div>
            <div class="stat-value">${formatCurrency(totalAtual)}</div>
          </div>
        </div>
        <div class="stat-card stagger-2">
          <div class="stat-icon" style="background:rgba(16,185,129,.1);color:#10B981;">🎯</div>
          <div class="stat-content">
            <div class="stat-label">Rendimento</div>
            <div class="stat-value" style="color:${totalRetorno >= 0 ? 'var(--color-success-600)' : 'var(--color-danger-600)'};">
              ${totalRetorno >= 0 ? '+' : ''}${formatCurrency(totalRetorno)}
            </div>
            <div class="inv-pct-label" style="color:${totalRetornoPct >= 0 ? 'var(--color-success-600)' : 'var(--color-danger-600)'};">
              ${totalRetornoPct >= 0 ? '+' : ''}${totalRetornoPct.toFixed(2)}%
            </div>
          </div>
        </div>
        <div class="stat-card stagger-3">
          <div class="stat-icon" style="background:rgba(168,85,247,.1);color:#A855F7;">🏦</div>
          <div class="stat-content">
            <div class="stat-label">Fundos</div>
            <div class="stat-value">${funds.length}</div>
          </div>
        </div>
      </div>

      <!-- Distribuição por Tipo -->
      ${funds.length > 0 ? (() => {
        const TIPOS = [
          { key: 'Renda Fixa',   label: 'Renda Fixa',    color: '#3B82F6', match: c => /renda.?fixa/i.test(c) },
          { key: 'Multimercado', label: 'Multimercado',  color: '#8B5CF6', match: c => /multimercado/i.test(c) },
          { key: 'Ações',        label: 'Renda Variável',color: '#EF4444', match: c => /a[çc][oõ]es/i.test(c) },
          { key: 'Alternativo',  label: 'Alternativo',   color: '#F97316', match: c => /cripto|fidc|alternativo/i.test(c) },
        ];

        // Agrupa por valor atual
        const buckets = {};
        TIPOS.forEach(t => { buckets[t.key] = 0; });
        buckets['Outros'] = 0;

        funds.forEach(f => {
          const q       = quotas[normalizeCNPJ(f.cnpj)];
          const qtd     = parseFloat(f.quotas) || 0;
          const avg     = parseFloat(f.avgQuotaPrice) || 0;
          const val     = q?.quota ? qtd * q.quota : qtd * avg;
          const classe  = f.classe || '';
          const tipo    = TIPOS.find(t => t.match(classe));
          if (tipo) buckets[tipo.key] += val;
          else      buckets['Outros']  += val;
        });

        const total = Object.values(buckets).reduce((s, v) => s + v, 0);
        const rows  = [...TIPOS, { key: 'Outros', label: 'Outros', color: '#64748B' }]
          .filter(t => buckets[t.key] > 0)
          .map(t => {
            const val = buckets[t.key];
            const pct = total > 0 ? (val / total) * 100 : 0;
            return `
              <div style="margin-bottom:var(--space-3);">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                  <span style="display:flex;align-items:center;gap:6px;font-size:var(--font-size-sm);">
                    <span style="width:10px;height:10px;border-radius:50%;background:${t.color};display:inline-block;"></span>
                    ${t.label}
                  </span>
                  <span style="display:flex;gap:var(--space-3);font-size:var(--font-size-xs);color:var(--color-gray-500);">
                    <span>${formatCurrency(val)}</span>
                    <span class="rf-legend-pct" style="background:${t.color}22;color:${t.color};">${pct.toFixed(1)}%</span>
                  </span>
                </div>
                <div style="height:6px;background:var(--color-gray-100);border-radius:999px;overflow:hidden;">
                  <div style="height:100%;width:${pct.toFixed(1)}%;background:${t.color};border-radius:999px;transition:width .4s;"></div>
                </div>
              </div>`;
          }).join('');

        return `
          <div class="card animate-fade-in-up" style="margin-bottom:var(--space-5);">
            <div class="card-header"><h3>Distribuição por Tipo</h3></div>
            <div style="padding:var(--space-4) var(--space-5);">
              ${rows || '<div style="color:var(--color-gray-400);font-size:var(--font-size-sm);">Sem dados suficientes.</div>'}
            </div>
          </div>`;
      })() : ''}

      <!-- Tabela -->
      <div class="card">
        <div class="card-header"><h3>Posição em Fundos</h3></div>
        ${funds.length > 0 ? `
        <div class="inv-table-wrapper">
          <table class="inv-table">
            <thead>
              <tr>
                <th>Fundo</th>
                <th>Cotas</th>
                <th>Cota Média</th>
                <th>Cota Atual</th>
                <th>Valor Atual</th>
                <th>Rendimento</th>
                <th>Atualizar Cota</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${funds.map(f => {
                const cnpj      = normalizeCNPJ(f.cnpj);
                const q         = quotas[cnpj];
                const qtd       = parseFloat(f.quotas) || 0;
                const avgPrice  = parseFloat(f.avgQuotaPrice) || 0;
                const invested  = qtd * avgPrice;
                const currQuota = q?.quota || null;
                const current   = currQuota ? qtd * currQuota : invested;
                const retBRL    = current - invested;
                const retPct    = invested > 0 ? (retBRL / invested) * 100 : 0;
                const cls       = classifyFund(f.classe);
                const dateStr   = q?.date
                  ? new Date(q.date + 'T12:00:00').toLocaleDateString('pt-BR')
                  : '—';

                return `
                  <tr>
                    <td>
                      <div style="font-weight:var(--font-weight-medium);">${escapeHtml(f.name || cnpj)}</div>
                      <div style="display:flex;gap:4px;align-items:center;margin-top:2px;flex-wrap:wrap;">
                        <span class="inv-badge" style="background:${cls.color}22;color:${cls.color};">${cls.label}</span>
                        <span style="font-size:10px;color:var(--color-gray-400);">${cnpj}</span>
                      </div>
                      ${f.manager ? `<div style="font-size:10px;color:var(--color-gray-400);margin-top:1px;">${escapeHtml(f.manager)}</div>` : ''}
                    </td>
                    <td>${qtd.toLocaleString('pt-BR', { maximumFractionDigits: 6 })}</td>
                    <td style="color:var(--color-gray-600);">${formatCurrency(avgPrice)}</td>
                    <td>
                      ${currQuota
                        ? `<div><strong>${formatCurrency(currQuota)}</strong></div>
                           <div style="font-size:9px;color:var(--color-gray-400);">${dateStr}</div>`
                        : `<span style="color:var(--color-warning-600);font-size:var(--font-size-xs);">— insira abaixo</span>`}
                    </td>
                    <td><strong>${formatCurrency(current)}</strong></td>
                    <td>
                      ${currQuota
                        ? `<span style="color:${retBRL >= 0 ? 'var(--color-success-600)' : 'var(--color-danger-600)'};font-weight:var(--font-weight-semibold);">
                             ${retBRL >= 0 ? '+' : ''}${formatCurrency(retBRL)}
                           </span>
                           <div style="font-size:var(--font-size-xs);color:${retPct >= 0 ? 'var(--color-success-600)' : 'var(--color-danger-600)'};">
                             ${retPct >= 0 ? '+' : ''}${retPct.toFixed(2)}%
                           </div>`
                        : '—'}
                    </td>
                    <td>
                      <div style="display:flex;align-items:center;gap:4px;">
                        <input type="number" class="form-control fund-quota-input" data-cnpj="${cnpj}"
                          placeholder="Cota atual" step="0.000001" min="0"
                          value="${currQuota || ''}"
                          style="width:100px;padding:4px 6px;font-size:var(--font-size-xs);">
                        <button class="btn btn-secondary btn-save-quota" data-cnpj="${cnpj}"
                          style="padding:4px 8px;font-size:var(--font-size-xs);white-space:nowrap;">✓</button>
                      </div>
                    </td>
                    <td>
                      <div style="display:flex;gap:4px;align-items:center;">
                        <button class="btn btn-primary btn-resgate-fund"
                          data-id="${f.id}"
                          data-invested="${invested}"
                          data-current="${current}"
                          data-quotas="${qtd}"
                          style="padding:3px 8px;font-size:var(--font-size-xs);white-space:nowrap;">
                          Resgatar
                        </button>
                        <button class="btn-icon edit-fund" data-id="${f.id}" data-name="${escapeHtml(f.name || cnpj)}" title="Editar nome">
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button class="btn-icon btn-danger delete-fund" data-id="${f.id}" title="Excluir">
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>` : `
        <div style="padding:var(--space-12);text-align:center;color:var(--color-gray-400);">
          <div style="font-size:2rem;margin-bottom:var(--space-3);">🏦</div>
          <div>Nenhum fundo cadastrado.</div>
          <div style="font-size:var(--font-size-xs);margin-top:var(--space-2);">Clique em <strong>Adicionar</strong> no menu para cadastrar.</div>
        </div>`}
      </div>
    </div>`;
}

function bindFundEvents() {
  document.querySelectorAll('.btn-save-quota').forEach(btn => {
    btn.addEventListener('click', () => {
      const cnpj  = btn.dataset.cnpj;
      const input = document.querySelector(`.fund-quota-input[data-cnpj="${cnpj}"]`);
      const val   = parseFloat(input?.value);
      if (!val || val <= 0) { showToast('Digite um valor de cota válido.', 'error'); return; }
      saveManualQuota(cnpj, val, new Date().toISOString().split('T')[0]);
      showToast('Cota atualizada!', 'success');
      renderTabContent('fundos');
    });
  });

  document.querySelectorAll('.fund-quota-input').forEach(input => {
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        input.closest('tr')?.querySelector('.btn-save-quota')?.click();
      }
    });
  });

  document.querySelectorAll('.edit-fund').forEach(btn => {
    btn.addEventListener('click', () =>
      openEditNameModal(btn.dataset.id, btn.dataset.name, updateInvestmentFund, 'fundos')
    );
  });

  document.querySelectorAll('.btn-resgate-fund').forEach(btn => {
    btn.addEventListener('click', () => {
      const fund = getInvestmentsFunds().find(f => f.id === btn.dataset.id);
      if (!fund) return;
      openFundRedemptionModal(
        fund,
        parseFloat(btn.dataset.invested),
        parseFloat(btn.dataset.current),
        parseFloat(btn.dataset.quotas)
      );
    });
  });

  document.querySelectorAll('.delete-fund').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!confirm('Excluir este fundo?')) return;
      deleteInvestmentFund(btn.dataset.id);
      renderTabContent('fundos');
    });
  });
}

// ── Tab: Dividendos ─────────────────────────────────────────────────────────

// ── Wrapper Carteira com sub-abas ────────────────────────────────────────────

function renderCarteiraWithSubTabs(rf, rv, funds, redemptions, rates, amortConfirms, activeSubTab) {
  const subTabBar = `
    <div class="rv-subtab-bar">
      <button class="rv-subtab ${activeSubTab === 'visaogeral' ? 'active' : ''}" data-carteira-subtab="visaogeral">
        📊 Visão Geral
      </button>
      <button class="rv-subtab ${activeSubTab === 'historico' ? 'active' : ''}" data-carteira-subtab="historico">
        🕐 Histórico de Resgates
      </button>
    </div>`;
  const content = activeSubTab === 'historico'
    ? renderHistoricoTab(rf, rv, funds, redemptions)
    : renderCarteiraTab(rf, rv, redemptions, rates, amortConfirms);
  return subTabBar + content;
}

function bindCarteiraSubTabEvents() {
  document.querySelectorAll('[data-carteira-subtab]').forEach(btn => {
    btn.addEventListener('click', () => {
      sessionStorage.setItem('carteiraSubTab', btn.dataset.carteiraSubtab);
      renderTabContent('carteira');
    });
  });
}

// ── Histórico de Resgates ─────────────────────────────────────────────────────

function renderHistoricoTab(rf, rv, funds, redemptions) {
  const today    = new Date(); today.setHours(0, 0, 0, 0);
  const thisYear = today.getFullYear();

  // Mapa de nomes: ativos ainda existentes
  const nameMap = {};
  [...rf, ...rv, ...funds].forEach(i => { nameMap[i.id] = i.name || i.ticker || i.cnpj; });

  // Fallback para resgates antigos (sem investmentName): recupera da descrição da transação
  // Formato salvo: "Resgate total — NomeDoAtivo" ou "Resgate — NomeDoAtivo"
  const txNameMap = {};
  getTransactions()
    .filter(t => t.fromInvestment && t.description)
    .forEach(t => {
      const m = t.description.match(/—\s+(.+)$/);
      if (m) {
        // Indexa por data+valor para cruzar com o resgate
        const key = `${t.date}_${Math.round((t.amount || 0) * 100)}`;
        txNameMap[key] = m[1].trim();
      }
    });

  const TYPE_LABEL = { rf: 'Renda Fixa', rv: 'Renda Variável', fundo: 'Fundo' };
  const TYPE_COLOR = { rf: '#3B82F6', rv: '#EF4444', fundo: '#8B5CF6' };

  const sorted = [...redemptions].sort((a, b) => new Date(b.date) - new Date(a.date));

  const totalBruto  = sorted.reduce((s, r) => s + (r.amount    || 0), 0);
  const totalIR     = sorted.reduce((s, r) => s + (r.irAmount  || 0), 0);
  const totalLiq    = sorted.reduce((s, r) => s + (r.netAmount ?? (r.amount - (r.irAmount || 0))), 0);
  const totalAnoLiq = sorted
    .filter(r => r.date?.startsWith(String(thisYear)))
    .reduce((s, r) => s + (r.netAmount ?? (r.amount - (r.irAmount || 0))), 0);

  if (redemptions.length === 0) return `
    <div class="animate-fade-in-up">
      <div class="card" style="padding:var(--space-8);text-align:center;color:var(--color-gray-400);">
        <div style="font-size:2rem;margin-bottom:var(--space-3);">🕐</div>
        <div>Nenhum resgate registrado ainda.</div>
        <div style="font-size:var(--font-size-xs);margin-top:var(--space-2);">Os resgates de RF, Ações e Fundos aparecerão aqui.</div>
      </div>
    </div>`;

  return `
    <div class="animate-fade-in-up">

      <!-- Cards -->
      <div class="dashboard-stats" style="margin-bottom:var(--space-5);">
        <div class="stat-card">
          <div class="stat-icon" style="background:rgba(59,130,246,.1);color:#3B82F6;">💰</div>
          <div class="stat-content">
            <div class="stat-label">Total Bruto Resgatado</div>
            <div class="stat-value">${formatCurrency(totalBruto)}</div>
          </div>
        </div>
        <div class="stat-card stagger-1">
          <div class="stat-icon" style="background:rgba(239,68,68,.1);color:#EF4444;">🏛️</div>
          <div class="stat-content">
            <div class="stat-label">Total IR Pago</div>
            <div class="stat-value" style="color:var(--color-danger-600);">${formatCurrency(totalIR)}</div>
          </div>
        </div>
        <div class="stat-card stagger-2">
          <div class="stat-icon" style="background:rgba(34,197,94,.1);color:#22C55E;">✅</div>
          <div class="stat-content">
            <div class="stat-label">Total Líquido Recebido</div>
            <div class="stat-value" style="color:var(--color-success-600);">${formatCurrency(totalLiq)}</div>
          </div>
        </div>
        <div class="stat-card stagger-3">
          <div class="stat-icon" style="background:rgba(245,158,11,.1);color:#F59E0B;">📅</div>
          <div class="stat-content">
            <div class="stat-label">Líquido em ${thisYear}</div>
            <div class="stat-value">${formatCurrency(totalAnoLiq)}</div>
          </div>
        </div>
      </div>

      <!-- Tabela -->
      <div class="card">
        <div class="card-header">
          <h3>🕐 Todos os Resgates</h3>
          <span style="font-size:var(--font-size-xs);color:var(--color-gray-400);">${sorted.length} registro${sorted.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="inv-table-wrapper">
          <table class="inv-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Ativo</th>
                <th>Classe</th>
                <th>Tipo</th>
                <th class="text-right">Bruto</th>
                <th class="text-right">IR</th>
                <th class="text-right">Líquido</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${sorted.map(r => {
                const ir      = r.irAmount  ?? 0;
                const net     = r.netAmount ?? (r.amount - ir);
                const txKey   = `${r.date}_${Math.round((net) * 100)}`;
                const name    = r.investmentName
                  || nameMap[r.investmentId]
                  || txNameMap[txKey]
                  || 'Ativo encerrado';
                const typeStr = TYPE_LABEL[r.investmentType] || r.investmentType || '—';
                const color   = TYPE_COLOR[r.investmentType] || '#64748B';
                const dateStr = r.date
                  ? new Date(r.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
                  : '—';
                const redeemLabel = r.redeemType === 'total' ? 'Total' : r.redeemType === 'parcial' ? 'Parcial' : '—';

                return `
                  <tr>
                    <td style="white-space:nowrap;color:var(--color-gray-600);">${dateStr}</td>
                    <td><strong>${escapeHtml(name)}</strong></td>
                    <td>
                      <span class="inv-badge" style="background:${color}22;color:${color};">${typeStr}</span>
                    </td>
                    <td style="color:var(--color-gray-500);font-size:var(--font-size-xs);">${redeemLabel}</td>
                    <td class="text-right">${formatCurrency(r.amount)}</td>
                    <td class="text-right" style="color:${ir > 0 ? 'var(--color-danger-600)' : 'var(--color-gray-400)'};">
                      ${ir > 0 ? `− ${formatCurrency(ir)}` : '—'}
                    </td>
                    <td class="text-right"><strong style="color:var(--color-success-600);">${formatCurrency(net)}</strong></td>
                    <td>
                      <button class="btn-icon btn-danger delete-redemption" data-id="${r.id}" title="Excluir">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                      </button>
                    </td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>

    </div>`;
}

function bindHistoricoEvents() {
  document.querySelectorAll('.delete-redemption').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!confirm('Excluir este registro de resgate?')) return;
      deleteRedemption(btn.dataset.id);
      showToast('Registro excluído.', 'success');
      renderTabContent('carteira');
    });
  });
}

// ── Wrapper RF com sub-abas ───────────────────────────────────────────────────

function renderRFWithSubTabs(rf, redemptions, rates, amortConfirms, activeSubTab) {
  const subTabBar = `
    <div class="rv-subtab-bar">
      <button class="rv-subtab ${activeSubTab === 'posicao' ? 'active' : ''}" data-rf-subtab="posicao">
        📊 Posição
      </button>
      <button class="rv-subtab ${activeSubTab === 'amortizacoes' ? 'active' : ''}" data-rf-subtab="amortizacoes">
        📅 Amortizações
      </button>
    </div>`;
  const content = activeSubTab === 'amortizacoes'
    ? renderAmortizacoesTab(rf, amortConfirms)
    : renderRendaFixaTab(rf, redemptions, rates, amortConfirms);
  return subTabBar + content;
}

function bindRFSubTabEvents() {
  document.querySelectorAll('[data-rf-subtab]').forEach(btn => {
    btn.addEventListener('click', () => {
      sessionStorage.setItem('rfSubTab', btn.dataset.rfSubtab);
      renderTabContent('rf');
    });
  });
}

// ── Aba de Amortizações ───────────────────────────────────────────────────────

function renderAmortizacoesTab(rf, amortConfirms) {
  const today    = new Date(); today.setHours(0, 0, 0, 0);
  const thisYear = today.getFullYear();

  const allEvents = [];
  rf.filter(inv => inv.amortization?.firstDate).forEach(inv => {
    getAmortizationSchedule(inv).forEach(p => {
      const confirmed = amortConfirms.find(c => c.investmentId === inv.id && c.amortIndex === p.index);
      const pDate     = new Date(p.date + 'T12:00:00');
      allEvents.push({ inv, p, confirmed, pDate, isThisMonth: p.isThisMonth });
    });
  });

  allEvents.sort((a, b) => a.pDate - b.pDate);

  const upcoming = allEvents.filter(e => e.pDate >= today);
  const past     = [...allEvents.filter(e => e.pDate < today)].reverse();

  const totalRecebidoAno = past
    .filter(e => e.confirmed && e.pDate.getFullYear() === thisYear)
    .reduce((s, e) => s + (e.confirmed.actualAmount ?? e.p.amount), 0);

  const totalProjetadoAno = allEvents
    .filter(e => e.pDate.getFullYear() === thisYear)
    .reduce((s, e) => s + e.p.amount, 0);

  const totalFuturo = upcoming.reduce((s, e) => s + e.p.amount, 0);
  const nextEvent   = upcoming[0];
  const noTitles    = rf.filter(i => i.amortization).length === 0;

  function rowHtml(e) {
    const dateStr    = e.pDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
    const isPast     = e.pDate < today;
    const canConfirm = (isPast || e.isThisMonth) && !e.confirmed;

    return `
      <tr class="${e.confirmed ? 'div-row-confirmed' : ''} ${!isPast && !e.isThisMonth ? 'div-row-future' : ''}">
        <td>
          <strong>${escapeHtml(e.inv.name)}</strong>
          ${e.isThisMonth ? '<span class="inv-amort-badge" style="margin-left:6px;">Este mês</span>' : ''}
        </td>
        <td style="white-space:nowrap;color:var(--color-gray-600);">${dateStr}</td>
        <td style="color:var(--color-gray-500);">Parcela ${e.p.index + 1}</td>
        <td><strong style="color:var(--color-success-600);">${formatCurrency(e.p.amount)}</strong></td>
        <td>
          ${e.confirmed
            ? `<span class="div-badge-confirmed">✓ Recebido</span>
               <button class="btn-link amort-unconfirm" data-id="${e.confirmed.id}"
                 style="font-size:11px;color:var(--color-gray-400);display:block;margin-top:2px;">desfazer</button>`
            : canConfirm
              ? `<button class="btn-amort-confirm"
                   data-inv-id="${e.inv.id}"
                   data-inv-name="${escapeHtml(e.inv.name)}"
                   data-index="${e.p.index}"
                   data-amount="${e.p.amount}"
                   data-date="${e.p.date}">
                   ✓ Confirmar
                 </button>`
              : `<span style="color:var(--color-gray-400);font-size:var(--font-size-xs);">⏳ Aguardando</span>`
          }
        </td>
      </tr>`;
  }

  if (noTitles) return `
    <div class="animate-fade-in-up">
      <div class="card" style="padding:var(--space-8);text-align:center;color:var(--color-gray-400);">
        <div style="font-size:2rem;margin-bottom:var(--space-3);">📅</div>
        <div>Nenhum título com amortização cadastrado.</div>
        <div style="font-size:var(--font-size-xs);margin-top:var(--space-2);">
          Cadastre um título de Renda Fixa e ative a opção de amortização.
        </div>
      </div>
    </div>`;

  return `
    <div class="animate-fade-in-up">

      <!-- Cards de resumo -->
      <div class="dashboard-stats" style="margin-bottom:var(--space-5);">
        <div class="stat-card">
          <div class="stat-icon" style="background:rgba(34,197,94,.1);color:#22C55E;">✅</div>
          <div class="stat-content">
            <div class="stat-label">Recebido em ${thisYear}</div>
            <div class="stat-value" style="color:var(--color-success-600);">${formatCurrency(totalRecebidoAno)}</div>
          </div>
        </div>
        <div class="stat-card stagger-1">
          <div class="stat-icon" style="background:rgba(59,130,246,.1);color:#3B82F6;">📅</div>
          <div class="stat-content">
            <div class="stat-label">Previsto em ${thisYear}</div>
            <div class="stat-value">${formatCurrency(totalProjetadoAno)}</div>
          </div>
        </div>
        <div class="stat-card stagger-2">
          <div class="stat-icon" style="background:rgba(99,102,241,.1);color:#6366F1;">🔮</div>
          <div class="stat-content">
            <div class="stat-label">A receber (futuro)</div>
            <div class="stat-value">${formatCurrency(totalFuturo)}</div>
          </div>
        </div>
        <div class="stat-card stagger-3">
          <div class="stat-icon" style="background:rgba(245,158,11,.1);color:#F59E0B;">⏭️</div>
          <div class="stat-content">
            <div class="stat-label">Próxima parcela</div>
            <div class="stat-value" style="font-size:var(--font-size-lg);">
              ${nextEvent ? nextEvent.pDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : '—'}
            </div>
            ${nextEvent ? `<div style="font-size:var(--font-size-xs);color:var(--color-success-600);margin-top:2px;">${formatCurrency(nextEvent.p.amount)}</div>` : ''}
          </div>
        </div>
      </div>

      <!-- Próximas -->
      ${upcoming.length > 0 ? `
      <div class="card" style="margin-bottom:var(--space-4);">
        <div class="card-header">
          <h3>📅 Próximas parcelas</h3>
          <span style="font-size:var(--font-size-xs);color:var(--color-gray-400);">${upcoming.length} parcela${upcoming.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="inv-table-wrapper">
          <table class="inv-table">
            <thead><tr><th>Título</th><th>Data</th><th>Parcela</th><th>Valor</th><th></th></tr></thead>
            <tbody>${upcoming.map(rowHtml).join('')}</tbody>
          </table>
        </div>
      </div>` : ''}

      <!-- Histórico -->
      ${past.length > 0 ? `
      <div class="card">
        <div class="card-header">
          <h3>🕐 Histórico</h3>
          <span style="font-size:var(--font-size-xs);color:var(--color-gray-400);">${past.length} parcela${past.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="inv-table-wrapper">
          <table class="inv-table">
            <thead><tr><th>Título</th><th>Data</th><th>Parcela</th><th>Valor</th><th></th></tr></thead>
            <tbody>${past.map(rowHtml).join('')}</tbody>
          </table>
        </div>
      </div>` : ''}

    </div>`;
}

function renderDividendosTab(rv, dividends, divConfirms) {
  // Monta lista de todos os dividendos com info do investimento
  const today    = new Date(); today.setHours(0,0,0,0);
  const thisYear = today.getFullYear();

  const rows = [];
  rv.forEach(inv => {
    const ticker = inv.ticker?.toUpperCase();
    if (!ticker) return;
    const qty  = parseFloat(inv.quantity) || 0;
    const divs = dividends[ticker] || [];

    // Ordena por data desc para pegar os mais recentes
    const sorted = [...divs].sort((a, b) => {
      const da = a.paymentDate ? new Date(a.paymentDate + 'T12:00:00') : new Date(0);
      const db = b.paymentDate ? new Date(b.paymentDate + 'T12:00:00') : new Date(0);
      return db - da;
    });

    // Próximo pagamento (data futura mais próxima)
    const nextDiv  = sorted.find(d => d.paymentDate && new Date(d.paymentDate + 'T12:00:00') >= today);
    // 2 pagamentos anteriores (data passada)
    const pastDivs = sorted.filter(d => !d.paymentDate || new Date(d.paymentDate + 'T12:00:00') < today).slice(0, 2);

    const selected = [];
    if (nextDiv) selected.push(nextDiv);
    selected.push(...pastDivs);

    selected.forEach((d, idx) => {
      const payDate = d.paymentDate ? new Date(d.paymentDate + 'T12:00:00') : null;
      const total   = qty * (d.rate || 0);
      const key     = `${ticker}_${d.paymentDate}`;
      const confirmed = divConfirms.find(c => c.key === key);
      rows.push({ inv, ticker, qty, d, payDate, total, key, confirmed });
    });
  });

  // Ordena: futuros primeiro, depois mais recentes
  rows.sort((a, b) => {
    if (!a.payDate && !b.payDate) return 0;
    if (!a.payDate) return 1;
    if (!b.payDate) return -1;
    return b.payDate - a.payDate;
  });

  // Separa futuros / anteriores
  const upcoming = rows.filter(r => r.payDate && r.payDate >= today);
  const past     = rows.filter(r => !r.payDate || r.payDate < today);

  // Totais do ano
  const totalAnoRecebido = past
    .filter(r => r.payDate?.getFullYear() === thisYear && r.confirmed)
    .reduce((s, r) => s + r.total, 0);
  const totalAnoPrevisto = rows
    .filter(r => r.payDate?.getFullYear() === thisYear)
    .reduce((s, r) => s + r.total, 0);

  const noData = rv.length === 0;
  const noDivs = rows.length === 0 && !noData;

  function rowHtml(r) {
    const dateStr = r.payDate
      ? r.payDate.toLocaleDateString('pt-BR', { day:'2-digit', month:'short', year:'numeric' })
      : '—';
    const isConfirmed = !!r.confirmed;
    const isFuture    = r.payDate && r.payDate >= today;
    return `
      <tr class="${isConfirmed ? 'div-row-confirmed' : ''} ${isFuture ? 'div-row-future' : ''}">
        <td>
          <strong class="inv-ticker">${r.ticker}</strong>
          <div style="font-size:var(--font-size-xs);color:var(--color-gray-400);">${escapeHtml(r.inv.name)}</div>
        </td>
        <td><span class="inv-badge inv-badge-type">${escapeHtml(r.d.type)}</span></td>
        <td style="font-weight:var(--font-weight-medium);">${dateStr}</td>
        <td>${r.d.relatedTo || '—'}</td>
        <td style="color:var(--color-gray-600);">${r.qty} × ${formatCurrency(r.d.rate)}</td>
        <td><strong style="color:var(--color-success-600);">${formatCurrency(r.total)}</strong></td>
        <td>
          ${isConfirmed
            ? `<span class="div-badge-confirmed">✓ Recebido</span>
               <button class="btn-link div-unconfirm" data-id="${r.confirmed.id}" style="font-size:11px;color:var(--color-gray-400);display:block;margin-top:2px;">desfazer</button>`
            : `<button class="btn-amort-confirm div-confirm"
                 data-key="${r.key}"
                 data-ticker="${r.ticker}"
                 data-name="${escapeHtml(r.inv.name)}"
                 data-total="${r.total.toFixed(2)}"
                 data-date="${r.d.paymentDate || ''}"
                 data-type="${escapeHtml(r.d.type)}"
                 ${isFuture ? 'style="opacity:.6;"' : ''}>
                 ${isFuture ? '⏳ Aguardando' : '✓ Confirmar'}
               </button>`
          }
        </td>
      </tr>`;
  }

  return `
    <div class="animate-fade-in-up">
      <div style="display:flex;justify-content:flex-end;margin-bottom:var(--space-3);">
        <button id="btn-refresh-dividends" style="background:none;border:1px solid var(--color-gray-200);border-radius:var(--radius-md);padding:4px 12px;font-size:var(--font-size-xs);color:var(--color-gray-500);cursor:pointer;display:flex;align-items:center;gap:4px;">
          🔄 Atualizar dividendos
        </button>
      </div>
      <!-- Cards resumo do ano -->
      <div class="dashboard-stats" style="margin-bottom:var(--space-5);">
        <div class="stat-card">
          <div class="stat-icon" style="background:rgba(34,197,94,.1);color:#22C55E;">💵</div>
          <div class="stat-content">
            <div class="stat-label">Recebido em ${thisYear}</div>
            <div class="stat-value">${formatCurrency(totalAnoRecebido)}</div>
          </div>
        </div>
        <div class="stat-card stagger-1">
          <div class="stat-icon" style="background:rgba(59,130,246,.1);color:#3B82F6;">📅</div>
          <div class="stat-content">
            <div class="stat-label">Previsto em ${thisYear}</div>
            <div class="stat-value">${formatCurrency(totalAnoPrevisto)}</div>
          </div>
        </div>
        <div class="stat-card stagger-2">
          <div class="stat-icon" style="background:rgba(245,158,11,.1);color:#F59E0B;">⏳</div>
          <div class="stat-content">
            <div class="stat-label">Próximos pagamentos</div>
            <div class="stat-value">${upcoming.length}</div>
          </div>
        </div>
        <div class="stat-card stagger-3">
          <div class="stat-icon" style="background:rgba(168,85,247,.1);color:#A855F7;">🏦</div>
          <div class="stat-content">
            <div class="stat-label">Ativos com dividendos</div>
            <div class="stat-value">${Object.keys(dividends).filter(t => (dividends[t]||[]).length > 0).length}</div>
          </div>
        </div>
      </div>

      ${noData ? `<div class="card" style="padding:var(--space-8);text-align:center;color:var(--color-gray-400);">Cadastre ativos de Renda Variável para ver o histórico de dividendos.</div>` : ''}

      ${noDivs ? `<div class="card" style="padding:var(--space-8);text-align:center;color:var(--color-gray-400);">
        <div style="font-size:2rem;margin-bottom:var(--space-3);">📭</div>
        <div>Nenhum dividendo encontrado para seus ativos. A BRAPI pode não ter dados para todos os tickers.</div>
      </div>` : ''}

      ${upcoming.length > 0 ? `
      <div class="card" style="margin-bottom:var(--space-5);">
        <div class="card-header">
          <h3>📅 Próximos Pagamentos</h3>
        </div>
        <div class="inv-table-wrapper">
          <table class="inv-table">
            <thead><tr>
              <th>Ativo</th><th>Tipo</th><th>Pagamento</th><th>Ref.</th><th>Qtde × Valor</th><th>Total</th><th></th>
            </tr></thead>
            <tbody>${upcoming.map(r => rowHtml(r)).join('')}</tbody>
          </table>
        </div>
      </div>` : ''}

      ${past.length > 0 ? `
      <div class="card">
        <div class="card-header">
          <h3>📋 Histórico de Dividendos</h3>
        </div>
        <div class="inv-table-wrapper">
          <table class="inv-table">
            <thead><tr>
              <th>Ativo</th><th>Tipo</th><th>Pagamento</th><th>Ref.</th><th>Qtde × Valor</th><th>Total</th><th></th>
            </tr></thead>
            <tbody>${past.map(r => rowHtml(r)).join('')}</tbody>
          </table>
        </div>
      </div>` : ''}
    </div>
  `;
}

function bindDividendEvents() {
  // Botão atualizar
  document.getElementById('btn-refresh-dividends')?.addEventListener('click', () => {
    localStorage.removeItem('fp_dividends_cache');
    _dividends = null;
    renderTabContent('dividendos');
  });

  // Confirmar recebimento
  document.querySelectorAll('.div-confirm').forEach(btn => {
    btn.addEventListener('click', () => {
      const { key, ticker, name, total, date, type } = btn.dataset;
      const amount = parseFloat(total) || 0;

      const bodyHtml = `
        <div style="display:flex;flex-direction:column;gap:var(--space-4);">
          <div style="background:var(--color-gray-50);border-radius:var(--radius-md);padding:var(--space-3);">
            <div style="font-size:var(--font-size-sm);color:var(--color-gray-500);">Ativo</div>
            <div style="font-weight:var(--font-weight-semibold);">${ticker} — ${escapeHtml(name)}</div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);">
            <div>
              <label class="form-label">Valor recebido (R$)</label>
              <input type="number" id="div-confirm-amount" class="form-control" value="${amount.toFixed(2)}" step="0.01" min="0">
            </div>
            <div>
              <label class="form-label">Data do recebimento</label>
              <input type="date" id="div-confirm-date" class="form-control" value="${date || new Date().toISOString().split('T')[0]}">
            </div>
          </div>
          <div>
            <label class="form-label">Observação (opcional)</label>
            <input type="text" id="div-confirm-note" class="form-control" placeholder="${type}">
          </div>
        </div>
      `;

      openModal(
        `Confirmar Recebimento — ${type}`,
        bodyHtml,
        `<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
         <button class="btn btn-primary" id="div-confirm-save">Confirmar</button>`
      );

      document.getElementById('div-confirm-save')?.addEventListener('click', () => {
        const actualAmount = parseFloat(document.getElementById('div-confirm-amount')?.value) || amount;
        const actualDate   = document.getElementById('div-confirm-date')?.value || date;
        const note         = document.getElementById('div-confirm-note')?.value || type;

        confirmDividend({ key, ticker, name, amount: actualAmount, date: actualDate, type, note });

        addTransaction({
          description: `Dividendo ${type} — ${ticker}`,
          categoryId: 'cat_investimentos',
          amount: actualAmount,
          date: actualDate,
          type: 'income',
          note,
          fromInvestment: true,
        });

        closeModal();
        showToast(`${formatCurrency(actualAmount)} de dividendo confirmado e lançado em Movimentações!`, 'success');
        renderTabContent('dividendos');
      });
    });
  });

  // Desfazer confirmação
  document.querySelectorAll('.div-unconfirm').forEach(btn => {
    btn.addEventListener('click', () => {
      deleteDivConfirmation(btn.dataset.id);
      showToast('Confirmação removida.', 'success');
      renderTabContent('dividendos');
    });
  });
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
  document.querySelectorAll('.edit-rv').forEach(btn => {
    btn.addEventListener('click', () =>
      openEditNameModal(btn.dataset.id, btn.dataset.name, updateInvestmentRV, 'rv')
    );
  });

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
  const funds = getInvestmentsFunds();
  const redemptions = getRedemptions();

  // Lançamentos: entradas (RF+RV+Fundo) e saídas (resgates) unificados
  const entries = [
    ...rf.map(i => ({ id: i.id, _kind: 'rf', _dir: 'entrada', name: i.name, ticker: '', assetType: null, returnType: i.returnType, indexer: i.indexer, percentage: i.percentage, rate: i.rate, sector: i.sector, value: i.value, date: i.applicationDate, createdAt: i.createdAt, maturityDate: i.maturityDate })),
    ...rv.map(i => ({ id: i.id, _kind: 'rv', _dir: 'entrada', name: i.name, ticker: i.ticker, assetType: i.assetType, sector: i.sector, value: i.value, date: i.createdAt?.split('T')[0], createdAt: i.createdAt })),
    ...funds.map(f => {
      const val = (parseFloat(f.quotas) || 0) * (parseFloat(f.avgQuotaPrice) || 0);
      return { id: f.id, _kind: 'fundo', _dir: 'entrada', name: f.name, ticker: normalizeCNPJ(f.cnpj), assetType: null, sector: f.classe || '', value: val, date: f.applicationDate || f.createdAt?.split('T')[0], createdAt: f.createdAt };
    }),
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
                const isRF    = inv._kind === 'rf';
                const isFundo = inv._kind === 'fundo';
                const icon = isSaida ? '🔴' : isRF ? '🏦' : isFundo ? '🏛️' : '📈';
                const badge = isSaida
                  ? `<span class="inv-badge" style="background:var(--color-danger-50);color:var(--color-danger-600);">Resgate</span>`
                  : isRF
                    ? `<span class="inv-badge inv-badge-${inv.returnType}">${returnTypeLabel(inv)}</span>`
                    : isFundo
                      ? `<span class="inv-badge" style="background:#8B5CF622;color:#8B5CF6;">Fundo</span>`
                      : `<span class="inv-badge inv-badge-type">${ASSET_LABELS[inv.assetType] || inv.assetType}</span>`;
                const detail = isSaida
                  ? (inv.note || '—')
                  : isRF
                    ? `Vence ${formatDate(inv.maturityDate)}`
                    : isFundo
                      ? (inv.sector || '—')
                      : `${SECTOR_LABELS[inv.sector] || inv.sector || '—'}`;
                const deleteClass = isSaida ? 'delete-launch-redemption' : isRF ? 'delete-launch-rf' : isFundo ? 'delete-launch-fundo' : 'delete-launch-rv';
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
      <div class="form-group">
        <label class="form-label">Categoria</label>
        <select name="category" class="form-control">
          <option value="bancario">🏦 Bancário (CDB, LCI, LCA)</option>
          <option value="publico">🏛️ Título Público (Tesouro)</option>
          <option value="privado">🏢 Crédito Privado (CRI, CRA, Debênture)</option>
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
      <label class="form-label">Liquidez</label>
      <div class="inv-return-toggle">
        <button type="button" class="inv-return-btn active" data-liquidity="daily">💧 Diária</button>
        <button type="button" class="inv-return-btn" data-liquidity="maturity">🔒 No vencimento</button>
      </div>
      <input type="hidden" name="liquidity" value="daily">
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

  document.querySelectorAll('.delete-launch-fundo').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!confirm('Excluir este fundo?')) return;
      deleteInvestmentFund(btn.dataset.id);
      _quotasFundos = null;
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
      <button class="inv-toggle" data-type="fundo">🏛️ Fundo</button>
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
      const type = btn.dataset.type;
      if (type === 'rf')    { fieldsEl.innerHTML = renderRFFields();    bindReturnTypeEvents(); }
      else if (type === 'rv') { fieldsEl.innerHTML = renderRVFields(); }
      else                   { fieldsEl.innerHTML = renderFundFields(); }
    });
  });

  bindReturnTypeEvents();

  document.getElementById('modal-save')?.addEventListener('click', () => {
    const form = document.getElementById('inv-form');
    if (!form) return;
    const data = Object.fromEntries(new FormData(form));
    if (data.formType === 'rf')    handleAddRF(data);
    else if (data.formType === 'rv') handleAddRV(data);
    else                            handleAddFund(data);
  });
}

function renderFundFields() {
  return `
    <input type="hidden" name="formType" value="fundo">
    <div class="form-group">
      <label class="form-label">CNPJ do Fundo *</label>
      <input type="text" name="cnpj" class="form-control" placeholder="XX.XXX.XXX/XXXX-XX" required>
    </div>
    <div class="form-group">
      <label class="form-label">Nome do Fundo *</label>
      <input type="text" name="name" class="form-control" placeholder="Ex: Inter Conservador FIF RF CP RL" required>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Classificação</label>
        <select name="classe" class="form-control">
          <option value="">Selecione...</option>
          <option value="Renda Fixa">Renda Fixa</option>
          <option value="Multimercado">Multimercado</option>
          <option value="Ações">Ações</option>
          <option value="Alternativo">Alternativo</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Gestor <span style="color:var(--color-gray-400);font-weight:normal;">(opcional)</span></label>
        <input type="text" name="manager" class="form-control" placeholder="Ex: Inter DTVM">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Quantidade de Cotas *</label>
        <input type="number" name="quotas" class="form-control" placeholder="0.000000" step="0.000001" min="0" required>
      </div>
      <div class="form-group">
        <label class="form-label">Preço Médio por Cota (R$) *</label>
        <input type="number" name="avgQuotaPrice" class="form-control" placeholder="0.000000" step="0.000001" min="0" required>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Data de Aplicação</label>
      <input type="date" name="applicationDate" class="form-control" value="${new Date().toISOString().split('T')[0]}">
    </div>
  `;
}


async function handleAddFund(data) {
  if (!data.cnpj || !data.name || !data.quotas || !data.avgQuotaPrice) {
    showToast('Preencha CNPJ, nome e quantidade de cotas.', 'error');
    return;
  }
  addInvestmentFund({
    cnpj:            normalizeCNPJ(data.cnpj),
    name:            data.name.trim(),
    classe:          data.classe || '',
    manager:         data.manager || '',
    quotas:          parseFloat(data.quotas) || 0,
    avgQuotaPrice:   parseFloat(data.avgQuotaPrice) || 0,
    applicationDate: data.applicationDate || '',
  });
  closeModal();
  showToast('Fundo adicionado! Insira a cota atual na aba Fundos.', 'success');
  renderTabContent('fundos');
}

function bindReturnTypeEvents() {
  // Toggle liquidez
  document.querySelectorAll('[data-liquidity]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-liquidity]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const liqInput = document.querySelector('[name="liquidity"]');
      if (liqInput) liqInput.value = btn.dataset.liquidity;
    });
  });

  document.querySelectorAll('.inv-return-btn[data-return]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.inv-return-btn[data-return]').forEach(b => b.classList.remove('active'));
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
    category:  data.category  || 'bancario',
    liquidity: data.liquidity || 'maturity',
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

// ── Resgate de Fundos ────────────────────────────────────────────────────────

function openFundRedemptionModal(fund, invested, current, totalQuotas) {
  openModal(
    `Resgatar — ${escapeHtml(fund.name)}`,
    `<div class="form-group">
       <label class="form-label">Tipo de resgate</label>
       <div style="display:flex;gap:8px;">
         <label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:8px 12px;border:1px solid var(--color-gray-200);border-radius:var(--radius-md);flex:1;">
           <input type="radio" name="redeem-type" value="total" checked> Total
         </label>
         <label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:8px 12px;border:1px solid var(--color-gray-200);border-radius:var(--radius-md);flex:1;">
           <input type="radio" name="redeem-type" value="parcial"> Parcial
         </label>
       </div>
     </div>
     <div id="partial-quotas-group" style="display:none;" class="form-group">
       <label class="form-label">Cotas Resgatadas</label>
       <input type="number" id="redeem-quotas" class="form-control"
         placeholder="0.000000" step="0.000001" min="0.000001" max="${totalQuotas}">
       <small style="color:var(--color-gray-500);">
         Você tem ${totalQuotas.toLocaleString('pt-BR', { maximumFractionDigits: 6 })} cotas
       </small>
     </div>
     <div class="form-row">
       <div class="form-group">
         <label class="form-label">Valor Bruto Recebido (R$) *</label>
         <input type="number" id="redeem-gross" class="form-control" placeholder="0,00" step="0.01" min="0.01">
       </div>
       <div class="form-group">
         <label class="form-label">Data do Resgate *</label>
         <input type="date" id="redeem-date" class="form-control" value="${new Date().toISOString().split('T')[0]}">
       </div>
     </div>`,
    `<button type="button" class="btn btn-ghost" id="modal-cancel">Cancelar</button>
     <button type="button" class="btn btn-primary" id="fund-redeem-next">Próximo →</button>`
  );

  document.getElementById('modal-cancel').addEventListener('click', closeModal);

  document.querySelectorAll('input[name="redeem-type"]').forEach(r => {
    r.addEventListener('change', () => {
      document.getElementById('partial-quotas-group').style.display =
        r.value === 'parcial' && r.checked ? '' : 'none';
    });
  });

  document.getElementById('fund-redeem-next').addEventListener('click', () => {
    const type  = document.querySelector('input[name="redeem-type"]:checked')?.value || 'total';
    const gross = parseFloat(document.getElementById('redeem-gross')?.value || '0');
    const date  = document.getElementById('redeem-date')?.value || '';
    const quotasResgatadas = type === 'parcial'
      ? parseFloat(document.getElementById('redeem-quotas')?.value || '0')
      : totalQuotas;

    if (!gross || gross <= 0)    { showToast('Informe o valor bruto do resgate.', 'error'); return; }
    if (!date)                   { showToast('Informe a data do resgate.', 'error'); return; }
    if (type === 'parcial' && (!quotasResgatadas || quotasResgatadas <= 0))
      { showToast('Informe as cotas resgatadas.', 'error'); return; }
    if (type === 'parcial' && quotasResgatadas > totalQuotas)
      { showToast(`Você tem apenas ${totalQuotas.toLocaleString('pt-BR', { maximumFractionDigits: 6 })} cotas.`, 'error'); return; }

    openFundRedeemStep2(fund, invested, current, totalQuotas, gross, date, type, quotasResgatadas);
  });
}

function openFundRedeemStep2(fund, invested, current, totalQuotas, gross, date, type, quotasResgatadas) {
  const investedProp = type === 'parcial'
    ? invested * (quotasResgatadas / totalQuotas)
    : invested;

  openModal(
    'IR sobre o Resgate',
    `<div style="background:var(--color-gray-50);border-radius:var(--radius-md);padding:var(--space-3);margin-bottom:var(--space-4);">
       <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
         <span style="color:var(--color-gray-600);">Fundo</span>
         <strong>${escapeHtml(fund.name)}</strong>
       </div>
       <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
         <span style="color:var(--color-gray-600);">Tipo</span>
         <span>${type === 'total' ? 'Resgate Total' : `Parcial — ${quotasResgatadas.toLocaleString('pt-BR', { maximumFractionDigits: 6 })} cotas`}</span>
       </div>
       <div style="display:flex;justify-content:space-between;">
         <span style="color:var(--color-gray-600);">Valor Bruto</span>
         <strong style="color:var(--color-success-700);">${formatCurrency(gross)}</strong>
       </div>
     </div>
     <div class="form-group">
       <label class="form-label">IR retido na fonte (R$)</label>
       <input type="number" id="redeem-ir" class="form-control" placeholder="0,00" step="0.01" min="0" value="0">
       <small style="color:var(--color-gray-500);">Valor do IR informado no extrato da corretora. Pode ser 0.</small>
     </div>
     <div id="redeem-summary" style="margin-top:var(--space-4);padding-top:var(--space-4);border-top:1px solid var(--color-gray-200);"></div>`,
    `<button type="button" class="btn btn-ghost" id="fund-redeem-back">← Voltar</button>
     <button type="button" class="btn btn-danger" id="fund-redeem-confirm">Confirmar Resgate</button>`
  );

  function updateSummary() {
    const ir     = Math.max(0, parseFloat(document.getElementById('redeem-ir')?.value || '0') || 0);
    const net    = gross - ir;
    const ret    = net - investedProp;
    const retPct = investedProp > 0 ? (ret / investedProp) * 100 : 0;
    const color  = ret >= 0 ? 'var(--color-success-700)' : 'var(--color-danger-700)';
    document.getElementById('redeem-summary').innerHTML = `
      <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
        <span style="color:var(--color-gray-500);">− IR Retido</span>
        <span style="color:var(--color-danger-600);">− ${formatCurrency(ir)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:var(--font-size-lg);font-weight:var(--font-weight-semibold);margin-bottom:8px;">
        <span>Valor Líquido</span>
        <span>${formatCurrency(net)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;">
        <span style="color:var(--color-gray-500);">Rendimento Líquido</span>
        <span style="color:${color};font-weight:var(--font-weight-semibold);">
          ${ret >= 0 ? '+' : ''}${formatCurrency(ret)} (${ret >= 0 ? '+' : ''}${retPct.toFixed(2)}%)
        </span>
      </div>`;
  }

  updateSummary();
  document.getElementById('redeem-ir').addEventListener('input', updateSummary);

  document.getElementById('fund-redeem-back').addEventListener('click', () =>
    openFundRedemptionModal(fund, invested, current, totalQuotas)
  );

  document.getElementById('fund-redeem-confirm').addEventListener('click', () => {
    const ir  = Math.max(0, parseFloat(document.getElementById('redeem-ir')?.value || '0') || 0);
    const net = gross - ir;

    if (type === 'total') {
      deleteInvestmentFund(fund.id);
    } else {
      updateInvestmentFund(fund.id, { quotas: totalQuotas - quotasResgatadas });
    }

    addRedemption({
      investmentId: fund.id, investmentType: 'fundo', investmentName: fund.name,
      amount: gross, irAmount: ir, netAmount: net, redeemType: type, date,
      note: ir > 0 ? `Bruto: ${formatCurrency(gross)} | IR: ${formatCurrency(ir)}` : `Bruto: ${formatCurrency(gross)}`,
    });

    addTransaction({
      description: `Resgate ${type === 'total' ? 'total' : 'parcial'} — ${fund.name}`,
      amount: net,
      date,
      type: 'income',
      categoryId: 'cat_investimentos',
      note: ir > 0
        ? `Bruto: ${formatCurrency(gross)} | IR: ${formatCurrency(ir)}`
        : `Bruto: ${formatCurrency(gross)}`,
      fromInvestment: true,
    });

    closeModal();
    showToast('Resgate registrado e lançado em Movimentações!', 'success');
    renderTabContent('fundos');
  });
}

// ── Resgates ──

function bindRedeemEvents(cls, type, redemptions) {
  document.querySelectorAll('.' + cls).forEach(btn => {
    btn.addEventListener('click', () => {
      openRedemptionModal({
        id:       btn.dataset.id,
        name:     btn.dataset.name,
        invested: parseFloat(btn.dataset.invested || btn.dataset.net),
        current:  parseFloat(btn.dataset.current  || btn.dataset.net),
        type,
        redemptions,
      });
    });
  });
}

function openRedemptionModal({ id, name, invested, current, type, redemptions }) {
  const isRV       = type === 'rv';
  const actionWord = isRV ? 'Vender' : 'Resgatar';

  openModal(
    `${actionWord} — ${escapeHtml(name)}`,
    `<div class="form-group">
       <label class="form-label">Tipo</label>
       <div style="display:flex;gap:8px;">
         <label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:8px 12px;border:1px solid var(--color-gray-200);border-radius:var(--radius-md);flex:1;">
           <input type="radio" name="redeem-type" value="total" checked> ${isRV ? 'Vender tudo' : 'Total'}
         </label>
         <label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:8px 12px;border:1px solid var(--color-gray-200);border-radius:var(--radius-md);flex:1;">
           <input type="radio" name="redeem-type" value="parcial"> Parcial
         </label>
       </div>
     </div>
     <div class="form-row">
       <div class="form-group">
         <label class="form-label">Valor Bruto Recebido (R$) *</label>
         <input type="number" id="redeem-gross" class="form-control"
           placeholder="0,00" step="0.01" min="0.01" value="${current.toFixed(2)}">
       </div>
       <div class="form-group">
         <label class="form-label">Data *</label>
         <input type="date" id="redeem-date" class="form-control" value="${new Date().toISOString().split('T')[0]}">
       </div>
     </div>`,
    `<button type="button" class="btn btn-ghost" id="modal-cancel">Cancelar</button>
     <button type="button" class="btn btn-primary" id="redeem-next">Próximo →</button>`
  );

  document.getElementById('modal-cancel').addEventListener('click', closeModal);

  document.querySelectorAll('input[name="redeem-type"]').forEach(r => {
    r.addEventListener('change', () => {
      if (r.value === 'total' && r.checked)
        document.getElementById('redeem-gross').value = current.toFixed(2);
    });
  });

  document.getElementById('redeem-next').addEventListener('click', () => {
    const redeemType = document.querySelector('input[name="redeem-type"]:checked')?.value || 'total';
    const gross      = parseFloat(document.getElementById('redeem-gross')?.value || '0');
    const date       = document.getElementById('redeem-date')?.value || '';

    if (!gross || gross <= 0) { showToast('Informe o valor bruto.', 'error'); return; }
    if (!date)                { showToast('Informe a data.', 'error'); return; }

    const investedProp = redeemType === 'total' || current <= 0
      ? invested
      : invested * (gross / current);

    openRedemptionModalStep2({ id, name, invested, current, gross, date, redeemType, investedProp, type, redemptions });
  });
}

function openRedemptionModalStep2({ id, name, invested, current, gross, date, redeemType, investedProp, type, redemptions }) {
  const isRV = type === 'rv';

  openModal(
    'IR sobre o Resgate',
    `<div style="background:var(--color-gray-50);border-radius:var(--radius-md);padding:var(--space-3);margin-bottom:var(--space-4);">
       <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
         <span style="color:var(--color-gray-600);">Investimento</span>
         <strong>${escapeHtml(name)}</strong>
       </div>
       <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
         <span style="color:var(--color-gray-600);">Tipo</span>
         <span>${redeemType === 'total' ? (isRV ? 'Venda Total' : 'Resgate Total') : (isRV ? 'Venda Parcial' : 'Resgate Parcial')}</span>
       </div>
       <div style="display:flex;justify-content:space-between;">
         <span style="color:var(--color-gray-600);">Valor Bruto</span>
         <strong style="color:var(--color-success-700);">${formatCurrency(gross)}</strong>
       </div>
     </div>
     <div class="form-group">
       <label class="form-label">IR retido na fonte (R$)</label>
       <input type="number" id="redeem-ir" class="form-control" placeholder="0,00" step="0.01" min="0" value="0">
       <small style="color:var(--color-gray-500);">Valor do IR informado no extrato da corretora. Pode ser 0.</small>
     </div>
     <div id="redeem-summary" style="margin-top:var(--space-4);padding-top:var(--space-4);border-top:1px solid var(--color-gray-200);"></div>`,
    `<button type="button" class="btn btn-ghost" id="redeem-back">← Voltar</button>
     <button type="button" class="btn btn-danger" id="redeem-confirm">Confirmar</button>`
  );

  function updateSummary() {
    const ir     = Math.max(0, parseFloat(document.getElementById('redeem-ir')?.value || '0') || 0);
    const net    = gross - ir;
    const ret    = net - investedProp;
    const retPct = investedProp > 0 ? (ret / investedProp) * 100 : 0;
    const color  = ret >= 0 ? 'var(--color-success-700)' : 'var(--color-danger-700)';
    document.getElementById('redeem-summary').innerHTML = `
      <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
        <span style="color:var(--color-gray-500);">− IR Retido</span>
        <span style="color:var(--color-danger-600);">− ${formatCurrency(ir)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:var(--font-size-lg);font-weight:var(--font-weight-semibold);margin-bottom:8px;">
        <span>Valor Líquido</span>
        <span>${formatCurrency(net)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;">
        <span style="color:var(--color-gray-500);">Rendimento Líquido</span>
        <span style="color:${color};font-weight:var(--font-weight-semibold);">
          ${ret >= 0 ? '+' : ''}${formatCurrency(ret)} (${ret >= 0 ? '+' : ''}${retPct.toFixed(2)}%)
        </span>
      </div>`;
  }

  updateSummary();
  document.getElementById('redeem-ir').addEventListener('input', updateSummary);

  document.getElementById('redeem-back').addEventListener('click', () =>
    openRedemptionModal({ id, name, invested, current, type, redemptions })
  );

  document.getElementById('redeem-confirm').addEventListener('click', () => {
    const ir  = Math.max(0, parseFloat(document.getElementById('redeem-ir')?.value || '0') || 0);
    const net = gross - ir;

    addRedemption({
      investmentId: id, investmentType: type, investmentName: name,
      amount: gross, irAmount: ir, netAmount: net, redeemType, date,
      note: ir > 0 ? `Bruto: ${formatCurrency(gross)} | IR: ${formatCurrency(ir)}` : `Bruto: ${formatCurrency(gross)}`,
    });

    addTransaction({
      description: `${redeemType === 'total' ? (isRV ? 'Venda total' : 'Resgate total') : (isRV ? 'Venda parcial' : 'Resgate parcial')} — ${name}`,
      amount: net,
      date,
      type: 'income',
      categoryId: 'cat_investimentos',
      note: ir > 0 ? `Bruto: ${formatCurrency(gross)} | IR: ${formatCurrency(ir)}` : `Bruto: ${formatCurrency(gross)}`,
      fromInvestment: true,
    });

    closeModal();
    showToast('Resgate registrado e lançado em Movimentações!', 'success');
    renderTabContent(type === 'rf' ? 'rf' : 'rv');
  });
}

// ── Editar Nome ──────────────────────────────────────────────────────────────

function openEditNameModal(id, currentName, updateFn, tab) {
  openModal(
    'Editar Nome',
    `<div class="form-group">
       <label class="form-label">Nome</label>
       <input type="text" id="edit-name-input" class="form-control"
         value="${escapeHtml(currentName)}" placeholder="Nome do investimento">
     </div>`,
    `<button type="button" class="btn btn-ghost" id="modal-cancel">Cancelar</button>
     <button type="button" class="btn btn-primary" id="edit-name-save">Salvar</button>`
  );

  const input = document.getElementById('edit-name-input');
  input.focus();
  input.select();

  document.getElementById('modal-cancel').addEventListener('click', closeModal);

  const save = () => {
    const newName = input.value.trim();
    if (!newName) { showToast('Nome não pode ser vazio.', 'error'); return; }
    updateFn(id, { name: newName });
    closeModal();
    showToast('Nome atualizado!', 'success');
    renderTabContent(tab);
  };

  document.getElementById('edit-name-save').addEventListener('click', save);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
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
