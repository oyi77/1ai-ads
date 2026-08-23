import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');

const appSrc = readFileSync(resolve(root, 'client/src/App.tsx'), 'utf8');
const shellSrc = readFileSync(resolve(root, 'client/src/components/layout/shell.tsx'), 'utf8');

// All <Route path="..."> literals registered in App.tsx.
const routePaths = new Set(
  [...appSrc.matchAll(/path=["']([^"']+)["']/g)].map((m) => m[1]),
);

// All sidebar navItem `to="..."` literals in the layout shell.
const navTos = [...shellSrc.matchAll(/to:\s*["']([^"']+)["']/g)].map((m) => m[1]);

describe('sidebar nav has no dead links', () => {
  it('extracts nav items from the shell', () => {
    expect(navTos.length).toBeGreaterThan(0);
  });

  for (const to of navTos) {
    it(`route registered for sidebar link ${to}`, () => {
      expect(
        routePaths.has(to),
        `Sidebar link "${to}" has no matching <Route path> in client/src/App.tsx`,
      ).toBe(true);
    });
  }

  it('Draft Approvals (/drafts) route is registered', () => {
    expect(routePaths.has('/drafts')).toBe(true);
  });

  it('Platforms (/platforms) route is registered', () => {
    expect(routePaths.has('/platforms')).toBe(true);
  });
});
