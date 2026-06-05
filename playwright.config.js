import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:5000',
    screenshot: 'only-on-failure',
  },
  // Don't start a server - test against the running PM2 instance
});
