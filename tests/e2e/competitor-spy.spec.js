import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:3001';

// Helper to login (reuse from full-app.spec.js)
async function loginAs(page, username = 'admin', password = 'admin123') {
  await page.goto(`${BASE}/#/login`);
  await page.waitForSelector('#login-form');
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  // wait for navigation away from login hash
  await page.waitForFunction(() => !window.location.hash.includes('login'), { timeout: 5000 });
}

test.describe('Competitor Spy page', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page);
  });

  test.setTimeout(60000);
  test('renders competitor table with real data', async ({ page }) => {
    await page.waitForSelector('a:has-text("Competitor Spy")');
    await page.click('a:has-text("Competitor Spy")');

    await page.waitForSelector('h1:has-text("Competitor Spy Dashboard")');
    await expect(page.locator('h1')).toContainText('Competitor Spy Dashboard');
    // Table should be present and have at least one row
    const rows = page.locator('table tbody tr');
    await expect(await rows.count()).toBeGreaterThan(0);
    // Verify column headers exist
    await expect(page.getByRole('columnheader', { name: 'Name' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Website' })).toBeVisible();
  });
});
