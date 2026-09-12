import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import Database from 'better-sqlite3';
import { createRepositories } from '../../../server/app/repositories.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

/** Every .js file under server/, excluding node_modules. */
function serverFiles(dir = join(ROOT, 'server'), acc = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) serverFiles(full, acc);
    else if (entry.endsWith('.js')) acc.push(full);
  }
  return acc;
}

/**
 * Wiring gate.
 *
 * `repos` is assembled once in createRepositories() and consumed by name
 * throughout routes/ and services/. Deleting a registration while consumers
 * remain is silent at boot: the router receives `undefined`, and the failure
 * only surfaces as a 500 when a user hits that endpoint — which is how
 * /api/boost, /api/adsets, /api/invoices and /api/audiences/saved all shipped
 * broken after commit a45a1a3 dropped six registrations at once.
 *
 * This test walks the real source and asserts every consumed name resolves.
 */
describe('repositories registry wiring', () => {
  it('registers every repos.<name> consumed anywhere under server/', () => {
    const repos = createRepositories(new Database(':memory:'));
    const registered = new Set(Object.keys(repos));

    // Names assigned onto the object after createRepositories() returns
    // (app.js attaches auditRepo before mounting the audit middleware).
    for (const m of readFileSync(join(ROOT, 'server/app.js'), 'utf8').matchAll(/\brepos\.([A-Za-z_$][\w$]*)\s*=/g)) {
      registered.add(m[1]);
    }

    const consumed = new Map();
    for (const file of serverFiles()) {
      for (const m of readFileSync(file, 'utf8').matchAll(/\brepos\.([A-Za-z_$][\w$]*)/g)) {
        if (!consumed.has(m[1])) consumed.set(m[1], new Set());
        consumed.get(m[1]).add(relative(ROOT, file));
      }
    }

    expect(consumed.size, 'no repos.<name> usage found — the scan is broken').toBeGreaterThan(10);

    const unresolved = [...consumed.entries()]
      .filter(([name]) => !registered.has(name))
      .map(([name, files]) => `${name} (used in ${[...files].sort().join(', ')})`);

    expect(unresolved, 'repos.<name> consumed but never registered').toEqual([]);
  });
});
