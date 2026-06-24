// ============================================
// FINANÇAS PRO — Serviço de Taxas (BCB API)
// ============================================
//
// Busca CDI, SELIC e IPCA do Banco Central do Brasil
// API pública: https://api.bcb.gov.br
// Cache diário em localStorage para não chamar a API toda hora

const RATES_CACHE_KEY = 'fp_rates_cache_v2'; // v2: CDI convertido para anual
const BCB_BASE = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs';

// Códigos das séries no BCB
const SERIES = {
  CDI:   11,   // CDI over - % a.a.
  SELIC: 1178, // SELIC over - % a.a.
  IPCA:  433,  // IPCA mensal - % ao mês
};

// Taxas de fallback caso a API esteja fora do ar (valores aproximados jun/2026)
const FALLBACK_RATES = {
  cdi:      14.34, // % a.a. (calculado de 0.0534% ao dia × 252)
  cdiDaily: 0.0534,
  selic:    14.40, // % a.a.
  ipca:     0.58,  // % ao mês
};

function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}

function getCache() {
  try {
    const data = localStorage.getItem(RATES_CACHE_KEY);
    return data ? JSON.parse(data) : null;
  } catch { return null; }
}

function setCache(rates) {
  localStorage.setItem(RATES_CACHE_KEY, JSON.stringify({
    date: getTodayStr(),
    rates,
  }));
}

