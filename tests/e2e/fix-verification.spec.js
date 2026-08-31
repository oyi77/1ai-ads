import { test, expect } from '@playwright/test';

const BASE = '';

async function loginAs(page, username = 'admin', password = 'admin123') {
  await page.goto(`${BASE}/login`);
  await page.waitForSelector('form');
  await page.fill('input[type="text"]', username);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/app', { timeout: 10000 });
}

test.describe('UI Fix Verification', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page);
  });

  test('Settings page renders', async ({ page }) => {
    await page.goto(`${BASE}/settings`);
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10000 });
  });

  test('Navigation to multiple pages works', async ({ page }) => {
    await page.goto(`${BASE}/campaigns`);
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10000 });

    await page.goto(`${BASE}/settings`);
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10000 });

    await page.goto(`${BASE}/automation`);
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10000 });
  });
});
