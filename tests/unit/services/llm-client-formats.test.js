import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LLMClient, deriveEndpoints } from '../../../server/services/llm-client.js';

describe('deriveEndpoints', () => {
  it('keeps a full OpenAI endpoint verbatim and infers openai', () => {
    const r = deriveEndpoints('http://host/v1/chat/completions');
    expect(r.chatUrl).toBe('http://host/v1/chat/completions');
    expect(r.modelsUrl).toBe('http://host/v1/models');
    expect(r.format).toBe('openai');
  });

  it('keeps a full Anthropic endpoint verbatim and infers anthropic', () => {
    const r = deriveEndpoints('http://host/v1/messages');
    expect(r.chatUrl).toBe('http://host/v1/messages');
    expect(r.modelsUrl).toBe('http://host/v1/models');
    expect(r.format).toBe('anthropic');
  });

  it('appends the OpenAI path to a /v1 base', () => {
    const r = deriveEndpoints('http://host/v1', 'openai');
    expect(r.chatUrl).toBe('http://host/v1/chat/completions');
    expect(r.modelsUrl).toBe('http://host/v1/models');
  });

  it('appends the Anthropic path to a /v1 base', () => {
    const r = deriveEndpoints('http://host/v1', 'anthropic');
    expect(r.chatUrl).toBe('http://host/v1/messages');
    expect(r.modelsUrl).toBe('http://host/v1/models');
  });

  it('appends /v1 + path to a bare host', () => {
    const r = deriveEndpoints('http://host', 'openai');
    expect(r.chatUrl).toBe('http://host/v1/chat/completions');
  });

  it('does not double-append /v1', () => {
    const r = deriveEndpoints('http://host/v1/', 'anthropic');
    expect(r.chatUrl).toBe('http://host/v1/messages');
  });
});

describe('LLMClient — anthropic format', () => {
  let fetchMock;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });

  it('buildPayload puts system at top level and omits a system message', () => {
    const c = new LLMClient({ url: 'http://host', model: 'm', format: 'anthropic' });
    const p = c.buildPayload('sys', 'usr', { max_tokens: 12 });
    expect(p.system).toBe('sys');
    expect(p.messages).toEqual([{ role: 'user', content: 'usr' }]);
    expect(p.max_tokens).toBe(12);
    expect(p.stream).toBe(false);
  });

  it('buildPayload maps options.maxTokens → max_tokens', () => {
    const c = new LLMClient({ url: 'http://host', model: 'm', format: 'anthropic' });
    expect(c.buildPayload('s', 'u', { maxTokens: 25 }).max_tokens).toBe(25);
  });

  it('sends x-api-key + anthropic-version and hits /v1/messages', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: [{ type: 'text', text: 'pong' }] }),
    });
    const c = new LLMClient({ url: 'http://host', model: 'm', apiKey: 'k', format: 'anthropic' });
    const out = await c.call('sys', 'usr');
    expect(out).toBe('pong');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://host/v1/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-api-key': 'k',
          'anthropic-version': '2023-06-01',
        }),
      })
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.system).toBe('sys');
    expect(body.messages).toEqual([{ role: 'user', content: 'usr' }]);
  });

  it('extractContent concatenates text blocks and ignores thinking blocks', () => {
    const c = new LLMClient({ url: 'http://host', model: 'm', format: 'anthropic' });
    const data = {
      content: [
        { type: 'thinking', thinking: 'hmm' },
        { type: 'text', text: 'Hello ' },
        { type: 'text', text: 'world' },
      ],
    };
    expect(c.extractContent(data)).toBe('Hello world');
  });

  it('extractContent returns null for empty anthropic content', () => {
    const c = new LLMClient({ url: 'http://host', model: 'm', format: 'anthropic' });
    expect(c.extractContent({ content: [] })).toBeNull();
    expect(c.extractContent({ content: [{ type: 'thinking', thinking: 'x' }] })).toBeNull();
  });

  it('infers anthropic from a /v1/messages URL', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: [{ type: 'text', text: 'y' }] }),
    });
    const c = new LLMClient({ url: 'http://host/v1/messages', model: 'm', apiKey: 'k' });
    expect(c.format).toBe('anthropic');
    await c.call('s', 'u');
    expect(fetchMock).toHaveBeenCalledWith('http://host/v1/messages', expect.any(Object));
  });

  it('fetchModels reads the Anthropic-derived models URL', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: () => Promise.resolve({ data: [{ id: 'claude-x' }] }),
    });
    const c = new LLMClient({ url: 'http://host', model: 'm', apiKey: 'k', format: 'anthropic' });
    const models = await c.fetchModels();
    expect(models).toEqual([{ id: 'claude-x' }]);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://host/v1/models',
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-api-key': 'k' }),
      })
    );
  });

  it('flips format via updateConfig and derives the new endpoint', () => {
    const c = new LLMClient({ url: 'http://host', model: 'm', format: 'openai' });
    expect(c.url).toBe('http://host');
    expect(deriveEndpoints(c.url, c.format).chatUrl).toBe('http://host/v1/chat/completions');
    c.updateConfig({ format: 'anthropic' });
    expect(c.format).toBe('anthropic');
    expect(deriveEndpoints(c.url, c.format).chatUrl).toBe('http://host/v1/messages');
  });

  it('accepts baseUrl as an alternative to url', () => {
    const c = new LLMClient({ baseUrl: 'http://host/v1', model: 'm', format: 'anthropic' });
    expect(c.url).toBe('http://host/v1');
    expect(deriveEndpoints(c.url, c.format).chatUrl).toBe('http://host/v1/messages');
  });
});
