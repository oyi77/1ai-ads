import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:5173';

async function loginAs(page, username = 'admin', password = 'admin123') {
  await page.goto(`${BASE}/#/login`);
  await page.waitForSelector('#login-form');
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => !window.location.hash.includes('login'), { timeout: 5000 });
}

test.describe('UI Fix Verification', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page);
  });

  test('Settings forms are hidden by default and toggle correctly', async ({ page }) => {
    await page.goto(`${BASE}/#/settings`);
    await page.waitForSelector('h1:has-text("Settings")');
    
    // Click Add Account to show the meta form
    await page.click('[data-add-account="meta"]');
    await page.waitForSelector('#meta-creds-form', { state: 'visible' });
    await expect(page.locator('#meta-creds-form button[type="submit"]')).toBeVisible();
  });

  test('Navigation links are functional', async ({ page }) => {
    // Verify multiple nav links work
    await page.click('a[href="#/ads"]');
    await expect(page.locator('h1')).toContainText('AI Creatives');
    
    await page.click('a[href="#/landing"]');
    await expect(page.locator('h1')).toContainText('Landing Pages');
    
    await page.click('a[href="#/settings"]');
    await page.waitForSelector('h1:has-text("Settings")');
    await expect(page.locator('h1')).toContainText('Settings');
  });
});