async function fetchSeries(code) {
  const url = `${BCB_BASE}.${code}/dados/ultimos/1?formato=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`BCB API erro: ${res.status}`);
  const data = await res.json();
  const valor = data[0]?.valor;
  if (!valor) throw new Error('Valor vazio da API');
  return parseFloat(String(valor).replace(',', '.'));
}

// Converte taxa diária CDI (ex: 0.0534% ao dia) para anual base 252
function dailyToAnnual252(dailyPct) {
  return ((1 + dailyPct / 100) ** 252 - 1) * 100;
}

/**
 * Retorna as taxas atuais (CDI, SELIC, IPCA).
 * - Se já buscou hoje: usa o cache (instantâneo)
 * - Se não: busca na API do BC e salva no cache
 * - Se a API falhar: usa cache antigo ou taxas de fallback
 */
export async function getRates() {
  const cache = getCache();

  // Cache de hoje disponível → usa direto
  if (cache && cache.date === getTodayStr() && cache.rates) {
    return { ...cache.rates, fromCache: true };
  }

  try {
    const [cdiDaily, selic, ipca] = await Promise.all([
      fetchSeries(SERIES.CDI),   // retorna taxa DIÁRIA (ex: 0.0534% ao dia)
      fetchSeries(SERIES.SELIC), // retorna taxa ANUAL  (ex: 14.40% a.a.)
      fetchSeries(SERIES.IPCA),  // retorna taxa MENSAL (ex: 0.58% ao mês)
    ]);

    // Converte CDI diário → anual base 252 dias úteis
    const cdi = dailyToAnnual252(cdiDaily);

    const rates = {
      cdi,        // % a.a. (convertido de diário)
      cdiDaily,   // % ao dia (valor bruto da API)
      selic,      // % a.a. (já anual)
      ipca,       // % ao mês (será anualizado na hora de calcular)
      fetchedAt: new Date().toISOString(),
      fromCache: false,
    };
    setCache(rates);
    return rates;

  } catch (err) {
    console.warn('[Taxas] API do BC indisponível, usando fallback:', err.message);

    // Usa cache antigo se existir
    if (cache?.rates) {
      return { ...cache.rates, fromCache: true, stale: true };
    }

    // Último recurso: taxas aproximadas
    return { ...FALLBACK_RATES, fromCache: false, stale: true };
  }
}

// ── Funções de cálculo ──────────────────────────────────────────

/**
 * Dias corridos desde uma data
 */
export function daysSince(dateStr) {
  if (!dateStr) return 0;
  const start = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((today - start) / (1000 * 60 * 60 * 24)));
}

/**
 * Converte IPCA mensal (%) para anual (%)
 */
export function annualizeIPCA(monthly) {
  return (Math.pow(1 + monthly / 100, 12) - 1) * 100;
}

/**
 * Retorna a taxa anual base de um indexador
 */
export function getBaseRate(indexer, rates) {
  switch (indexer?.toUpperCase()) {
    case 'CDI':   return rates.cdi   || FALLBACK_RATES.cdi;
    case 'SELIC': return rates.selic || FALLBACK_RATES.selic;
    case 'IPCA':  return annualizeIPCA(rates.ipca || FALLBACK_RATES.ipca);
    case 'IGPM':  return 6.5; // IGP-M não tem série simples no BCB, usa aproximação
    default:      return rates.cdi   || FALLBACK_RATES.cdi;
  }
}

/**
 * Calcula o valor atual de um investimento de renda fixa
 *
 * @param {number} principal   - Valor aplicado original (R$)
 * @param {object} inv         - Objeto do investimento (campos returnType, preRate, etc.)
 * @param {object} rates       - Taxas atuais { cdi, selic, ipca }
 * @returns {number}           - Valor atual estimado (R$)
 */
export function calcCurrentValueRF(principal, inv, rates) {
  const days = daysSince(inv.applicationDate);
  if (days <= 0 || principal <= 0) return principal;

  let annualRate = 0; // % a.a.

  switch (inv.returnType) {
    case 'pre': {
      annualRate = parseFloat(inv.preRate) || 0;
      break;
    }
    case 'pos': {
      const indexer    = inv.posIndexer || inv.indexer || 'CDI';
      const percentage = parseFloat(inv.posPercentage ?? inv.percentage) || 100;
      const baseRate   = getBaseRate(indexer, rates);
      annualRate       = (percentage / 100) * baseRate;
      break;
    }
    case 'hybrid': {
      const indexer  = inv.hybridIndexer || inv.indexer || 'IPCA';
      const spread   = parseFloat(inv.hybridRate ?? inv.rate) || 0;
      const baseRate = getBaseRate(indexer, rates);
      annualRate     = baseRate + spread;
      break;
    }
    default:
      return principal;
  }

  // Juros compostos contínuos: V = P × (1 + i)^(t/365)
  return principal * Math.pow(1 + annualRate / 100, days / 365);
}

/**
 * Calcula rendimento R$ e % em relação ao principal
 */
export function calcReturn(principal, currentValue) {
  const returnBRL = currentValue - principal;
  const returnPct = principal > 0 ? (returnBRL / principal) * 100 : 0;
  return { returnBRL, returnPct };
}

/**
 * Formata a taxa de rendimento de um título para exibição
 * Ex: "100% CDI", "IPCA + 5,5% a.a.", "12,5% a.a."
 */
export function formatRateLabel(inv, rates) {
  switch (inv.returnType) {
    case 'pre':
      return `${parseFloat(inv.preRate || 0).toFixed(2)}% a.a.`;
    case 'pos': {
      const indexer = inv.posIndexer || inv.indexer || 'CDI';
      const pct     = parseFloat((inv.posPercentage ?? inv.percentage) || 100);
      const baseRate = getBaseRate(indexer, rates);
      const effective = (pct / 100) * baseRate;
      return `${pct}% ${indexer} · ${effective.toFixed(2)}% a.a.`;
    }
    case 'hybrid': {
      const indexer = inv.hybridIndexer || inv.indexer || 'IPCA';
      const spread  = parseFloat((inv.hybridRate ?? inv.rate) || 0);
      const baseRate = getBaseRate(indexer, rates);
      const effective = baseRate + spread;
      return `${indexer} + ${spread.toFixed(2)}% · ${effective.toFixed(2)}% a.a.`;
    }
    default:
      return '—';
  }
}
