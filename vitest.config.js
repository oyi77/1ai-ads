import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    // Bcrypt cost-12 (seedDemoData: 2 hashes; each auth register/login:
    // 1 hash/verify) makes full-app boots slow. Under full-suite CPU
    // contention the 5s test / 10s hook defaults flake across many files
    // (2026-09-14: disabled-user-auth, extended-api, app, route-integration,
    // sanitizer-scope, boot). 30s budgets kill the class; per-file pins kept
    // as documentation.
    testTimeout: 30000,
    hookTimeout: 30000,
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
