import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-secret-key-for-testing',
      // Scrub inherited host env that would otherwise poison the suite:
      // ADMIN_PASSWORD changes the seeded admin hash (auth tests 401), and
      // OMNIROUTE_URL redirects the LLM client to the remote host.
      ADMIN_PASSWORD: '',
      OMNIROUTE_URL: '',
      DATABASE_URL: '',
    },
    exclude: ['tests/e2e/**', 'node_modules/**', '_archived/**', 'client/**'],
    server: {
      deps: {
        externals: ['better-sqlite3'],
      },
    },
  },
});
