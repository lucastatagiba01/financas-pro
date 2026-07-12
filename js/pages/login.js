// ============================================
// FINANÇAS PRO — Login / Register Page
// ============================================

import { icons } from '../utils.js';
import { login, register } from '../auth.js';
import { navigate } from '../router.js';
import { showToast } from '../components/toast.js';

export function renderLogin() {
  const app = document.getElementById('app');

  app.innerHTML = `
    <div class="auth-page">
      <div class="auth-brand">
        <div class="auth-logo">M</div>
        <h1 class="auth-title">Money<span>Map</span></h1>
        <p class="auth-tagline">Controle financeiro inteligente e simples</p>
      </div>

      <div class="auth-card">
        <!-- Tab Switcher -->
        <div class="auth-tabs">
          <button class="auth-tab active" id="tab-login">Entrar</button>
          <button class="auth-tab" id="tab-register">Criar conta</button>
        </div>

        <!-- Login Form -->
        <form id="login-form" class="auth-form">
          <div class="form-group">
            <label class="form-label">E-mail</label>
            <div class="input-icon-wrapper">
              ${icons.mail}
              <input class="form-input input-with-icon" type="email" id="login-email"
                placeholder="seu@email.com" autocomplete="email" required />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Senha</label>
            <div class="input-icon-wrapper">
              ${icons.lock}
              <input class="form-input input-with-icon" type="password" id="login-password"
                placeholder="••••••••" autocomplete="current-password" required />
              <button type="button" class="input-icon-btn" id="toggle-login-pw">${icons.eye}</button>
            </div>
          </div>
          <button type="submit" class="btn btn-primary btn-full" id="btn-login">
            Entrar na conta
          </button>
          <p class="auth-demo-hint">
            💡 <strong>Demo:</strong> Crie uma conta nova para começar
          </p>
        </form>

        <!-- Register Form (hidden by default) -->
        <form id="register-form" class="auth-form hidden">
          <div class="form-group">
            <label class="form-label">Nome completo</label>
            <div class="input-icon-wrapper">
              ${icons.user}
              <input class="form-input input-with-icon" type="text" id="reg-name"
                placeholder="Seu nome" autocomplete="name" required />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">E-mail</label>
            <div class="input-icon-wrapper">
              ${icons.mail}
              <input class="form-input input-with-icon" type="email" id="reg-email"
                placeholder="seu@email.com" autocomplete="email" required />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Senha</label>
            <div class="input-icon-wrapper">
              ${icons.lock}
              <input class="form-input input-with-icon" type="password" id="reg-password"
                placeholder="••••••••" autocomplete="new-password" minlength="6" required />
              <button type="button" class="input-icon-btn" id="toggle-reg-pw">${icons.eye}</button>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Confirmar senha</label>
            <div class="input-icon-wrapper">
              ${icons.lock}
              <input class="form-input input-with-icon" type="password" id="reg-confirm"
                placeholder="••••••••" autocomplete="new-password" required />
            </div>
          </div>
          <button type="submit" class="btn btn-primary btn-full" id="btn-register">
            Criar conta grátis
          </button>
        </form>
      </div>

      <!-- Decorative Background Blobs -->
      <div class="auth-blob auth-blob-1"></div>
      <div class="auth-blob auth-blob-2"></div>
    </div>
  `;

  bindLoginEvents();
}

function bindLoginEvents() {
  // Tab switching
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');

  tabLogin.addEventListener('click', () => {
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
  });

  tabRegister.addEventListener('click', () => {
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    registerForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
  });

  // Password visibility toggle
  document.getElementById('toggle-login-pw')?.addEventListener('click', () => {
    togglePasswordVisibility('login-password', 'toggle-login-pw');
  });
  document.getElementById('toggle-reg-pw')?.addEventListener('click', () => {
    togglePasswordVisibility('reg-password', 'toggle-reg-pw');
  });

  // Login submit
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const btn = document.getElementById('btn-login');

    btn.disabled = true;
    btn.textContent = 'Entrando...';

    try {
      await login(email, password);
      showToast('Bem-vindo de volta!', 'success');
      navigate('/dashboard');
    } catch (err) {
      showToast(err.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Entrar na conta';
    }
  });

  // Register submit
  document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirm = document.getElementById('reg-confirm').value;
    const btn = document.getElementById('btn-register');

    if (password !== confirm) {
      showToast('As senhas não coincidem', 'error');
      return;
    }

    if (password.length < 6) {
      showToast('A senha deve ter ao menos 6 caracteres', 'error');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Criando conta...';

    try {
      await register(name, email, password);
      showToast('Conta criada com sucesso! 🎉', 'success');
      navigate('/dashboard');
    } catch (err) {
      showToast(err.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Criar conta grátis';
    }
  });
}

function togglePasswordVisibility(inputId, btnId) {
  const input = document.getElementById(inputId);
  const btn = document.getElementById(btnId);
  if (!input || !btn) return;

  if (input.type === 'password') {
    input.type = 'text';
    btn.innerHTML = icons.eyeOff;
  } else {
    input.type = 'password';
    btn.innerHTML = icons.eye;
  }
}
