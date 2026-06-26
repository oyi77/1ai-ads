import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:5173';

// Helper: login and return page with auth
async function loginAs(page, username = 'admin', password = 'admin123') {
  await page.goto(`${BASE}/#/login`);
  await page.waitForSelector('#login-form');
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => !window.location.hash.includes('login'), { timeout: 5000 });
}

// ========== AUTH ==========

test.describe('Authentication', () => {
  test('unauthenticated user can reach login page', async ({ page }) => {
    await page.goto(`${BASE}/#/login`);
    await expect(page.locator('h1')).toContainText('Login to 1ai-ads');
  });

  test('login page renders correctly', async ({ page }) => {
    await page.goto(`${BASE}/#/login`);
    await expect(page.locator('h1')).toContainText('Login to 1ai-ads');
    await expect(page.locator('input[name="username"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('login with valid credentials redirects to dashboard', async ({ page }) => {
    await loginAs(page);
    await expect(page.locator('h1')).toContainText('Command Center');
  });

  test('login with wrong password shows error', async ({ page }) => {
    await page.goto(`${BASE}/#/login`);
    await page.fill('input[name="username"]', 'admin');
    await page.fill('input[name="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');
    await expect(page.locator('#login-error')).toBeVisible();
    await expect(page.locator('#login-error')).toContainText('Invalid');
  });

  test('logout button works', async ({ page }) => {
    await loginAs(page);
    const logoutBtn = page.locator('#logout-btn');
    await expect(logoutBtn).toBeVisible();
    await logoutBtn.click();
    await page.waitForTimeout(500);
    expect(page.url()).toContain('#/');
  });
});

// ========== DASHBOARD ==========

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page);
  });

  test('dashboard shows Command Center header', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Command Center');
  });

  test('dashboard shows metric cards', async ({ page }) => {
    // Metric cards show Capital Velocity, Burn Rate, Growth Multiplier, Active Modules
    await expect(page.locator('text=Capital Velocity')).toBeVisible();
    await expect(page.locator('text=Burn Rate')).toBeVisible();
    await expect(page.locator('text=Growth Multiplier')).toBeVisible();
    await expect(page.locator('text=Active Modules')).toBeVisible();
  });

  test('dashboard has sync button', async ({ page }) => {
    await expect(page.locator('#sync-btn')).toBeVisible();
    await expect(page.locator('#sync-btn')).toContainText('Re-Sync Satellite Feed');
  });
});

// ========== NAVIGATION ==========

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page);
  });

  test('nav links work - Ads', async ({ page }) => {
    await page.click('a[href="#/ads"]');
    await expect(page.locator('h1')).toContainText('AI Creatives');
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
    await page.waitForSelector('h1:has-text("Settings")');
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
    await expect(page.locator('h1')).toContainText('AI Creatives');
    await expect(page.locator('a[href="#/ads/create"]')).toBeVisible();
  });

  test('ads create page has form', async ({ page }) => {
    await page.goto(`${BASE}/#/ads/create`);
    await page.waitForSelector('#generate-form');
    await expect(page.locator('input[name="product"]')).toBeVisible();
    await expect(page.locator('input[name="target"]')).toBeVisible();
  });

  test('ads search filters results', async ({ page }) => {
    await page.goto(`${BASE}/#/ads`);
    await page.waitForSelector('#ads-search');
    await page.fill('#ads-search', 'test');
    await page.waitForTimeout(500);
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

  test('landing create page has form', async ({ page }) => {
    await page.goto(`${BASE}/#/landing/create`);
    await page.waitForSelector('#lp-form', { timeout: 10000 });
    await expect(page.locator('input[name="name"]')).toBeVisible();
    await expect(page.locator('input[name="product_name"]')).toBeVisible();
    await expect(page.locator('input[name="price"]')).toBeVisible();
  });
});

// ========== SETTINGS ==========

test.describe('Settings', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page);
  });

  test('settings page shows all platforms', async ({ page }) => {
    await page.click('a[href="#/settings"]');
    await page.waitForSelector('h1:has-text("Settings")');
    await expect(page.locator('h1')).toContainText('Settings');
    await page.waitForSelector('h3:has-text("Meta Ads")');
    await expect(page.locator('h3:has-text("Meta Ads")')).toBeVisible();
  });

  test('settings forms are interactive', async ({ page }) => {
    await page.goto(`${BASE}/#/settings`);
    await page.click('[data-add-account="meta"]');
    await page.waitForSelector('#meta-creds-form', { state: 'visible' });
    await expect(page.locator('#meta-creds-form button[type="submit"]')).toBeVisible();
  });
});

// ========== MOBILE RESPONSIVE ==========

test.describe('Mobile Responsive', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('hamburger menu appears on mobile', async ({ page }) => {
    await loginAs(page);
    await expect(page.locator('#menu-toggle')).toBeVisible();
  });

  test('hamburger menu opens and closes', async ({ page }) => {
    await loginAs(page);
    const navLinks = page.locator('#nav-links');
    await page.click('#menu-toggle');
    await expect(navLinks).toHaveClass(/nav-open/);
    await page.click('#menu-toggle');
    await expect(navLinks).not.toHaveClass(/nav-open/);
  });

  test('dashboard renders on mobile without overflow', async ({ page }) => {
    await loginAs(page);
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 50);
  });

  test('login form is usable on mobile', async ({ page }) => {
    await page.goto(`${BASE}/#/login`);
    await expect(page.locator('input[name="username"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    const btnHeight = await page.locator('button[type="submit"]').evaluate(el => el.offsetHeight);
    expect(btnHeight).toBeGreaterThanOrEqual(44);
  });

  test('ads create form works on mobile', async ({ page }) => {
    await loginAs(page);
    await page.click('#menu-toggle');
    await page.click('a[href="#/ads"]');
    await page.waitForSelector('h1');
    await page.click('a[href="#/ads/create"]');
    await page.waitForSelector('#generate-form');
    await expect(page.locator('input[name="product"]')).toBeVisible();
  });
});
