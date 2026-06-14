# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: fix-verification.spec.js >> UI Fix Verification >> Settings forms are hidden by default and toggle correctly
- Location: tests/e2e/fix-verification.spec.js:72:3

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
  5   | async function loginAs(page, username = 'admin', password = 'admin123') {
> 6   |   await page.goto(`${BASE}/#/login`);
      |              ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3001/#/login
  7   |   await page.waitForSelector('#login-form');
  8   |   await page.fill('input[name="username"]', username);
  9   |   await page.fill('input[name="password"]', password);
  10  |   await page.click('button[type="submit"]');
  11  |   await page.waitForFunction(() => !window.location.hash.includes('login'), { timeout: 5000 });
  12  | }
  13  | 
  14  | test.describe('UI Fix Verification', () => {
  15  |   test.beforeEach(async ({ page }) => {
  16  |     await loginAs(page);
  17  |   });
  18  | 
  19  |   test('Campaign Wizard preserves targeting state during interest search', async ({ page }) => {
  20  |     await page.goto(`${BASE}/#/campaign/create`);
  21  |     
  22  |     // Step 1: Select Account
  23  |     await page.waitForSelector('#w-account');
  24  |     await page.selectOption('#w-account', { index: 1 });
  25  |     await page.click('#w-next');
  26  | 
  27  |     // Step 2: Objective
  28  |     await page.waitForSelector('input[name="objective"]');
  29  |     await page.click('#w-next');
  30  | 
  31  |     // Step 3: Product
  32  |     await page.waitForSelector('#w-product');
  33  |     await page.fill('#w-product', 'UI Test Product');
  34  |     await page.click('#w-next');
  35  | 
  36  |     // Step 4: Targeting (The fixed part)
  37  |     await page.waitForSelector('#w-age-min');
  38  |     await page.fill('#w-age-min', '31');
  39  |     await page.fill('#w-age-max', '44');
  40  |     
  41  |     // Search interest (this used to trigger a re-render that reset the values)
  42  |     await page.fill('#w-interest-search', 'Fashion');
  43  |     await page.click('#w-interest-btn');
  44  |     
  45  |     // Wait for "Searching..." to disappear or results to appear
  46  |     await page.waitForTimeout(1000); 
  47  |     
  48  |     // Verify values are preserved
  49  |     const ageMin = await page.inputValue('#w-age-min');
  50  |     const ageMax = await page.inputValue('#w-age-max');
  51  |     expect(ageMin).toBe('31');
  52  |     expect(ageMax).toBe('44');
  53  | 
  54  |     // Add interest and check again
  55  |     const addBtn = page.locator('[data-add-interest]').first();
  56  |     if (await addBtn.isVisible()) {
  57  |       await addBtn.click();
  58  |       await page.waitForSelector('#w-interest-selected span');
  59  |       
  60  |       const ageMinAfterAdd = await page.inputValue('#w-age-min');
  61  |       expect(ageMinAfterAdd).toBe('31');
  62  |     }
  63  | 
  64  |     // Go back and forward
  65  |     await page.click('#w-back'); // To Step 3
  66  |     await page.click('#w-next'); // To Step 4
  67  |     
  68  |     expect(await page.inputValue('#w-age-min')).toBe('31');
  69  |     expect(await page.inputValue('#w-age-max')).toBe('44');
  70  |   });
  71  | 
  72  |   test('Settings forms are hidden by default and toggle correctly', async ({ page }) => {
  73  |     await page.goto(`${BASE}/#/settings`);
  74  |     await page.waitForSelector('h1:has-text("Settings")');
  75  |     
  76  |     // Forms should be hidden initially
  77  |     const metaForm = page.locator('#meta-add-form');
  78  |     await expect(metaForm).toBeHidden();
  79  |     
  80  |     const googleForm = page.locator('#google-add-form');
  81  |     await expect(googleForm).toBeHidden();
  82  | 
  83  |     // Click Add for Meta
  84  |     await page.click('[data-add-account="meta"]');
  85  |     await expect(metaForm).toBeVisible();
  86  |     await expect(page.locator('[data-add-account="meta"]')).toBeHidden();
  87  | 
  88  |     // Click Cancel
  89  |     await page.click('[data-cancel-add="meta"]');
  90  |     await expect(metaForm).toBeHidden();
  91  |     await expect(page.locator('[data-add-account="meta"]')).toBeVisible();
  92  |   });
  93  | 
  94  |   test('Navigation cleanup verification', async ({ page }) => {
  95  |     await page.goto(`${BASE}/#/`);
  96  |     
  97  |     // Verify duplicate links are gone (only one link with text "Spy")
  98  |     const spyLinks = page.locator('nav a:has-text("Spy")');
  99  |     expect(await spyLinks.count()).toBe(1);
  100 | 
  101 |     // Verify stray header is gone
  102 |     const bodyHeaders = page.locator('body > h2:has-text("Settings")');
  103 |     await expect(bodyHeaders).toHaveCount(0);
  104 |   });
  105 | });
  106 | 
```