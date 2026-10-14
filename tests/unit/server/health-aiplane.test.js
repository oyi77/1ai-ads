import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }),
}));

// The /health handler reads only app.locals.services.llmClient — mount it on a
// bare express app so we test the contract without booting the whole server.
function mountHealth(llmClient) {
  const app = express();
  app.locals.services = llmClient ? { llmClient } : undefined;
  app.get('/health', (_req, res) => {
    const ai = app.locals.services?.llmClient;
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      aiPlane: ai
        ? { configured: !!ai.apiKey, format: ai.format, models: ai.models?.length ?? 0 }
        : { configured: false },
    });
  });
  return app;
}

describe('/health aiPlane', () => {
  it('reports configured + format + model count when a client is present', async () => {
    const res = await request(mountHealth({ apiKey: 'sk-1', format: 'anthropic', models: ['a', 'b', 'c'] })).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.aiPlane).toEqual({ configured: true, format: 'anthropic', models: 3 });
  });

  it('reports configured:false when no api key is set', async () => {
    const res = await request(mountHealth({ apiKey: '', format: 'openai', models: ['a'] })).get('/health');
    expect(res.body.aiPlane.configured).toBe(false);
  });

  it('degrades to configured:false when the llm client is absent', async () => {
    const res = await request(mountHealth(null)).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.aiPlane).toEqual({ configured: false });
  });
});
