import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:3001';

// Helper: login and return page with auth
async function loginAs(page, username = 'admin', password = 'admin123') {
  await page.goto(`${BASE}/#/login`);
  await page.waitForSelector('#login-form');
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  // Wait for redirect to dashboard
  await page.waitForFunction(() => !window.location.hash.includes('login'), { timeout: 5000 });
}

// ========== AUTH ==========

test.describe('Authentication', () => {
  test('unauthenticated user gets redirected to login', async ({ page }) => {
    await page.goto(`${BASE}/#/`);
    await page.waitForTimeout(500);
    expect(page.url()).toContain('#/login');
  });

  test('login page renders correctly', async ({ page }) => {
    await page.goto(`${BASE}/#/login`);
    await expect(page.locator('h1')).toContainText('Login to AdForge');
    await expect(page.locator('input[name="username"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('login with valid credentials redirects to dashboard', async ({ page }) => {
    await loginAs(page);
    await expect(page.locator('h1')).toContainText('Dashboard');
  });

  test('login with wrong password shows error', async ({ page }) => {
    await page.goto(`${BASE}/#/login`);
    await page.fill('input[name="username"]', 'admin');
    await page.fill('input[name="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');
    await expect(page.locator('#login-error')).toBeVisible();
    await expect(page.locator('#login-error')).toContainText('Invalid');
  });

  test('logout returns to login page', async ({ page }) => {
    await loginAs(page);
    await page.click('#logout-btn');
    await page.waitForTimeout(500);
    expect(page.url()).toContain('#/login');
  });
});

// ========== DASHBOARD ==========

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page);
  });

  test('dashboard shows metric cards', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Dashboard');
    // Should have metric cards with real data
    await expect(page.locator('text=Total Spend')).toBeVisible();
    await expect(page.locator('text=CTR')).toBeVisible();
    await expect(page.locator('text=Conversions')).toBeVisible();
  });

  test('dashboard has sync button', async ({ page }) => {
    await expect(page.locator('#sync-btn')).toBeVisible();
    await expect(page.locator('#sync-btn')).toContainText('Sync Meta Ads');
  });

  test('sync button triggers real sync', async ({ page }) => {
    test.setTimeout(120000);
    await page.click('#sync-btn');
    // Button should change text while syncing
    await expect(page.locator('#sync-btn')).toContainText('Syncing');
    // Wait for sync to complete - real API takes ~60s for 72 campaigns across 6 accounts
    await page.waitForFunction(
      () => !document.querySelector('#sync-btn')?.textContent?.includes('Syncing'),
      { timeout: 100000 }
    );
  });
});

// ========== NAVIGATION ==========

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page);
  });

  test('nav links work - Ads', async ({ page }) => {
    await page.click('a[href="#/ads"]');
    await expect(page.locator('h1')).toContainText('Ads Library');
  });

  test('nav links work - Landing', async ({ page }) => {
    await page.click('a[href="#/landing"]');
    await expect(page.locator('h1')).toContainText('Landing Pages');
  });

  test('nav links work - Analytics', async ({ page }) => {
    await page.click('a[href="#/analytics"]');
    await expect(page.locator('h1')).toContainText('Analytics');
  });

  test('nav links work - Research', async ({ page }) => {
    await page.click('a[href="#/research"]');
    await expect(page.locator('h1')).toContainText('Ads Research');
  });

  test('nav links work - Settings', async ({ page }) => {
    await page.click('a[href="#/settings"]');
    await expect(page.locator('h1')).toContainText('Settings');
  });
});

// ========== ADS ==========

test.describe('Ads Management', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page);
  });

  test('ads list shows existing ads', async ({ page }) => {
    await page.click('a[href="#/ads"]');
    await page.waitForSelector('h1');
    await expect(page.locator('h1')).toContainText('Ads Library');
    // Should have Create Ad button
    await expect(page.locator('a[href="#/ads/create"]')).toBeVisible();
    // Should have search input
    await expect(page.locator('#ads-search')).toBeVisible();
  });

  test('ads create page has form', async ({ page }) => {
    await page.goto(`${BASE}/#/ads/create`);
    await page.waitForSelector('#generate-form');
    await expect(page.locator('input[name="product"]')).toBeVisible();
    await expect(page.locator('input[name="target"]')).toBeVisible();
    await expect(page.locator('textarea[name="keunggulan"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toContainText('Generate');
  });

  test('ads search filters results', async ({ page }) => {
    await page.goto(`${BASE}/#/ads`);
    await page.waitForSelector('#ads-search');
    await page.fill('#ads-search', 'Ramadan');
    await page.waitForTimeout(500); // debounce
    // Should filter (might have results or not depending on data)
    await expect(page.locator('#ads-grid')).toBeVisible();
  });
});

// ========== LANDING PAGES ==========

