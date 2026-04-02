import { Router } from './lib/router.js';
import { api } from './lib/api.js';
import { renderDashboard } from './views/dashboard.js';
import { renderAdsList } from './views/ads-list.js';
import { renderAdsCreate } from './views/ads-create.js';
import { renderLandingList } from './views/landing-list.js';
import { renderLandingCreate } from './views/landing-create.js';
import { renderAnalytics } from './views/analytics.js';
import { renderLogin, renderRegister } from './views/login.js';
import { renderSettings } from './views/settings.js';

const router = new Router(document.getElementById('app'));

router.on('/', renderDashboard);
router.on('/ads', renderAdsList);
router.on('/ads/create', renderAdsCreate);
router.on('/landing', renderLandingList);
router.on('/landing/create', renderLandingCreate);
router.on('/analytics', renderAnalytics);
router.on('/settings', renderSettings);
router.on('/login', renderLogin);
router.on('/register', renderRegister);

// Nav visibility based on auth
function updateNav() {
  const navLinks = document.getElementById('nav-links');
  const logoutBtn = document.getElementById('logout-btn');
  const isAuth = api.isAuthenticated();

  if (navLinks) navLinks.classList.toggle('hidden-when-unauth', !isAuth);
  if (logoutBtn) {
    logoutBtn.classList.toggle('hidden', !isAuth);
    logoutBtn.textContent = isAuth ? `Logout (${localStorage.getItem('adforge_user') || ''})` : '';
  }
}

// Logout handler
document.getElementById('logout-btn')?.addEventListener('click', () => {
  api.logout();
  updateNav();
  window.location.hash = '#/login';
});

// Hamburger menu toggle
document.getElementById('menu-toggle')?.addEventListener('click', () => {
  document.getElementById('nav-links')?.classList.toggle('nav-open');
});

// Update nav on auth changes
window.addEventListener('auth-change', updateNav);
window.addEventListener('hashchange', updateNav);

updateNav();
router.start();
