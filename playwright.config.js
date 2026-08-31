import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:5174',
    screenshot: 'only-on-failure',
  },
  // Boot a dev-seeded instance (NODE_ENV=development seeds admin/admin123)
  // so the login flows in the specs have a known-good user. Runs on 5174 to
  // avoid colliding with the production container on 5000.
  webServer: {
    command: 'NODE_ENV=development PORT=5174 DB_PATH=/tmp/e2e-test.db ADMIN_PASSWORD=admin123 node server.js',
    url: 'http://localhost:5174/health',
    timeout: 60000,
    reuseExistingServer: false,
  },
});