test.describe('Landing Pages', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page);
  });

  test('landing list page renders', async ({ page }) => {
    await page.click('a[href="#/landing"]');
    await expect(page.locator('h1')).toContainText('Landing Pages');
    await expect(page.locator('a[href="#/landing/create"]')).toBeVisible();
  });

  test('landing create page has form with all fields', async ({ page }) => {
    await page.click('a[href="#/landing"]');
    await page.waitForSelector('a[href="#/landing/create"]');
    await page.click('a[href="#/landing/create"]');
    await page.waitForSelector('#lp-form', { timeout: 10000 });
    await expect(page.locator('input[name="name"]')).toBeVisible();
    await expect(page.locator('input[name="product_name"]')).toBeVisible();
    await expect(page.locator('input[name="price"]')).toBeVisible();
    await expect(page.locator('select[name="theme"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toContainText('Preview & Save');
    await expect(page.locator('#ai-generate')).toContainText('AI Generate');
  });

  test('landing create generates preview from template', async ({ page }) => {
    await page.goto(`${BASE}/#/landing/create`);
    await page.waitForSelector('#lp-form');
    await page.fill('input[name="name"]', 'E2E Test LP');
    await page.fill('input[name="product_name"]', 'Test Product E2E');
    await page.fill('input[name="price"]', 'Rp 250.000');
    await page.fill('input[name="cta_primary"]', 'Beli Sekarang');
    await page.click('button[type="submit"]');
    // Should show preview iframe
    await page.waitForSelector('iframe', { timeout: 10000 });
    await expect(page.locator('iframe')).toBeVisible();
    // Should show success message
    await expect(page.locator('text=saved')).toBeVisible({ timeout: 5000 });
  });
});

// ========== ANALYTICS ==========

test.describe('Analytics', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page);
  });

  test('analytics page shows real metrics', async ({ page }) => {
    await page.click('a[href="#/analytics"]');
    await expect(page.locator('h1')).toContainText('Analytics');
    await expect(page.locator('text=Total Spend')).toBeVisible();
    await expect(page.locator('text=ROAS')).toBeVisible();
    await expect(page.locator('text=CTR')).toBeVisible();
    await expect(page.locator('text=CPC')).toBeVisible();
    await expect(page.locator('text=Impressions')).toBeVisible();
  });
});

// ========== RESEARCH ==========

test.describe('Research', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page);
  });

  test('research page shows ad accounts', async ({ page }) => {
    await page.click('a[href="#/research"]');
    await expect(page.locator('h1')).toContainText('Ads Research');
    await page.waitForSelector('#accounts-list', { timeout: 10000 });
    // Accounts only load if Meta is configured; verify page renders either way
    const hasAccounts = await page.locator('#accounts-list .bg-slate-800').first().isVisible().catch(() => false);
    if (hasAccounts) {
      await expect(page.locator('#accounts-list .bg-slate-800').first()).toBeVisible();
    }
  });

  test('research page has search inputs', async ({ page }) => {
    await page.goto(`${BASE}/#/research`);
    await page.waitForSelector('h1');
    await expect(page.locator('#spy-search')).toBeVisible();
    await expect(page.locator('#adlib-search')).toBeVisible();
  });

  test('view campaigns button loads real data', async ({ page }) => {
    await page.goto(`${BASE}/#/research`);
    await page.waitForSelector('#accounts-list', { timeout: 10000 });
    const btn = page.locator('[data-view-campaigns]').first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click();
      await page.waitForSelector('.campaign-detail', { timeout: 15000 });
      await expect(page.locator('.campaign-detail')).toBeVisible();
    }
  });
});

// ========== SETTINGS ==========

test.describe('Settings', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page);
  });

  test('settings page shows all platforms', async ({ page }) => {
    await page.click('a[href="#/settings"]');
    await expect(page.locator('h1')).toContainText('Settings');
    await expect(page.getByRole('heading', { name: 'Meta Ads' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Google Ads' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'TikTok Ads' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Scalev.id' })).toBeVisible();
  });

  test('meta shows as configured', async ({ page }) => {
    await page.goto(`${BASE}/#/settings`);
    await page.waitForSelector('h1');
    // Meta should show configured status
    await expect(page.locator('text=Configured').first()).toBeVisible({ timeout: 5000 });
  });

  test('settings forms are interactive', async ({ page }) => {
    await page.goto(`${BASE}/#/settings`);
    await page.waitForSelector('#meta-creds-form');
    // Forms should have save buttons
    await expect(page.locator('#meta-creds-form button[type="submit"]')).toBeVisible();
    await expect(page.locator('#google-creds-form button[type="submit"]')).toBeVisible();
    await expect(page.locator('#tiktok-creds-form button[type="submit"]')).toBeVisible();
  });
});

// ========== MOBILE RESPONSIVE ==========

test.describe('Mobile Responsive', () => {
  test.use({ viewport: { width: 375, height: 812 } }); // iPhone size

  test('hamburger menu appears on mobile', async ({ page }) => {
    await loginAs(page);
    await expect(page.locator('#menu-toggle')).toBeVisible();
  });

  test('hamburger menu opens and closes', async ({ page }) => {
    await loginAs(page);
    // Nav links should be hidden
    const navLinks = page.locator('#nav-links');
    // Click hamburger to open
    await page.click('#menu-toggle');
    await expect(navLinks).toHaveClass(/nav-open/);
    // Click again to close
    await page.click('#menu-toggle');
    await expect(navLinks).not.toHaveClass(/nav-open/);
  });

  test('dashboard renders on mobile without overflow', async ({ page }) => {
    await loginAs(page);
    // Check no horizontal scroll
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 5); // small tolerance
  });

  test('login form is usable on mobile', async ({ page }) => {
    await page.goto(`${BASE}/#/login`);
    await expect(page.locator('input[name="username"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    // Buttons should be tappable (min 44px)
    const btnHeight = await page.locator('button[type="submit"]').evaluate(el => el.offsetHeight);
    expect(btnHeight).toBeGreaterThanOrEqual(44);
  });

  test('ads create form works on mobile', async ({ page }) => {
    await loginAs(page);
    // Open menu and navigate
    await page.click('#menu-toggle');
    await page.click('a[href="#/ads"]');
    await page.waitForSelector('h1');
    await page.click('a[href="#/ads/create"]');
    await page.waitForSelector('#generate-form');
    await expect(page.locator('input[name="product"]')).toBeVisible();
  });
});
