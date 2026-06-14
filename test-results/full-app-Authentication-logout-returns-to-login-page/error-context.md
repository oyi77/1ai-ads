# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: full-app.spec.js >> Authentication >> logout returns to login page
- Location: tests/e2e/full-app.spec.js:49:3

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3001/#/login
Call log:
  - navigating to "http://localhost:3001/#/login", waiting until "load"

```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | 
  3   | const BASE = 'http://localhost:3001';
  4   | 
  5   | // Helper: login and return page with auth
  6   | async function loginAs(page, username = 'admin', password = 'admin123') {
> 7   |   await page.goto(`${BASE}/#/login`);
      |              ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3001/#/login
  8   |   await page.waitForSelector('#login-form');
  9   |   await page.fill('input[name="username"]', username);
  10  |   await page.fill('input[name="password"]', password);
  11  |   await page.click('button[type="submit"]');
  12  |   // Wait for redirect to dashboard
  13  |   await page.waitForFunction(() => !window.location.hash.includes('login'), { timeout: 5000 });
  14  | }
  15  | 
  16  | // ========== AUTH ==========
  17  | 
  18  | test.describe('Authentication', () => {
  19  | test('unauthenticated user sees marketing landing page', async ({ page }) => {
  20  |   await page.goto(`${BASE}/#/`);
  21  |   await page.waitForTimeout(500);
  22  |   // Wait for the marketing page h1 to appear and verify it contains '1ai-ads'
  23  |   await page.waitForSelector('h1');
  24  |   await expect(page.locator('h1')).toContainText('1ai-ads');
  25  | });
  26  | 
  27  |   test('login page renders correctly', async ({ page }) => {
  28  |     await page.goto(`${BASE}/#/login`);
  29  |     await expect(page.locator('h1')).toContainText('Login to 1ai-ads');
  30  |     await expect(page.locator('input[name="username"]')).toBeVisible();
  31  |     await expect(page.locator('input[name="password"]')).toBeVisible();
  32  |     await expect(page.locator('button[type="submit"]')).toBeVisible();
  33  |   });
  34  | 
  35  |   test('login with valid credentials redirects to dashboard', async ({ page }) => {
  36  |     await loginAs(page);
  37  |     await expect(page.locator('h1')).toContainText('Dashboard');
  38  |   });
  39  | 
  40  |   test('login with wrong password shows error', async ({ page }) => {
  41  |     await page.goto(`${BASE}/#/login`);
  42  |     await page.fill('input[name="username"]', 'admin');
  43  |     await page.fill('input[name="password"]', 'wrongpassword');
  44  |     await page.click('button[type="submit"]');
  45  |     await expect(page.locator('#login-error')).toBeVisible();
  46  |     await expect(page.locator('#login-error')).toContainText('Invalid');
  47  |   });
  48  | 
  49  |   test('logout returns to login page', async ({ page }) => {
  50  |     await loginAs(page);
  51  |     await page.click('#logout-btn');
  52  |     await page.waitForTimeout(500);
  53  |     expect(page.url()).toContain('#/login');
  54  |   });
  55  | });
  56  | 
  57  | // ========== DASHBOARD ==========
  58  | 
  59  | test.describe('Dashboard', () => {
  60  |   test.beforeEach(async ({ page }) => {
  61  |     await loginAs(page);
  62  |   });
  63  | 
  64  |   test('dashboard shows metric cards', async ({ page }) => {
  65  |     await expect(page.locator('h1')).toContainText('Dashboard');
  66  |     // Should have metric cards with real data
  67  |     await expect(page.locator('text=Total Spend')).toBeVisible();
  68  |     await expect(page.locator('text=CTR').first()).toBeVisible();
  69  |     await expect(page.locator('text=Conversions')).toBeVisible();
  70  |   });
  71  | 
  72  |   test('dashboard has sync button', async ({ page }) => {
  73  |     await expect(page.locator('#sync-btn')).toBeVisible();
  74  |     await expect(page.locator('#sync-btn')).toContainText('Sync Meta Ads');
  75  |   });
  76  | 
  77  |   test('sync button triggers real sync', async ({ page }) => {
  78  |     test.setTimeout(120000);
  79  |     await page.click('#sync-btn');
  80  |     // Button should change text while syncing
  81  |     await expect(page.locator('#sync-btn')).toContainText('Syncing');
  82  |     // Wait for sync to complete - real API takes ~60s for 72 campaigns across 6 accounts
  83  |     await page.waitForFunction(
  84  |       () => !document.querySelector('#sync-btn')?.textContent?.includes('Syncing'),
  85  |       { timeout: 100000 }
  86  |     );
  87  |   });
  88  | });
  89  | 
  90  | // ========== NAVIGATION ==========
  91  | 
  92  | test.describe('Navigation', () => {
  93  |   test.beforeEach(async ({ page }) => {
  94  |     await loginAs(page);
  95  |   });
  96  | 
  97  |   test('nav links work - Ads', async ({ page }) => {
  98  |     await page.click('a[href="#/ads"]');
  99  |     await expect(page.locator('h1')).toContainText('AI Creatives');
  100 |   });
  101 | 
  102 |   test('nav links work - Landing', async ({ page }) => {
  103 |     await page.click('a[href="#/landing"]');
  104 |     await expect(page.locator('h1')).toContainText('Landing Pages');
  105 |   });
  106 | 
  107 |   test('nav links work - Analytics', async ({ page }) => {
```