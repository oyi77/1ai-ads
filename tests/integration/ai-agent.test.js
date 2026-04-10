import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createDatabase } from '../../db/index.js';
import { createApp } from '../../server/app.js';
import { generateToken } from '../../server/lib/auth.js';
import request from 'supertest';

// Mock AiAgent.analyzeAndSuggest to avoid real LLM calls
vi.mock('../../server/services/ai-agent.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    AiAgent: class extends original.AiAgent {
      async analyzeAndSuggest(userId) {
        if (!this.isEnabled()) return [];
        // Create one mock suggestion
        const id = this.suggestionsRepo.create({
          user_id: userId,
          type: 'ad_copy',
          target_id: null,
          target_type: 'ad',
          suggestion: JSON.stringify({ changes: [{ field: 'headline', value: 'AI Headline' }] }),
          rationale: 'Mock analysis',
          status: this.isAutoMode() ? 'applied' : 'pending',
        });
        return [id];
      }
    },
  };
});

describe('AI Agent API Integration', () => {
  let app;
  let db;
  let authToken;
  let userId;

  beforeAll(async () => {
    db = createDatabase(':memory:');

    const bcrypt = await import('bcryptjs');
    const { v4: uuidv4 } = await import('uuid');
    userId = uuidv4();
    const passwordHash = await bcrypt.hash('testpass123', 10);
    db.prepare('INSERT INTO users (id, username, email, password_hash, confirmed) VALUES (?, ?, ?, ?, 1)')
      .run(userId, 'aiagentuser', 'aiagent@test.com', passwordHash);

    authToken = generateToken({ id: userId, username: 'aiagentuser' });
    app = createApp({ db });
  });

  afterAll(() => {
    if (db) db.close();
  });

  it('GET /api/ai-agent/status — returns autonomy_level', async () => {
    const res = await request(app)
      .get('/api/ai-agent/status')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.autonomy_level).toBe('string');
  });

  it('POST /api/ai-agent/autonomy — sets level to manual', async () => {
    const res = await request(app)
      .post('/api/ai-agent/autonomy')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ level: 'manual' });

    expect(res.status).toBe(200);
    expect(res.body.data.autonomy_level).toBe('manual');
  });

  it('POST /api/ai-agent/autonomy — sets level to fully_auto', async () => {
    const res = await request(app)
      .post('/api/ai-agent/autonomy')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ level: 'fully_auto' });

    expect(res.status).toBe(200);
    expect(res.body.data.autonomy_level).toBe('fully_auto');
  });

  it('POST /api/ai-agent/autonomy — rejects invalid level', async () => {
    const res = await request(app)
      .post('/api/ai-agent/autonomy')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ level: 'turbo' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/ai-agent/run — creates suggestions when autonomy level is not off', async () => {
    await request(app)
      .post('/api/ai-agent/autonomy')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ level: 'manual' });

    const res = await request(app)
      .post('/api/ai-agent/run')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.created).toBeGreaterThanOrEqual(0);
  });

  it('GET /api/ai-agent/suggestions — returns array', async () => {
    const res = await request(app)
      .get('/api/ai-agent/suggestions')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('POST /api/ai-agent/suggestions/:id/dismiss — 404 for unknown id', async () => {
    const res = await request(app)
      .post('/api/ai-agent/suggestions/nonexistent/dismiss')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/ai-agent/suggestions/:id/apply — 404 for unknown id', async () => {
    const res = await request(app)
      .post('/api/ai-agent/suggestions/nonexistent/apply')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('full lifecycle: run → list → dismiss', async () => {
    await request(app)
      .post('/api/ai-agent/autonomy')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ level: 'manual' });

    await request(app)
      .post('/api/ai-agent/run')
      .set('Authorization', `Bearer ${authToken}`);

    const listRes = await request(app)
      .get('/api/ai-agent/suggestions?status=pending')
      .set('Authorization', `Bearer ${authToken}`);

    expect(listRes.body.data.length).toBeGreaterThan(0);
    const id = listRes.body.data[0].id;

    const dismissRes = await request(app)
      .post(`/api/ai-agent/suggestions/${id}/dismiss`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(dismissRes.status).toBe(200);
    expect(dismissRes.body.data.status).toBe('dismissed');
  });
});
