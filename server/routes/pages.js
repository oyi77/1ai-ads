import { Router } from 'express';

/**
 * Page routes — serve EJS templates for the server-rendered dashboard.
 * These must be registered BEFORE the SPA fallback in app.js.
 */
export function createPagesRouter({ authMiddleware }) {
  const router = Router();

  // Helper: render a page within the base layout
  function renderPage(res, page, data = {}) {
    res.render(`pages/${page}`, {
      layout: 'layouts/base',
      username: data.username || '',
      activePage: data.activePage || '',
      pageTitle: data.pageTitle || 'Dashboard',
      breadcrumb: data.breadcrumb || 'Overview',
      title: data.title || data.pageTitle || 'Dashboard',
      ...data,
    });
  }

  // ─── Auth pages (no auth required) ───
  router.get('/login', (req, res) => {
    res.render('pages/login');
  });

  router.get('/register', (req, res) => {
    res.render('pages/login'); // Same form, register mode
  });

  // ─── Dashboard pages (auth required via cookie) ───
  // For now, serve pages without strict auth — the API layer enforces auth.
  // TODO: add cookie-based session check

  router.get('/app', (req, res) => {
    renderPage(res, 'dashboard', {
      activePage: 'dashboard',
      pageTitle: 'Command Center',
      breadcrumb: 'Overview',
    });
  });

  router.get('/campaigns', (req, res) => {
    renderPage(res, 'campaigns', {
      activePage: 'campaigns',
      pageTitle: 'Campaigns',
      breadcrumb: 'Campaigns',
    });
  });

  router.get('/automation', (req, res) => {
    renderPage(res, 'automation', {
      activePage: 'automation',
      pageTitle: 'Automation Rules',
      breadcrumb: 'Automation',
    });
  });

  router.get('/settings', (req, res) => {
    renderPage(res, 'settings', {
      activePage: 'settings',
      pageTitle: 'Settings',
      breadcrumb: 'Account > Settings',
    });
  });

  router.get('/creative/library', (req, res) => {
    renderPage(res, 'creative-library', {
      activePage: 'creative-library',
      pageTitle: 'Creative Library',
      breadcrumb: 'Creative > Library',
    });
  });

  router.get('/creative/fatigue', (req, res) => {
    renderPage(res, 'creative-fatigue', {
      activePage: 'creative-fatigue',
      pageTitle: 'Creative Fatigue',
      breadcrumb: 'Creative > Fatigue',
    });
  });

  router.get('/creative/scoring', (req, res) => {
    renderPage(res, 'creative-scoring', {
      activePage: 'creative-scoring',
      pageTitle: 'Creative Scoring',
      breadcrumb: 'Creative > Scoring',
    });
  });

  router.get('/testing/ab-tests', (req, res) => {
    renderPage(res, 'ab-tests', {
      activePage: 'ab-tests',
      pageTitle: 'A/B Tests',
      breadcrumb: 'Testing > A/B Tests',
    });
  });

  router.get('/reporting/unified', (req, res) => {
    renderPage(res, 'unified-reporting', {
      activePage: 'unified-reporting',
      pageTitle: 'Unified Reporting',
      breadcrumb: 'Reporting > Unified',
    });
  });

  router.get('/reporting/widgets', (req, res) => {
    renderPage(res, 'dashboard-widgets', {
      activePage: 'dashboard-widgets',
      pageTitle: 'Dashboard Builder',
      breadcrumb: 'Reporting > Widgets',
    });
  });

  // ─── Auth endpoints (for browser login) ───
  router.post('/auth/login', async (req, res) => {
    try {
      const { username, password } = req.body;
      // Delegate to the existing auth route's login logic
      const authRes = await fetch(`http://localhost:${process.env.PORT || 5000}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await authRes.json();
      if (data.success && data.token) {
        res.cookie('token', data.token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
      }
      res.json(data);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/auth/logout', (req, res) => {
    res.clearCookie('token');
    res.redirect('/login');
  });

  return router;
}
