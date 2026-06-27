// ============================================
// FINANÇAS PRO — Storage Service
// ============================================

import { generateId, getTodayStr } from './utils.js';

const STORAGE_KEYS = {
  USERS: 'fp_users',
  CURRENT_USER: 'fp_current_user',
  TRANSACTIONS: 'fp_transactions',
  CATEGORIES: 'fp_categories',
  FIXED_EXPENSES: 'fp_fixed_expenses',
  SETTINGS: 'fp_settings',
  FIXED_LAUNCHED: 'fp_fixed_launched',
  SELECTED_MODE: 'fp_selected_mode',
};

// Default categories with emoji icons and colors
const DEFAULT_CATEGORIES = [
  { id: 'cat_alimentacao', name: 'Alimentação', icon: '🍽️', color: '#F59E0B', isDefault: true },
  { id: 'cat_mercado', name: 'Mercado', icon: '🛒', color: '#22C55E', isDefault: true },
  { id: 'cat_restaurante', name: 'Restaurante', icon: '🍕', color: '#EF4444', isDefault: true },
  { id: 'cat_ifood', name: 'iFood', icon: '📱', color: '#EC4899', isDefault: true },
  { id: 'cat_moradia', name: 'Moradia', icon: '🏠', color: '#3B82F6', isDefault: true },
  { id: 'cat_agua', name: 'Água', icon: '💧', color: '#06B6D4', isDefault: true },
  { id: 'cat_energia', name: 'Energia', icon: '⚡', color: '#F97316', isDefault: true },
  { id: 'cat_internet', name: 'Internet', icon: '🌐', color: '#8B5CF6', isDefault: true },
  { id: 'cat_transporte', name: 'Transporte', icon: '🚗', color: '#6366F1', isDefault: true },
  { id: 'cat_combustivel', name: 'Combustível', icon: '⛽', color: '#84CC16', isDefault: true },
  { id: 'cat_saude', name: 'Saúde', icon: '🏥', color: '#14B8A6', isDefault: true },
  { id: 'cat_academia', name: 'Academia', icon: '💪', color: '#0EA5E9', isDefault: true },
  { id: 'cat_educacao', name: 'Educação', icon: '📚', color: '#A855F7', isDefault: true },
  { id: 'cat_lazer', name: 'Lazer', icon: '🎮', color: '#E11D48', isDefault: true },
  { id: 'cat_investimentos', name: 'Investimentos', icon: '📈', color: '#10B981', isDefault: true },
  { id: 'cat_cartao', name: 'Cartão de Crédito', icon: '💳', color: '#D946EF', isDefault: true },
  { id: 'cat_outros', name: 'Outros', icon: '📦', color: '#64748B', isDefault: true },
  { id: 'cat_salario', name: 'Salário', icon: '💰', color: '#22C55E', isDefault: true },
];

