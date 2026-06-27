// ============================================
// FINANÇAS PRO — Serviço de Cotações (BRAPI)
// ============================================
//
// Busca preços de ações, FIIs, ETFs, BDRs, cripto
// via BRAPI (brapi.dev) — gratuita, sem chave, CORS liberado
//
// Estratégia:
// - Batch: busca todos os tickers em 1 requisição
// - Cache: 15 minutos no localStorage por ticker
// - Fallback: usa cache antigo se API falhar

const QUOTES_CACHE_KEY = 'fp_quotes_cache';
const CACHE_TTL_MS     = 15 * 60 * 1000; // 15 minutos
const BRAPI_BASE       = 'https://brapi.dev/api/quote';
const BRAPI_TOKEN      = 'jpojnWeJd5rcAecCzHa2E7';

function getCache() {
  try {
    return JSON.parse(localStorage.getItem(QUOTES_CACHE_KEY) || '{}');
  } catch { return {}; }
}

function setCache(data) {
  localStorage.setItem(QUOTES_CACHE_KEY, JSON.stringify(data));
}

/**
 * Busca cotações de uma lista de tickers.
 * Retorna objeto { TICKER: { price, change, changeAbs, name, fetchedAt, stale } }
 *
 * Para ações BR: "PETR4" → busca como "PETR4.SA" no Yahoo, mas a BRAPI aceita direto "PETR4"
 * Para cripto: "BTC" → "BTC" (BRAPI tem suporte)
 */
async function fetchBatch(tickerList) {
  const batch = tickerList.map(t => encodeURIComponent(t)).join(',');
  const url   = `${BRAPI_BASE}/${batch}?fundamental=false&token=${BRAPI_TOKEN}`;
  const res   = await fetch(url);
  if (!res.ok) throw new Error(`BRAPI HTTP ${res.status}`);
  const data  = await res.json();
  return data.results || [];
}

function parseQuote(q) {
  return {
    price:     q.regularMarketPrice          || 0,
    change:    q.regularMarketChangePercent  || 0,
    changeAbs: q.regularMarketChange         || 0,
    prevClose: q.regularMarketPreviousClose  || 0,
    name:      q.shortName || q.longName     || q.symbol,
    currency:  q.currency  || 'BRL',
    fetchedAt: Date.now(),
    stale:     false,
  };
}

export async function getQuotes(tickers) {
  if (!tickers || tickers.length === 0) return {};

  const cache = getCache();
  const now   = Date.now();
  const NOT_FOUND_TTL = 2 * 60 * 1000; // tickers não encontrados: retry em 2 min

  // Quais precisam de busca?
  const stale = tickers.filter(t => {
    if (!t) return false;
    const c = cache[t.toUpperCase()];
    if (!c) return true;
    const ttl = c.notFound ? NOT_FOUND_TTL : CACHE_TTL_MS;
    return (now - (c.fetchedAt || 0)) > ttl;
  });

  if (stale.length > 0) {
    // 1ª tentativa: batch com todos os tickers stale
    let found = [];
    try {
      found = await fetchBatch(stale);
      found.forEach(q => {
        const symbol = q.symbol?.replace('.SA', '').toUpperCase();
        if (symbol) cache[symbol] = parseQuote(q);
      });
    } catch (err) {
      console.warn('[Cotações] Batch falhou:', err.message);
    }

    // Tickers que o batch não retornou → tenta individualmente com delay
    const foundSymbols = new Set(found.map(q => q.symbol?.replace('.SA','').toUpperCase()));
    const missing = stale.filter(t => !foundSymbols.has(t.toUpperCase()));

    if (missing.length > 0) {
      console.log('[BRAPI] Batch retornou:', [...foundSymbols], '| Buscando individualmente:', missing);
    }

    for (const ticker of missing) {
      const key = ticker.toUpperCase();
      await new Promise(r => setTimeout(r, 400)); // 400ms entre requisições
      try {
        const url = `${BRAPI_BASE}/${encodeURIComponent(ticker)}?fundamental=false&token=${BRAPI_TOKEN}`;
        const res = await fetch(url);
        const json = await res.json();
        console.log(`[BRAPI] ${ticker}:`, json);
        const q = json.results?.[0];
        if (q && q.regularMarketPrice) {
          cache[key] = parseQuote(q);
          console.log(`[BRAPI] ${ticker} OK → R$ ${q.regularMarketPrice}`);
        } else {
          cache[key] = { price: null, fetchedAt: now, notFound: true };
          console.warn(`[BRAPI] ${ticker} não encontrado. Resposta:`, json);
        }
      } catch (err) {
        console.error(`[BRAPI] Erro ao buscar ${ticker}:`, err);
        if (!cache[key]) cache[key] = { price: null, fetchedAt: now, notFound: true };
      }
    }

    setCache(cache);
  }

  const result = {};
  tickers.forEach(t => {
    if (t) result[t.toUpperCase()] = cache[t.toUpperCase()] || null;
  });
  return result;
}

