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
    const files = fs.readdirSync(routesDir).filter(f => f.startsWith('_') && f.endsWith('.js'));

    const referenced = new Set();
    for (const f of files) {
      const src = fs.readFileSync(path.join(routesDir, f), 'utf8');
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

    const missing = [...referenced].filter(k => !(k in services) || services[k] === undefined);
    expect(missing, `unwired service keys consumed by routes/_*.js: ${missing.join(', ')}`).toEqual([]);
  }, 120000);
});
