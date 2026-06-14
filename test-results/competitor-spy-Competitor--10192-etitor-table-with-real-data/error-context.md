# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: competitor-spy.spec.js >> Competitor Spy page >> renders competitor table with real data
- Location: tests/e2e/competitor-spy.spec.js:22:3

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3001/#/login
Call log:
  - navigating to "http://localhost:3001/#/login", waiting until "load"

```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | const BASE = 'http://localhost:3001';
  4  | 
  5  | // Helper to login (reuse from full-app.spec.js)
  6  | async function loginAs(page, username = 'admin', password = 'admin123') {
> 7  |   await page.goto(`${BASE}/#/login`);
     |              ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3001/#/login
  8  |   await page.waitForSelector('#login-form');
  9  |   await page.fill('input[name="username"]', username);
  10 |   await page.fill('input[name="password"]', password);
  11 |   await page.click('button[type="submit"]');
  12 |   // wait for navigation away from login hash
  13 |   await page.waitForFunction(() => !window.location.hash.includes('login'), { timeout: 5000 });
  14 | }
  15 | 
  16 | test.describe('Competitor Spy page', () => {
  17 |   test.beforeEach(async ({ page }) => {
  18 |     await loginAs(page);
  19 |   });
  20 | 
  21 |   test.setTimeout(60000);
  22 |   test('renders competitor table with real data', async ({ page }) => {
  23 |     await page.waitForSelector('a:has-text("Spy")');
  24 |     await page.click('a:has-text("Spy")');
  25 | 
  26 |     await page.waitForSelector('h1:has-text("Competitor Spy Dashboard")');
  27 |     await expect(page.locator('h1')).toContainText('Competitor Spy Dashboard');
  28 |     // Table or empty state should be present
  29 |     const hasTable = await page.locator('table').isVisible().catch(() => false);
  30 |     const hasEmptyState = await page.locator('text=No competitor data available').isVisible().catch(() => false);
  31 |     if (hasTable) {
  32 |       // Verify column headers exist
  33 |       await expect(page.getByRole('columnheader', { name: 'Name' })).toBeVisible();
  34 |       await expect(page.getByRole('columnheader', { name: 'Website' })).toBeVisible();
  35 |     } else if (hasEmptyState) {
  36 |       // No seeded data - empty state is acceptable
  37 |       await expect(page.locator('text=No competitor data available')).toBeVisible();
  38 |     }
  39 |   });
  40 | });
  41 | 
```