// Converte qualquer formato de data para YYYY-MM-DD
// Suporta: "30/06/2026", "2026-06-30", "2026-06-30T00:00:00"
function normalizeDate(str) {
  if (!str) return '';
  const s = String(str).trim();
  // DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [d, m, y] = s.split('/');
    return `${y}-${m}-${d}`;
  }
  // YYYY-MM-DD ou YYYY-MM-DDTHH:MM:SS
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return s.slice(0, 10);
  }
  return s;
}

// ── Cache de dividendos ────────────────────────────────────────────────────
const DIVIDENDS_CACHE_KEY = 'fp_dividends_cache';
const DIVIDENDS_TTL_MS    = 60 * 60 * 1000; // 1 hora

function getDivCache() {
  try { return JSON.parse(localStorage.getItem(DIVIDENDS_CACHE_KEY) || '{}'); }
  catch { return {}; }
}
function setDivCache(data) {
  localStorage.setItem(DIVIDENDS_CACHE_KEY, JSON.stringify(data));
}

/**
 * Busca histórico e próximos dividendos de uma lista de tickers via BRAPI.
 * Retorna { TICKER: [ { type, paymentDate, rate, relatedTo, declaredDate } ] }
 *
 * "rate" = valor por cota/ação em R$
 */
export async function getDividends(tickers) {
  if (!tickers || tickers.length === 0) return {};

  const cache = getDivCache();
  const now   = Date.now();
  const result = {};

  for (const ticker of tickers) {
    const key = ticker.toUpperCase();
    const cached = cache[key];
    if (cached && (now - (cached.fetchedAt || 0)) < DIVIDENDS_TTL_MS) {
      result[key] = cached.data;
      continue;
    }

    try {
      const url  = `${BRAPI_BASE}/${encodeURIComponent(ticker)}?dividends=true&fundamental=false&token=${BRAPI_TOKEN}`;
      const res  = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      const cashDivs = json.results?.[0]?.dividendsData?.cashDividends || [];

      if (cashDivs.length > 0) {
        console.log(`[Dividendos] ${ticker} amostra bruta:`, cashDivs[0]);
      }

      const divs = cashDivs.map(d => ({
        type:         d.label         || d.type        || 'Dividendo',
        paymentDate:  normalizeDate(d.paymentDate),
        rate:         parseFloat(String(d.rate || 0).replace(',', '.')) || 0,
        relatedTo:    d.relatedTo     || '',
        declaredDate: normalizeDate(d.approvedOn || d.declaredDate),
        exDate:       normalizeDate(d.lastDatePrior),
      }));

      console.log(`[Dividendos] ${ticker} → ${divs.length} registros | 1º:`, divs[0]);
      cache[key] = { fetchedAt: now, data: divs };
      result[key] = divs;
    } catch (err) {
      console.warn(`[Dividendos] Erro ao buscar ${ticker}:`, err.message);
      result[key] = cache[key]?.data || [];
    }
  }

  setDivCache(cache);
  return result;
}

/**
 * Retorna a hora da última atualização dos tickers
 */
export function getLastUpdateTime(quotes) {
  const times = Object.values(quotes)
    .filter(q => q && q.fetchedAt)
    .map(q => q.fetchedAt);
  if (!times.length) return null;
  return new Date(Math.max(...times));
}

/**
 * Calcula rendimento de um ativo RV com base no preço atual
 */
export function calcRVReturn(inv, currentPrice) {
  if (!currentPrice || currentPrice <= 0) return null;
  const qty        = parseFloat(inv.quantity)  || 0;
  const avgPrice   = parseFloat(inv.avgPrice)  || 0;
  const invested   = qty * avgPrice;
  const current    = qty * currentPrice;
  const returnBRL  = current - invested;
  const returnPct  = invested > 0 ? (returnBRL / invested) * 100 : 0;
  return { qty, avgPrice, invested, current, returnBRL, returnPct };
}
