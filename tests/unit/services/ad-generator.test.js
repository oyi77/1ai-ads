import { describe, it, expect } from 'vitest';
import { AdGenerator } from '../../../server/services/ad-generator.js';

// Mock LLM client
const mockLLM = {
  async call(systemPrompt, userPrompt) {
    return JSON.stringify({
      format: 'single_image',
      ads: [
        { model: '1', model_name: 'P.A.S', hook: 'Test hook', body: 'Test body', cta: 'Buy' },
        { model: '2', model_name: 'Efek Gravitasi', hook: 'Hook 2', body: 'Body 2', cta: 'CTA 2' },
        { model: '3', model_name: 'Hasil x3', hook: 'Hook 3', body: 'Body 3', cta: 'CTA 3' },
        { model: '4', model_name: 'P2P', hook: 'Hook 4', body: 'Body 4', cta: 'CTA 4' },
      ]
    });
  }
};

describe('AdGenerator', () => {
  it('buildPrompt includes product, target, keunggulan', () => {
    const gen = new AdGenerator(mockLLM);
    const prompt = gen.buildPrompt('Kursus DM', 'UMKM', 'Praktis');
    expect(prompt).toContain('Kursus DM');
    expect(prompt).toContain('UMKM');
    expect(prompt).toContain('Praktis');
  });

  it('generateAds returns parsed result with ads array', async () => {
    const gen = new AdGenerator(mockLLM);
    const result = await gen.generateAds('Product', 'Audience', 'Benefits');
    expect(result.ads).toHaveLength(4);
    expect(result.ads[0].model_name).toBe('P.A.S');
  });

  it('handles LLM returning JSON in code block', async () => {
    const codeBlockLLM = {
      async call() {
        return '```json\n{"format":"single_image","ads":[{"model":"1","hook":"Hi"}]}\n```';
      }
    };
    const gen = new AdGenerator(codeBlockLLM);
    const result = await gen.generateAds('P', 'T', 'K');
    expect(result.ads[0].hook).toBe('Hi');
  });

  it('returns error object for invalid JSON from LLM', async () => {
    const badLLM = { async call() { return 'not valid json'; } };
    const gen = new AdGenerator(badLLM);
    const result = await gen.generateAds('P', 'T', 'K');
    expect(result.error).toBeDefined();
    expect(result.raw_content).toBe('not valid json');
  });
});
