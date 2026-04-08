import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LLMClient } from '../../../server/services/llm-client.js';

describe('LLMClient', () => {
  let client;

  beforeEach(() => {
    client = new LLMClient({
      url: 'http://localhost:99999/v1/chat/completions',
      model: 'test-model',
      timeout: 5000,
    });
  });

  it('stores configuration', () => {
    expect(client.url).toBe('http://localhost:99999/v1/chat/completions');
    expect(client.model).toBe('test-model');
    expect(client.timeout).toBe(5000);
  });

  it('uses defaults when no config provided', () => {
    const defaultClient = new LLMClient();
    expect(defaultClient.url).toContain('localhost');
    expect(defaultClient.model).toBeTruthy();
    expect(defaultClient.timeout).toBeGreaterThan(0);
  });

  it('buildPayload creates correct message structure', () => {
    const payload = client.buildPayload('system msg', 'user msg', { temperature: 0.5 });
    expect(payload.model).toBe('test-model');
    expect(payload.messages).toHaveLength(2);
    expect(payload.messages[0].role).toBe('system');
    expect(payload.messages[0].content).toBe('system msg');
    expect(payload.messages[1].role).toBe('user');
    expect(payload.temperature).toBe(0.5);
  });

  it('extractContent handles valid response', () => {
    const data = { choices: [{ message: { content: 'hello' } }] };
    expect(client.extractContent(data)).toBe('hello');
  });

  it('extractContent returns null for empty/invalid responses', () => {
    expect(client.extractContent(null)).toBeNull();
    expect(client.extractContent({})).toBeNull();
    expect(client.extractContent({ choices: [] })).toBeNull();
    expect(client.extractContent({ choices: [{}] })).toBeNull();
  });

  describe('call', () => {
    it('makes POST request to configured URL', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'test response' } }],
        }),
      });

      const result = await client.call('system prompt', 'user prompt');

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:99999/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: expect.stringContaining('system prompt'),
        })
      );
      expect(result).toBe('test response');
    });

    it('returns parsed JSON response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: '{"key": "value"}' } }],
        }),
      });

      const result = await client.call('system', 'user');

      expect(result).toBe('{"key": "value"}');
    });

    it('handles non-OK response with error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });

      await expect(client.call('system', 'user')).rejects.toThrow('LLM API Error (500)');
    });

    it('throws error when response has no content', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ choices: [] }),
      });

      await expect(client.call('system', 'user')).rejects.toThrow('LLM returned empty or unexpected response');
    });

    it('includes API key in headers when configured', async () => {
      const clientWithKey = new LLMClient({
        url: 'http://localhost:99999/v1/chat/completions',
        model: 'test-model',
        apiKey: 'test-api-key',
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'response' } }],
        }),
      });

      await clientWithKey.call('system', 'user');

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:99999/v1/chat/completions',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-api-key',
          }),
        })
      );
    });

    it('appends /chat/completions if not in URL', async () => {
      const clientWithoutPath = new LLMClient({
        url: 'http://localhost:99999/v1',
        model: 'test-model',
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'response' } }],
        }),
      });

      await clientWithoutPath.call('system', 'user');

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:99999/v1/chat/completions',
        expect.any(Object)
      );
    });

    it('respects timeout and aborts on timeout', async () => {
      const timeoutClient = new LLMClient({
        url: 'http://localhost:99999/v1/chat/completions',
        model: 'test-model',
        timeout: 100,
      });

      global.fetch = vi.fn().mockImplementation((url, options) => {
        return new Promise((resolve, reject) => {
          if (options?.signal) {
            options.signal.addEventListener('abort', () => {
              const error = new Error('The operation was aborted');
              error.name = 'AbortError';
              reject(error);
            });
          }
        });
      });

      await expect(timeoutClient.call('system', 'user')).rejects.toThrow('The operation was aborted');
    });
  });

  describe('fetchModels', () => {
    it('returns list of models', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({
          data: [
            { id: 'model-1', name: 'Model 1' },
            { id: 'model-2', name: 'Model 2' },
          ],
        }),
      });

      const result = await client.fetchModels();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('model-1');
      expect(result[1].id).toBe('model-2');
    });

    it('constructs models URL from chat completions URL', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ data: [] }),
      });

      await client.fetchModels();

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:99999/v1/models',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('includes API key in headers when configured', async () => {
      const clientWithKey = new LLMClient({
        url: 'http://localhost:99999/v1/chat/completions',
        model: 'test-model',
        apiKey: 'test-api-key',
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ data: [] }),
      });

      await clientWithKey.fetchModels();

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-api-key',
          }),
        })
      );
    });

    it('handles empty models list', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ data: [] }),
      });

      const result = await client.fetchModels();

      expect(result).toEqual([]);
    });

    it('handles response without data array', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({}),
      });

      const result = await client.fetchModels();

      expect(result).toEqual([]);
    });
  });

  describe('updateConfig', () => {
    it('updates URL', () => {
      client.updateConfig({ url: 'http://new-url.com/v1' });
      expect(client.url).toBe('http://new-url.com/v1');
    });

    it('updates model', () => {
      client.updateConfig({ model: 'new-model' });
      expect(client.model).toBe('new-model');
    });

    it('updates API key', () => {
      client.updateConfig({ apiKey: 'new-key' });
      expect(client.apiKey).toBe('new-key');
    });

    it('updates timeout', () => {
      client.updateConfig({ timeout: 10000 });
      expect(client.timeout).toBe(10000);
    });

    it('updates multiple config values at once', () => {
      client.updateConfig({
        url: 'http://new-url.com/v1',
        model: 'new-model',
        timeout: 15000,
      });
      expect(client.url).toBe('http://new-url.com/v1');
      expect(client.model).toBe('new-model');
      expect(client.timeout).toBe(15000);
    });

    it('does not update undefined values', () => {
      const originalUrl = client.url;
      const originalModel = client.model;
      const originalTimeout = client.timeout;

      client.updateConfig({});

      expect(client.url).toBe(originalUrl);
      expect(client.model).toBe(originalModel);
      expect(client.timeout).toBe(originalTimeout);
    });
  });
});
