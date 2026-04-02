import { describe, it, expect, vi } from 'vitest';

// We test the utility functions and constants, not the actual fetch calls
// (those will be tested after the SRP refactor in Phase 4 with proper DI)

describe('ai.js constants and parsing', () => {
  let aiModule;

  beforeAll(async () => {
    aiModule = await import('../../../server/services/ai.js');
  });

  it('ANTI_HALLUCINATION_RULES does not contain [insert palette] placeholder', () => {
    expect(aiModule.ANTI_HALLUCINATION_RULES).not.toContain('[insert palette]');
  });

  it('ANTI_HALLUCINATION_RULES contains actual color values', () => {
    // Should have real hex colors from the void palette
    expect(aiModule.ANTI_HALLUCINATION_RULES).toMatch(/#[0-9a-f]{6}/i);
  });

  it('parseJsonResponse extracts JSON from code blocks', () => {
    const raw = '```json\n{"ads": [{"hook": "Test"}]}\n```';
    const parsed = aiModule.parseJsonResponse(raw);
    expect(parsed.ads[0].hook).toBe('Test');
  });

  it('parseJsonResponse handles plain JSON', () => {
    const raw = '{"ads": [{"hook": "Direct"}]}';
    const parsed = aiModule.parseJsonResponse(raw);
    expect(parsed.ads[0].hook).toBe('Direct');
  });

  it('parseJsonResponse returns error object for invalid JSON', () => {
    const raw = 'Not valid JSON at all';
    const parsed = aiModule.parseJsonResponse(raw);
    expect(parsed.error).toBeDefined();
    expect(parsed.raw_content).toBe(raw);
  });

  it('parseHtmlResponse extracts HTML from code blocks', () => {
    const raw = '```html\n<h1>Hello</h1>\n```';
    const result = aiModule.parseHtmlResponse(raw);
    expect(result).toBe('<h1>Hello</h1>');
  });

  it('parseHtmlResponse returns raw content when no code block', () => {
    const raw = '<h1>Direct HTML</h1>';
    const result = aiModule.parseHtmlResponse(raw);
    expect(result).toBe(raw);
  });

  it('extractLLMContent handles valid response shape', () => {
    const data = { choices: [{ message: { content: 'hello' } }] };
    expect(aiModule.extractLLMContent(data)).toBe('hello');
  });

  it('extractLLMContent returns null for missing choices', () => {
    expect(aiModule.extractLLMContent({})).toBeNull();
    expect(aiModule.extractLLMContent({ choices: [] })).toBeNull();
    expect(aiModule.extractLLMContent({ choices: [{}] })).toBeNull();
    expect(aiModule.extractLLMContent(null)).toBeNull();
  });
});
