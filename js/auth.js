// ============================================
// FINANÇAS PRO — Authentication
// ============================================

import { generateId } from './utils.js';
import { getUsers, addUser, findUserByEmail, setCurrentUser, clearCurrentUser, getCurrentUser } from './storage.js';

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + '_fp_salt_2024');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function register(name, email, password) {
  // Check if user already exists
  const existing = findUserByEmail(email);
  if (existing) {
    throw new Error('Este e-mail já está cadastrado.');
  }

  const hashedPassword = await hashPassword(password);

  const user = {
    id: generateId(),
    name,
    email: email.toLowerCase(),
    password: hashedPassword,
    createdAt: new Date().toISOString(),
  };

  addUser(user);

  // Auto-login after register
  const session = { id: user.id, name: user.name, email: user.email };
  setCurrentUser(session);

  return session;
}

export async function login(email, password) {
  const user = findUserByEmail(email);
  if (!user) {
    throw new Error('E-mail ou senha incorretos.');
  }

  const hashedPassword = await hashPassword(password);
  if (user.password !== hashedPassword) {
    throw new Error('E-mail ou senha incorretos.');
  }

  const session = { id: user.id, name: user.name, email: user.email };
  setCurrentUser(session);

  return session;
}

export function logout() {
  clearCurrentUser();
}

export function isAuthenticated() {
  return getCurrentUser() !== null;
}

export function getSession() {
  return getCurrentUser();
}
