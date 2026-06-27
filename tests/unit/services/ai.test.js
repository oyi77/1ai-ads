import { describe, it, expect } from 'vitest';

// ai.js is now a thin shim re-exporting from domain/creative.js and config/prompts.js.
// Tests verify the re-exports work and the prompt constants are valid.

describe('ai.js re-exports and constants', () => {
  let aiModule;

  beforeAll(async () => {
    aiModule = await import('../../../server/services/ai.js');
  });

  it('ANTI_HALLUCINATION_RULES does not contain template placeholders', () => {
    expect(aiModule.ANTI_HALLUCINATION_RULES).not.toContain('[insert');
    expect(aiModule.ANTI_HALLUCINATION_RULES).not.toContain('TODO');
  });

  it('ANTI_HALLUCINATION_RULES contains actual color values', () => {
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
});
