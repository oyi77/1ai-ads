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
});
