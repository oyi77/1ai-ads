import { describe, it, expect } from 'vitest';
import { LandingGenerator } from '../../../server/services/landing-generator.js';

const mockLLM = {
  async call(systemPrompt, userPrompt) {
    return '```html\n<h1>Landing Page</h1>\n```';
  }
};

describe('LandingGenerator', () => {
  it('buildPrompt includes product and price', () => {
    const gen = new LandingGenerator(mockLLM);
    const prompt = gen.buildPrompt('Product X', '500k', 'fast,cheap', 'Buy Now');
    expect(prompt).toContain('Product X');
    expect(prompt).toContain('500k');
  });

  it('system prompt contains anti-hallucination rules with real palette', () => {
    const gen = new LandingGenerator(mockLLM);
    expect(gen.systemPrompt).not.toContain('[insert palette]');
    expect(gen.systemPrompt).toMatch(/#[0-9a-f]{6}/i);
  });

  it('generateLandingPage extracts HTML from code block', async () => {
    const gen = new LandingGenerator(mockLLM);
    const html = await gen.generateLandingPage('P', '100', 'benefits', 'CTA');
    expect(html).toBe('<h1>Landing Page</h1>');
  });

  it('returns raw content when no code block', async () => {
    const rawLLM = { async call() { return '<div>Direct HTML</div>'; } };
    const gen = new LandingGenerator(rawLLM);
    const html = await gen.generateLandingPage('P', '100', 'b', 'c');
    expect(html).toBe('<div>Direct HTML</div>');
  });
});
