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
import { renderResearch } from './views/research.js';
import { renderCampaignWizard } from './views/campaign-wizard.js';
import { renderCampaignsList } from './views/campaigns-list.js';
import { renderOptimizer } from './views/optimizer.js';
import { renderTrending } from './views/trending.js';
import { renderCompetitorSpy } from './views/competitor-spy.js';
import { renderGlobalAds } from './views/global-ads.js';
import { renderAiSuggestions } from './views/ai-suggestions.js';
import { renderMarketingLP } from './views/marketing-lp.js';
import { renderDocs } from './views/docs.js';
import { renderPrivacyPolicy, renderTermsService, renderGDPR } from './views/legal.js';

const router = new Router(document.getElementById('app'));

router.on('/', (el) => {
  if (api.isAuthenticated()) {
    renderDashboard(el);
  } else {
    renderMarketingLP(el);
  }
});
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
router.on('/campaign/create', renderCampaignWizard);
router.on('/optimizer', renderOptimizer);
router.on('/trending', renderTrending);
router.on('/competitor-spy', renderCompetitorSpy);
router.on('/global-ads', renderGlobalAds);
router.on('/ai-suggestions', renderAiSuggestions);
router.on('/login', renderLogin);
router.on('/register', renderRegister);

// Nav visibility based on auth
function updateNav() {
  const navLinks = document.getElementById('nav-links');
  const logoutBtn = document.getElementById('logout-btn');
  const isAuth = api.isAuthenticated();

  if (navLinks) {
    const authOnlySelectors = [
      'a[href="#/"]',              // Dashboard (shows marketing LP for unauth)
      'a[href="#/campaigns"]',         // Campaigns
      'a[href="#/ads"]',              // Creatives
      'a[href="#/landing"]',           // Landing Pages
      'a[href="#/analytics"]',          // Analytics
      'a[href="#/optimizer"]',          // Auto Optimizer
      'a[href="#/trending"]',           // Trending
      'a[href="#/competitor-spy"]',   // Competitor Spy
      'a[href="#/global-ads"]',        // Global Ads
      'a[href="#/ai-suggestions"]',    // AI Suggestions
      'a[href="#/research"]',            // Research
      'a[href="#/campaign/create"]',    // Create Campaign
      'a[href="#/settings"]'            // Settings
    ];

    authOnlySelectors.forEach(sel => {
      const el = navLinks.querySelector(sel);
      if (el) el.classList.toggle('hidden', !isAuth);
    });
  }

  if (logoutBtn) {
    logoutBtn.classList.toggle('hidden', !isAuth);
    const username = localStorage.getItem('adforge_user');
    logoutBtn.textContent = isAuth && username ? `Logout (${username})` : (isAuth ? 'Logout' : '');
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
