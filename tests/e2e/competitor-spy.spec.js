import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:5000';

async function loginAs(page, username = 'admin', password = 'admin123') {
  await page.goto(`${BASE}/login`);
  await page.waitForSelector('form');
  await page.fill('input[type="text"]', username);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/app', { timeout: 10000 });
}

test.describe('Competitor Spy page', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page);
  });

  test.setTimeout(60000);

  test('competitors page renders', async ({ page }) => {
    await page.goto(`${BASE}/competitors`);
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10000 });
  });
});
