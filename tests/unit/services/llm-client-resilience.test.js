import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LLMClient, normalizeModels, isTransientLlmStatus } from '../../../server/services/llm-client.js';

vi.mock('../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }),
}));

describe('normalizeModels', () => {
  it('splits a comma-separated string', () => {
    expect(normalizeModels('a,b,c')).toEqual(['a', 'b', 'c']);
  });
  it('trims, drops blanks and dedupes', () => {
    expect(normalizeModels([' a ', '', 'a', 'b'])).toEqual(['a', 'b']);
  });
  it('falls back to [auto] when empty', () => {
    expect(normalizeModels('')).toEqual(['auto']);
    expect(normalizeModels(undefined)).toEqual(['auto']);
  });
});

describe('isTransientLlmStatus', () => {
  it('flags 408/429/5xx as transient', () => {
    expect(isTransientLlmStatus(408)).toBe(true);
    expect(isTransientLlmStatus(429)).toBe(true);
    expect(isTransientLlmStatus(500)).toBe(true);
    expect(isTransientLlmStatus(503)).toBe(true);
  });
  it('does not flag 4xx client errors (except 408/429)', () => {
    expect(isTransientLlmStatus(400)).toBe(false);
    expect(isTransientLlmStatus(401)).toBe(false);
    expect(isTransientLlmStatus(404)).toBe(false);
  });
});

function okResponse(content = 'ok') {
  return { ok: true, json: () => Promise.resolve({ choices: [{ message: { content } }] }) };
}
function errResponse(status, body = 'boom') {
  return { ok: false, status, text: () => Promise.resolve(body) };
}

describe('LLMClient — failover + retry', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fails over to the next model on a transient error', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(errResponse(503))
      .mockResolvedValueOnce(okResponse('from-second'));
    global.fetch = fetchMock;
    const c = new LLMClient({ url: 'http://host', models: ['m1', 'm2'], retries: 1, retryBaseMs: 1 });
    expect(await c.call('s', 'u')).toBe('from-second');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // second call uses the failover model
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).model).toBe('m2');
  });

  it('does NOT fail over on a non-transient 400 (bad request)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errResponse(400, 'bad'));
    global.fetch = fetchMock;
    const c = new LLMClient({ url: 'http://host', models: ['m1', 'm2'], retries: 2, retryBaseMs: 1 });
    await expect(c.call('s', 'u')).rejects.toThrow('LLM API Error (400)');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails over on a 404 (model retired) without retrying the same model', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(errResponse(404, 'model gone'))
      .mockResolvedValueOnce(okResponse('next-model'));
    global.fetch = fetchMock;
    const c = new LLMClient({ url: 'http://host', models: ['gone', 'alive'], retries: 2, retryBaseMs: 1 });
    expect(await c.call('s', 'u')).toBe('next-model');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries the same model up to `retries` on transient errors', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(errResponse(429))
      .mockResolvedValueOnce(okResponse('recovered'));
    global.fetch = fetchMock;
    const c = new LLMClient({ url: 'http://host', models: ['m1'], retries: 2, retryBaseMs: 1 });
    expect(await c.call('s', 'u')).toBe('recovered');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting every model', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errResponse(503));
    global.fetch = fetchMock;
    const c = new LLMClient({ url: 'http://host', models: ['m1', 'm2'], retries: 1, retryBaseMs: 1 });
    await expect(c.call('s', 'u')).rejects.toThrow('LLM API Error (503)');
    expect(fetchMock).toHaveBeenCalledTimes(2); // one attempt per model
  });

  it('treats a network failure as transient', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValueOnce(okResponse('after-net'));
    global.fetch = fetchMock;
    const c = new LLMClient({ url: 'http://host', models: ['m1'], retries: 2, retryBaseMs: 1 });
    expect(await c.call('s', 'u')).toBe('after-net');
  });

  it('parses a multi-model OMNIROUTE_MODEL string via updateConfig', () => {
    const c = new LLMClient({ url: 'http://host', model: 'a' });
    c.updateConfig({ model: 'x,y,z' });
    expect(c.models).toEqual(['x', 'y', 'z']);
  });
});

describe('LLMClient — fetchModels cache', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('caches the catalogue and refetches with force', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: () => Promise.resolve({ data: [{ id: 'a' }] }),
    });
    global.fetch = fetchMock;
    const c = new LLMClient({ url: 'http://host', model: 'm', apiKey: 'k' });
    await c.fetchModels();
    await c.fetchModels(); // served from cache
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await c.fetchModels({ force: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('LLMClient — aiHealth', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('reports ok:true with latency + model count on success', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(okResponse('ok')) // chat probe
      .mockResolvedValueOnce({                 // models probe
        ok: true,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ data: [{ id: 'a' }, { id: 'b' }] }),
      });
    global.fetch = fetchMock;
    const c = new LLMClient({ url: 'http://host', models: ['m1', 'm2'], apiKey: 'k' });
    const h = await c.aiHealth();
    expect(h.ok).toBe(true);
    expect(h.model).toBe('m1');
    expect(h.failover).toEqual(['m2']);
    expect(h.modelsCount).toBe(2);
    expect(typeof h.latencyMs).toBe('number');
  });

  it('maps 402 to insufficient_credits and never throws', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(errResponse(402, 'insufficient'))
      .mockResolvedValueOnce({ ok: true, headers: { get: () => 'application/json' }, json: () => Promise.resolve({ data: [] }) });
    const c = new LLMClient({ url: 'http://host', model: 'm', apiKey: 'k' });
    const h = await c.aiHealth();
    expect(h.ok).toBe(false);
    expect(h.error).toBe('insufficient_credits');
  });

  it('maps 401 to auth_failed', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(errResponse(401, 'nope'))
      .mockResolvedValueOnce({ ok: true, headers: { get: () => 'application/json' }, json: () => Promise.resolve({ data: [] }) });
    const c = new LLMClient({ url: 'http://host', model: 'm', apiKey: 'k' });
    expect((await c.aiHealth()).error).toBe('auth_failed');
  });

  it('maps a network failure without throwing', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const c = new LLMClient({ url: 'http://host', model: 'm', apiKey: 'k' });
    const h = await c.aiHealth();
    expect(h.ok).toBe(false);
    expect(['network_error', 'timeout']).toContain(h.error);
  });
});
