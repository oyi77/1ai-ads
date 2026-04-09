import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-secret-key-for-testing',
    },
    exclude: ['tests/e2e/**', 'node_modules/**'],
    server: {
      deps: {
        externals: ['better-sqlite3'],
      },
    },
  },
});
