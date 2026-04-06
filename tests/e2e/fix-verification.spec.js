import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:3001';

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

  test('Campaign Wizard preserves targeting state during interest search', async ({ page }) => {
    await page.goto(`${BASE}/#/campaign/create`);
    
    // Step 1: Select Account
    await page.waitForSelector('#w-account');
    await page.selectOption('#w-account', { index: 1 });
    await page.click('#w-next');

    // Step 2: Objective
    await page.waitForSelector('input[name="objective"]');
    await page.click('#w-next');

    // Step 3: Product
    await page.waitForSelector('#w-product');
    await page.fill('#w-product', 'UI Test Product');
    await page.click('#w-next');

    // Step 4: Targeting (The fixed part)
    await page.waitForSelector('#w-age-min');
    await page.fill('#w-age-min', '31');
    await page.fill('#w-age-max', '44');
    
    // Search interest (this used to trigger a re-render that reset the values)
    await page.fill('#w-interest-search', 'Fashion');
    await page.click('#w-interest-btn');
    
    // Wait for "Searching..." to disappear or results to appear
    await page.waitForTimeout(1000); 
    
    // Verify values are preserved
    const ageMin = await page.inputValue('#w-age-min');
    const ageMax = await page.inputValue('#w-age-max');
    expect(ageMin).toBe('31');
    expect(ageMax).toBe('44');

    // Add interest and check again
    const addBtn = page.locator('[data-add-interest]').first();
    if (await addBtn.isVisible()) {
      await addBtn.click();
      await page.waitForSelector('#w-interest-selected span');
      
      const ageMinAfterAdd = await page.inputValue('#w-age-min');
      expect(ageMinAfterAdd).toBe('31');
    }

    // Go back and forward
    await page.click('#w-back'); // To Step 3
    await page.click('#w-next'); // To Step 4
    
    expect(await page.inputValue('#w-age-min')).toBe('31');
    expect(await page.inputValue('#w-age-max')).toBe('44');
  });

  test('Settings forms are hidden by default and toggle correctly', async ({ page }) => {
    await page.goto(`${BASE}/#/settings`);
    await page.waitForSelector('h1:has-text("Settings")');
    
    // Forms should be hidden initially
    const metaForm = page.locator('#meta-add-form');
    await expect(metaForm).toBeHidden();
    
    const googleForm = page.locator('#google-add-form');
    await expect(googleForm).toBeHidden();

    // Click Add for Meta
    await page.click('[data-add-account="meta"]');
    await expect(metaForm).toBeVisible();
    await expect(page.locator('[data-add-account="meta"]')).toBeHidden();

    // Click Cancel
    await page.click('[data-cancel-add="meta"]');
    await expect(metaForm).toBeHidden();
    await expect(page.locator('[data-add-account="meta"]')).toBeVisible();
  });

  test('Navigation cleanup verification', async ({ page }) => {
    await page.goto(`${BASE}/#/`);
    
    // Verify duplicate links are gone (only one link with text "Spy")
    const spyLinks = page.locator('nav a:has-text("Spy")');
    expect(await spyLinks.count()).toBe(1);

    // Verify stray header is gone
    const bodyHeaders = page.locator('body > h2:has-text("Settings")');
    await expect(bodyHeaders).toHaveCount(0);
  });
});
