import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Fail-fast guard for the "unwired repo" defect class: a route file reads
 * `services.someRepo` but nobody ever constructs that key in createServices
 * — the route then 500s at runtime ("Cannot read properties of undefined").
 *
 * This test statically extracts every services.X reference from the route
 * layer and asserts createServices() actually exposes each key.
 */
describe('service wiring — fail fast on unwired route dependencies', () => {
  it('every services.* key referenced by routers exists on createServices() output', async () => {
    const routesDir = path.resolve(__dirname, '../../../../server/routes');
    // Every route file — not just the _-prefixed groups — plus the central
    // router list. Scanning only `_*.js` left team.js and app/routers.js
    // invisible, which is how `services.mailer` shipped referenced by
    // routers.js while never being registered in createServices().
    const files = fs.readdirSync(routesDir)
      .filter(f => f.endsWith('.js'))
      .map(f => path.join(routesDir, f))
      .concat([path.resolve(__dirname, '../../../../server/app/routers.js')]);

    const referenced = new Set();
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      for (const m of src.matchAll(/services\.([A-Za-z_$][\w$]*)/g)) {
        referenced.add(m[1]);
      }
    }
    expect(referenced.size).toBeGreaterThan(10); // sanity: extraction worked

    // Build the real service graph against an in-memory DB (same as boot).
    const { createDatabase } = await import('../../../../db/index.js');
    const { createRepositories } = await import('../../../../server/app/repositories.js');
    const { seedDemoData } = await import('../../../../db/seed.js');
    const db = createDatabase(':memory:');
    seedDemoData(db);
    const repos = createRepositories(db);
    const { createServices } = await import('../../../../server/app/services.js');
    const services = createServices({ db, repos, params: {} });

    // Optional dependencies injected through createApp(params) rather than
    // constructed in createServices, so they are legitimately absent from the
    // default graph. Every consumer must guard for absence — see the
    // requireMcpClient middleware in routes/mcp.js.
    const PARAM_INJECTED = new Set(['mcpClient']);

    const missing = [...referenced]
      .filter(k => !PARAM_INJECTED.has(k))
      .filter(k => !(k in services) || services[k] === undefined);
    expect(missing, `unwired service keys consumed by routes/_*.js: ${missing.join(', ')}`).toEqual([]);
  }, 120000);
});
