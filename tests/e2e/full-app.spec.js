import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:5173';

// Helper: login via React SPA (path-based routing, localStorage tokens)
async function loginAs(page, username = 'admin', password = 'admin123') {
  await page.goto(`${BASE}/login`);
  await page.waitForSelector('form');
  await page.fill('input[type="text"]', username);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/app', { timeout: 10000 });
}

// ========== AUTH ==========

test.describe('Authentication', () => {
  test('unauthenticated user is redirected to login', async ({ page }) => {
    await page.goto(`${BASE}/app`);
    await page.waitForURL('**/login', { timeout: 5000 });
    await expect(page.locator('text=AdForge')).toBeVisible();
  });

  test('login page renders correctly', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await expect(page.locator('text=AdForge')).toBeVisible();
    await expect(page.locator('input[type="text"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('login with valid credentials redirects to dashboard', async ({ page }) => {
    await loginAs(page);
    await expect(page.url()).toContain('/app');
  });

  test('login with wrong password shows error', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.fill('input[type="text"]', 'admin');
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');
    await expect(page.locator('text=Invalid').or(page.locator('text=error')).or(page.locator('text=failed'))).toBeVisible({ timeout: 10000 });
  });
});

// ========== DASHBOARD ==========

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page);
  });

  test('dashboard loads after login', async ({ page }) => {
    await expect(page.url()).toContain('/app');
    // Should have some content rendered
    await expect(page.locator('body')).not.toBeEmpty();
  });
});

// ========== NAVIGATION ==========

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page);
  });

  test('nav links work - Campaigns', async ({ page }) => {
    await page.goto(`${BASE}/campaigns`);
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10000 });
  });

  test('nav links work - Settings', async ({ page }) => {
    await page.goto(`${BASE}/settings`);
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10000 });
  });

  test('nav links work - Automation', async ({ page }) => {
    await page.goto(`${BASE}/automation`);
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10000 });
  });
});

// ========== API AUTH ==========

test.describe('API Authentication', () => {
  test('unauthenticated API request returns 401', async ({ request }) => {
    const response = await request.get(`${BASE.replace('5173', '5000')}/api/campaigns`);
    expect(response.status()).toBe(401);
  });

  test('login API returns tokens', async ({ request }) => {
    const response = await request.post(`${BASE.replace('5173', '5000')}/api/auth/login`, {
      data: { username: 'admin', password: 'admin123' },
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.accessToken).toBeTruthy();
  });
});
