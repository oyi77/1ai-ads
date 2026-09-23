import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import { createAutomationRulesRouter } from '../../../server/routes/automation-rules.js';

function appWith() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: 'u1' }; next(); });
  app.use('/api/automation/rules', createAutomationRulesRouter({}));
  return app;
}

describe('web rules sunset — fitur mati diarahkan ke bot', () => {
  it('GET list -> kosong + pesan sunset', async () => {
    const { default: request } = await import('supertest');
    const res = await request(appWith()).get('/api/automation/rules');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.sunset).toContain('/monitor');
  });

  it('POST/PUT/DELETE -> 410 Gone', async () => {
    const { default: request } = await import('supertest');
    const app = appWith();
    expect((await request(app).post('/api/automation/rules').send({ name: 'x' })).status).toBe(410);
    expect((await request(app).put('/api/automation/rules/1').send({})).status).toBe(410);
    expect((await request(app).delete('/api/automation/rules/1')).status).toBe(410);
  });
});
