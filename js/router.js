// ============================================
// FINANÇAS PRO — SPA Router
// ============================================

const routes = {};
let currentRoute = null;
let beforeEachGuard = null;

export function registerRoute(path, handler) {
  routes[path] = handler;
}

export function setBeforeEach(guard) {
  beforeEachGuard = guard;
}

export function navigate(path) {
  window.location.hash = '#' + path;
}

export function getCurrentRoute() {
  return currentRoute;
}

function resolveRoute() {
  const hash = window.location.hash.slice(1) || '/login';
  const path = hash.split('?')[0];

  // Run guard
  if (beforeEachGuard) {
    const redirect = beforeEachGuard(path);
    if (redirect && redirect !== path) {
      navigate(redirect);
      return;
    }
  }

  currentRoute = path;

  const handler = routes[path];
  if (handler) {
    handler();
  } else {
    // 404 — redirect to dashboard
    navigate('/dashboard');
  }
}

export function initRouter() {
  window.addEventListener('hashchange', resolveRoute);
  // Initial route
  resolveRoute();
}
