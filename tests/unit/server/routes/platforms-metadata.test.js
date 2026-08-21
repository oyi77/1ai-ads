import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// The platform metadata endpoint must be served at the SINGLE-prefix path
// /api/platforms — the frontend calls fetch('/api/platforms') (client/src/lib/platforms.ts).
// The group router is mounted at /api in server/app/routers.js, so the router-internal
// path MUST be '/platforms', NOT '/api/platforms'. A '/api/platforms' internal path would
// produce the broken double-prefix /api/api/platforms (404 → silent static fallback).
//
import { createPlatformsGroupRouter } from '../../../../server/routes/_platforms.js';

vi.mock('../../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
function createApp() {
  const app = express();
  // Mirror server/app/routers.js: group router mounted at /api.
  app.use('/api', createPlatformsGroupRouter({
    repos: { settingsRepo: {}, platformAccountsRepo: {} },
    services: {},
    publicRateLimit: (_req, _res, next) => next(),
  }));
  return app;
}

describe('Platforms metadata endpoint (single-prefix contract)', () => {
  it('serves GET /api/platforms with the full registry (frontend path)', async () => {
    const res = await request(createApp()).get('/api/platforms');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(10);
    const whatsapp = res.body.data.find((p) => p.key === 'whatsapp');
    expect(whatsapp).toBeDefined();
    expect(whatsapp.routePath).toBe('whatsapp-ads');
  });

  it('does NOT serve the metadata at the broken double-prefix /api/api/platforms', async () => {
    const res = await request(createApp()).get('/api/api/platforms');
    // Must be 404 (Express default), not 200 — guards against re-introducing the double-prefix.
    expect(res.status).toBe(404);
  });
});