function getStore(key) {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

function setStore(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// ── Users ──
export function getUsers() {
  return getStore(STORAGE_KEYS.USERS) || [];
}

export function addUser(user) {
  const users = getUsers();
  users.push(user);
  setStore(STORAGE_KEYS.USERS, users);
}

export function findUserByEmail(email) {
  return getUsers().find(u => u.email.toLowerCase() === email.toLowerCase());
}

export function setCurrentUser(user) {
  setStore(STORAGE_KEYS.CURRENT_USER, user);
}

export function getCurrentUser() {
  return getStore(STORAGE_KEYS.CURRENT_USER);
}

export function clearCurrentUser() {
  localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
}

// ── Categories ──
export function getCategories() {
  const cats = getStore(STORAGE_KEYS.CATEGORIES);
  if (!cats) {
    setStore(STORAGE_KEYS.CATEGORIES, DEFAULT_CATEGORIES);
    return [...DEFAULT_CATEGORIES];
  }
  return cats;
}

export function addCategory(cat) {
  const cats = getCategories();
  const newCat = { ...cat, id: generateId(), isDefault: false };
  cats.push(newCat);
  setStore(STORAGE_KEYS.CATEGORIES, cats);
  return newCat;
}

export function updateCategory(id, updates) {
  const cats = getCategories();
  const idx = cats.findIndex(c => c.id === id);
  if (idx !== -1) {
    cats[idx] = { ...cats[idx], ...updates };
    setStore(STORAGE_KEYS.CATEGORIES, cats);
  }
}

export function deleteCategory(id) {
  let cats = getCategories();
  cats = cats.filter(c => c.id !== id);
  setStore(STORAGE_KEYS.CATEGORIES, cats);
}

export function getCategoryById(id) {
  return getCategories().find(c => c.id === id);
}

// ── Transactions ──
export function getTransactions() {
  return getStore(STORAGE_KEYS.TRANSACTIONS) || [];
}

export function getUserTransactions() {
  const user = getCurrentUser();
  if (!user) return [];
  return getTransactions().filter(t => t.userId === user.id);
}

export function addTransaction(transaction) {
  const txs = getTransactions();
  const user = getCurrentUser();
  const newTx = {
    ...transaction,
    id: generateId(),
    userId: user.id,
    createdAt: new Date().toISOString(),
  };
  txs.push(newTx);
  setStore(STORAGE_KEYS.TRANSACTIONS, txs);
  return newTx;
}

export function updateTransaction(id, updates) {
  const txs = getTransactions();
  const idx = txs.findIndex(t => t.id === id);
  if (idx !== -1) {
    txs[idx] = { ...txs[idx], ...updates };
    setStore(STORAGE_KEYS.TRANSACTIONS, txs);
  }
}

export function deleteTransaction(id) {
  let txs = getTransactions();
  txs = txs.filter(t => t.id !== id);
  setStore(STORAGE_KEYS.TRANSACTIONS, txs);
}

export function getFilteredTransactions(startDate, endDate) {
  return getUserTransactions().filter(t => {
    return t.date >= startDate && t.date <= endDate;
  });
}

// ── Fixed Expenses ──
export function getFixedExpenses() {
  const user = getCurrentUser();
  if (!user) return [];
  const all = getStore(STORAGE_KEYS.FIXED_EXPENSES) || [];
  return all.filter(f => f.userId === user.id);
}

export function addFixedExpense(expense) {
  const all = getStore(STORAGE_KEYS.FIXED_EXPENSES) || [];
  const user = getCurrentUser();
  const newExp = {
    ...expense,
    id: generateId(),
    userId: user.id,
    active: true,
    createdAt: new Date().toISOString(),
  };
  all.push(newExp);
  setStore(STORAGE_KEYS.FIXED_EXPENSES, all);
  return newExp;
}

export function updateFixedExpense(id, updates) {
  const all = getStore(STORAGE_KEYS.FIXED_EXPENSES) || [];
  const idx = all.findIndex(f => f.id === id);
  if (idx !== -1) {
    all[idx] = { ...all[idx], ...updates };
    setStore(STORAGE_KEYS.FIXED_EXPENSES, all);
  }
}

export function deleteFixedExpense(id) {
  let all = getStore(STORAGE_KEYS.FIXED_EXPENSES) || [];
  all = all.filter(f => f.id !== id);
  setStore(STORAGE_KEYS.FIXED_EXPENSES, all);
}

export function toggleFixedExpense(id) {
  const all = getStore(STORAGE_KEYS.FIXED_EXPENSES) || [];
  const idx = all.findIndex(f => f.id === id);
  if (idx !== -1) {
    all[idx].active = !all[idx].active;
    setStore(STORAGE_KEYS.FIXED_EXPENSES, all);
  }
}

// ── Auto-launch fixed expenses for current month ──
export function launchFixedExpensesForMonth() {
  const user = getCurrentUser();
  if (!user) return;
  
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const launchedKey = STORAGE_KEYS.FIXED_LAUNCHED + '_' + user.id;
  const launched = getStore(launchedKey) || [];

  if (launched.includes(monthKey)) return; // Already launched this month

  const fixedExpenses = getFixedExpenses().filter(f => f.active);

  fixedExpenses.forEach(exp => {
    const day = Math.min(exp.dueDay || 1, new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate());
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    addTransaction({
      description: exp.description,
      categoryId: exp.categoryId,
      amount: exp.amount,
      date: dateStr,
      type: 'expense',
      nature: 'fixed',
      fromFixed: true,
      fixedId: exp.id,
    });
  });

  launched.push(monthKey);
  setStore(launchedKey, launched);
}

// ── Seed defaults ──
export function seedDefaults() {
  // Ensure categories exist
  getCategories();
}

// ── Investments RF ──
const INV_RF_KEY = 'fp_inv_rf';

export function getInvestmentsRF() {
  const user = getCurrentUser();
  if (!user) return [];
  return (getStore(INV_RF_KEY) || []).filter(i => i.userId === user.id);
}

export function addInvestmentRF(inv) {
  const all = getStore(INV_RF_KEY) || [];
  const user = getCurrentUser();
  const newInv = { ...inv, id: generateId(), userId: user.id, createdAt: new Date().toISOString() };
  all.push(newInv);
  setStore(INV_RF_KEY, all);
  return newInv;
}

export function updateInvestmentRF(id, updates) {
  const all = getStore(INV_RF_KEY) || [];
  const idx = all.findIndex(i => i.id === id);
  if (idx !== -1) { all[idx] = { ...all[idx], ...updates }; setStore(INV_RF_KEY, all); }
}

export function deleteInvestmentRF(id) {
  setStore(INV_RF_KEY, (getStore(INV_RF_KEY) || []).filter(i => i.id !== id));
}

// ── Investments RV ──
const INV_RV_KEY = 'fp_inv_rv';

export function getInvestmentsRV() {
  const user = getCurrentUser();
  if (!user) return [];
  return (getStore(INV_RV_KEY) || []).filter(i => i.userId === user.id);
}

export function addInvestmentRV(inv) {
  const all = getStore(INV_RV_KEY) || [];
  const user = getCurrentUser();
  const value = (parseFloat(inv.quantity) || 0) * (parseFloat(inv.avgPrice) || 0);
  const newInv = { ...inv, id: generateId(), userId: user.id, value, createdAt: new Date().toISOString() };
  all.push(newInv);
  setStore(INV_RV_KEY, all);
  return newInv;
}

export function updateInvestmentRV(id, updates) {
  const all = getStore(INV_RV_KEY) || [];
  const idx = all.findIndex(i => i.id === id);
  if (idx !== -1) {
    const upd = { ...all[idx], ...updates };
    upd.value = (parseFloat(upd.quantity) || 0) * (parseFloat(upd.avgPrice) || 0);
    all[idx] = upd;
    setStore(INV_RV_KEY, all);
  }
}

export function deleteInvestmentRV(id) {
  setStore(INV_RV_KEY, (getStore(INV_RV_KEY) || []).filter(i => i.id !== id));
}

// ── Investment Redemptions (Resgates) ──
const INV_REDEMPTIONS_KEY = 'fp_inv_redemptions';

export function getRedemptions() {
  const user = getCurrentUser();
  if (!user) return [];
  return (getStore(INV_REDEMPTIONS_KEY) || []).filter(r => r.userId === user.id);
}

export function addRedemption(redemption) {
  const all = getStore(INV_REDEMPTIONS_KEY) || [];
  const user = getCurrentUser();
  const newR = { ...redemption, id: generateId(), userId: user.id, createdAt: new Date().toISOString() };
  all.push(newR);
  setStore(INV_REDEMPTIONS_KEY, all);
  return newR;
}

export function deleteRedemption(id) {
  setStore(INV_REDEMPTIONS_KEY, (getStore(INV_REDEMPTIONS_KEY) || []).filter(r => r.id !== id));
}

// ── Amortization Confirmations ──
const AMORT_CONFIRM_KEY = 'fp_amort_confirmations';

export function getAmortConfirmations() {
  const user = getCurrentUser();
  if (!user) return [];
  return (getStore(AMORT_CONFIRM_KEY) || []).filter(c => c.userId === user.id);
}

export function confirmAmortization(record) {
  const all = getStore(AMORT_CONFIRM_KEY) || [];
  const user = getCurrentUser();
  const newC = { ...record, id: generateId(), userId: user.id, confirmedAt: new Date().toISOString() };
  all.push(newC);
  setStore(AMORT_CONFIRM_KEY, all);
  return newC;
}

export function deleteAmortConfirmation(id) {
  setStore(AMORT_CONFIRM_KEY, (getStore(AMORT_CONFIRM_KEY) || []).filter(c => c.id !== id));
}

// ── Investment Funds ──
const INV_FUNDS_KEY = 'fp_inv_funds';

export function getInvestmentsFunds() {
  const user = getCurrentUser();
  if (!user) return [];
  return (getStore(INV_FUNDS_KEY) || []).filter(i => i.userId === user.id);
}

export function addInvestmentFund(fund) {
  const all  = getStore(INV_FUNDS_KEY) || [];
  const user = getCurrentUser();
  const newF = { ...fund, id: generateId(), userId: user.id, createdAt: new Date().toISOString() };
  all.push(newF);
  setStore(INV_FUNDS_KEY, all);
  return newF;
}

export function updateInvestmentFund(id, updates) {
  const all = getStore(INV_FUNDS_KEY) || [];
  const idx = all.findIndex(i => i.id === id);
  if (idx !== -1) { all[idx] = { ...all[idx], ...updates }; setStore(INV_FUNDS_KEY, all); }
}

export function deleteInvestmentFund(id) {
  setStore(INV_FUNDS_KEY, (getStore(INV_FUNDS_KEY) || []).filter(i => i.id !== id));
}

// ── Dividend Confirmations ──
const DIV_CONFIRM_KEY = 'fp_div_confirmations';

export function getDivConfirmations() {
  const user = getCurrentUser();
  if (!user) return [];
  return (getStore(DIV_CONFIRM_KEY) || []).filter(c => c.userId === user.id);
}

export function confirmDividend(record) {
  const all  = getStore(DIV_CONFIRM_KEY) || [];
  const user = getCurrentUser();
  const newC = { ...record, id: generateId(), userId: user.id, confirmedAt: new Date().toISOString() };
  all.push(newC);
  setStore(DIV_CONFIRM_KEY, all);
  return newC;
}

export function deleteDivConfirmation(id) {
  setStore(DIV_CONFIRM_KEY, (getStore(DIV_CONFIRM_KEY) || []).filter(c => c.id !== id));
}

// ── Selected Mode (FINANCIAL or INVESTMENTS) ──
export function setSelectedMode(mode) {
  const validModes = ['FINANCIAL', 'INVESTMENTS'];
  if (validModes.includes(mode)) {
    setStore(STORAGE_KEYS.SELECTED_MODE, mode);
  }
}

export function getSelectedMode() {
  return getStore(STORAGE_KEYS.SELECTED_MODE) || null;
}

export function clearSelectedMode() {
  localStorage.removeItem(STORAGE_KEYS.SELECTED_MODE);
}
