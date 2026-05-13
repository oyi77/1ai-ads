import { Router } from './lib/router.js';
import { api } from './lib/api.js';
import { renderDashboard } from './views/dashboard.js';
import { renderAdsList } from './views/ads-list.js';
import { renderAdsCreate } from './views/ads-create.js';
import { renderLandingList } from './views/landing-list.js';
import { renderLandingCreate } from './views/landing-create.js';
import { renderAnalytics } from './views/analytics.js';
import { renderCreatorDashboard } from './views/creator-dashboard.js';
import { renderSettings } from './views/settings.js';
import { renderResearch } from './views/research.js';
import { renderCampaignsList } from './views/campaigns-list.js';
import { renderOptimizer } from './views/optimizer.js';
import { renderTrending } from './views/trending.js';
import { renderCompetitorSpy } from './views/competitor-spy.js';
import { renderGlobalAds } from './views/global-ads.js';
import { renderAiSuggestions } from './views/ai-suggestions.js';
import { renderDocs } from './views/docs.js';
import { renderPrivacyPolicy, renderTermsService, renderGDPR } from './views/legal.js';

const router = new Router(document.getElementById('app'));

// Frictionless onboarding - dashboard for everyone!
router.on('/', renderDashboard);
router.on('/creator', renderCreatorDashboard);
router.on('/docs', renderDocs);
router.on('/privacy', renderPrivacyPolicy);
router.on('/terms', renderTermsService);
router.on('/gdpr', renderGDPR);
router.on('/ads', renderAdsList);
router.on('/ads/create', renderAdsCreate);
router.on('/landing', renderLandingList);
router.on('/landing/create', renderLandingCreate);
router.on('/analytics', renderAnalytics);
router.on('/settings', renderSettings);
router.on('/campaigns', renderCampaignsList);
router.on('/research', renderResearch);
router.on('/optimizer', renderOptimizer);
router.on('/trending', renderTrending);
router.on('/competitor-spy', renderCompetitorSpy);
router.on('/global-ads', renderGlobalAds);
router.on('/ai-suggestions', renderAiSuggestions);

// Nav visibility - ALL links visible without auth
function updateNav() {
  const navLinks = document.getElementById('nav-links');
  const logoutBtn = document.getElementById('logout-btn');
  const loginLink = document.getElementById('login-link');
  
  if (navLinks) {
    // Show all links - no auth required for anything
    const allSelectors = [
      'a[href="#/"]',
      'a[href="#/campaigns"]',
      'a[href="#/ads"]',
      'a[href="#/landing"]',
      'a[href="#/analytics"]',
      'a[href="#/optimizer"]',
      'a[href="#/trending"]',
      'a[href="#/competitor-spy"]',
      'a[href="#/global-ads"]',
      'a[href="#/ai-suggestions"]',
      'a[href="#/research"]',
      'a[href="#/creator"]',
      'a[href="#/settings"]'
    ];
    allSelectors.forEach(sel => {
      const el = navLinks.querySelector(sel);
      if (el) el.classList.remove('hidden');
    });
  }

  // Show login only when not authenticated, logout only when authenticated
  if (loginLink) {
    loginLink.classList.toggle('hidden', api.isAuthenticated());
  }
  if (logoutBtn) {
    logoutBtn.classList.toggle('hidden', !api.isAuthenticated());
    const username = localStorage.getItem('1ai-ads_user');
    logoutBtn.textContent = api.isAuthenticated() && username ? `Logout (${username})` : 'Logout';
  }
}

// Logout handler
document.getElementById('logout-btn')?.addEventListener('click', () => {
  api.logout();
  updateNav();
  window.location.hash = '#/';
});

// Hamburger menu toggle
document.getElementById('menu-toggle')?.addEventListener('click', () => {
  document.getElementById('nav-links')?.classList.toggle('nav-open');
});

// Update nav on auth changes
window.addEventListener('auth-change', updateNav);
window.addEventListener('hashchange', updateNav);

// Export router for other modules to use
export { router };

updateNav();
router.start();
