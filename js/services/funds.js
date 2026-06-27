// ============================================
// FINANÇAS PRO — Serviço de Fundos
// ============================================
//
// Dados de cadastro: API REST CVM (via proxy — funciona para fundos antigos)
// Valor da cota:     Manual por fundo (CVM mudou para ZIP, sem acesso cross-origin)

const CAD_API    = 'https://dados.cvm.gov.br/api/FI/cadfi/';
const CORS_PROXY = 'https://corsproxy.io/?url=';

const FUND_INFO_KEY = 'fp_fund_info_cache';

// ── Helpers ──────────────────────────────────────────────────────────────────

export function normalizeCNPJ(cnpj) {
  const d = String(cnpj).replace(/\D/g, '');
  if (d.length !== 14) return cnpj;
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
}

export function formatCNPJ(cnpj) {
  return normalizeCNPJ(cnpj);
}

function getInfoCache() {
  try { return JSON.parse(localStorage.getItem(FUND_INFO_KEY) || '{}'); }
  catch { return {}; }
}

// ── Classificação CVM → label amigável ───────────────────────────────────────

const CLASS_MAP = {
  'Ações':               { label: 'Ações',        color: '#EF4444' },
  'Renda Fixa':          { label: 'Renda Fixa',   color: '#3B82F6' },
  'Multimercado':        { label: 'Multimercado', color: '#8B5CF6' },
  'Cambial':             { label: 'Cambial',      color: '#F59E0B' },
  'Previdência':         { label: 'Previdência',  color: '#10B981' },
  'FIDC':                { label: 'FIDC',         color: '#F97316' },
  'FII':                 { label: 'FII',          color: '#06B6D4' },
  'Criptoativos':        { label: 'Cripto',       color: '#6366F1' },
  'Fundo de Ações':      { label: 'Ações',        color: '#EF4444' },
  'Fundo de Renda Fixa': { label: 'Renda Fixa',   color: '#3B82F6' },
};

export function classifyFund(classe) {
  if (!classe) return { label: 'Outro', color: '#64748B' };
  for (const [key, val] of Object.entries(CLASS_MAP)) {
    if (classe.toLowerCase().includes(key.toLowerCase())) return val;
  }
  return { label: classe, color: '#64748B' };
}

// ── Busca informações do fundo pelo CNPJ (apenas cadastro) ───────────────────

async function fetchCVMJson(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (res.ok) return await res.json();
  } catch {}
  const proxyRes = await fetch(CORS_PROXY + encodeURIComponent(url), { signal: AbortSignal.timeout(12000) });
  if (!proxyRes.ok) throw new Error(`CVM proxy ${proxyRes.status}`);
  return await proxyRes.json();
}

export async function getFundInfo(cnpj) {
  const key    = normalizeCNPJ(cnpj);
  const digits = String(cnpj).replace(/\D/g, '');
  const cache  = getInfoCache();

  if (cache[key]) return cache[key];

  let data = null;
  for (const param of [key, digits]) {
    try {
      const json = await fetchCVMJson(`${CAD_API}?CNPJ_FUNDO=${encodeURIComponent(param)}`);
      if (json?.length) { data = json; break; }
    } catch {}
  }
  if (!data) throw new Error('Fundo não encontrado na CVM');

  const f = data[0];
  const info = {
    cnpj:      key,
    name:      f.DENOM_SOCIAL || f.RAZAO_SOCIAL || key,
    type:      f.TP_FUNDO    || '',
    classe:    f.CLASSE      || f.TP_FUNDO || '',
    manager:   f.GESTOR      || '',
    admin:     f.ADMIN       || '',
    situation: f.SIT         || '',
    startDate: f.DT_INI_ATIV || '',
  };

  cache[key] = info;
  localStorage.setItem(FUND_INFO_KEY, JSON.stringify(cache));
  return info;
}

// ── Cotas: armazenamento manual ───────────────────────────────────────────────
// A CVM migrou para arquivos ZIP sem acesso cross-origin confiável.
// Cotas são salvas manualmente pelo usuário e persistidas no localStorage.

const MANUAL_QUOTA_KEY = 'fp_fund_manual_quotas';

export function getManualQuotas() {
  try { return JSON.parse(localStorage.getItem(MANUAL_QUOTA_KEY) || '{}'); }
  catch { return {}; }
}

export function saveManualQuota(cnpj, quota, date) {
  const key  = normalizeCNPJ(cnpj);
  const all  = getManualQuotas();
  all[key]   = { quota: parseFloat(quota), date: date || new Date().toISOString().split('T')[0], updatedAt: Date.now() };
  localStorage.setItem(MANUAL_QUOTA_KEY, JSON.stringify(all));
  return all[key];
}

export function clearFundQuotaCache() {
  localStorage.removeItem(MANUAL_QUOTA_KEY);
}
