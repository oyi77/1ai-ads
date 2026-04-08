import { describe, it, expect, vi } from 'vitest';
import { CreativeStudio } from '../../../server/services/creative-studio.js';

describe('CreativeStudio', () => {
  const mockLlmClient = {
    call: vi.fn(),
  };

  const studio = new CreativeStudio(mockLlmClient);

  it('should create a CreativeStudio instance with LLM client', () => {
    expect(studio).toBeInstanceOf(CreativeStudio);
    expect(studio.llm).toBe(mockLlmClient);
  });

  it('should generate complete ad package', async () => {
    const mockAiResponse = `{
  "copies": [
    {
      "model": "1",
      "model_name": "P.A.S",
      "hook": "Tired of wasting money on ads?",
      "body": "Our AI cuts your ad spend by 40% automatically",
      "cta": "Start Free Trial",
      "headline": "Save 40% Today",
      "description": "AI-powered optimization"
    },
    {
      "model": "2",
      "model_name": "Efek Gravitasi",
      "hook": "Why your ads aren't converting",
      "body": "The secret to 3x ROAS is smarter targeting",
      "cta": "Learn More",
      "headline": "3x Your ROAS",
      "description": "Smart targeting"
    }
  ],
  "imageDirections": [
    {
      "description": "Product center with lifestyle background",
      "layout": "clean, minimalist",
      "colors": "warm tones, orange accent",
      "textOverlay": "40% Savings",
      "mood": "exciting"
    }
  ],
  "videoScript": {
    "duration": "20 seconds",
    "hook": { "time": "0-3s", "visual": "closeup on frustrated face", "voiceover": "Tired of wasting money?" },
    "problem": { "time": "3-8s", "visual": "money burning animation", "voiceover": "Your ads are bleeding cash" },
    "solution": { "time": "8-15s", "visual": "dashboard showing growth", "voiceover": "Our AI fixes it instantly" },
    "cta": { "time": "15-20s", "visual": "button press", "voiceover": "Start your free trial now" }
  },
  "targetingSuggestions": {
    "interests": [
      { "name": "Digital Marketing", "reason": "direct relevance" },
      { "name": "E-commerce", "reason": "target audience" }
    ],
    "ageRange": { "min": 25, "max": 45 },
    "locations": ["Indonesia"],
    "genderNote": "All genders"
  }
}`;

    mockLlmClient.call.mockResolvedValue(mockAiResponse);

    const result = await studio.generateAdPackage(
      'AI Ad Optimizer',
      'Business owners',
      '40% cost reduction',
      'meta',
      'single_image'
    );

    expect(result.copies).toHaveLength(2);
    expect(result.copies[0].model_name).toBe('P.A.S');
    expect(result.copies[0].hook).toBe('Tired of wasting money on ads?');
    expect(result.imageDirections).toHaveLength(1);
    expect(result.videoScript).not.toBeNull();
    expect(result.targetingSuggestions.interests).toHaveLength(2);
    expect(mockLlmClient.call).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('AI Ad Optimizer'),
      expect.objectContaining({
        temperature: 0.8,
        max_tokens: 4000,
      })
    );
  });

  it('should handle timeout during ad package generation', async () => {
    const abortError = new Error('AbortError');
    abortError.name = 'AbortError';
    mockLlmClient.call.mockRejectedValue(abortError);

    const result = await studio.generateAdPackage(
      'Test Product',
      'Test Target',
      'Test Benefit'
    );

    expect(result.error).toContain('timed out');
    expect(result.timeout).toBe(true);
    expect(result.copies).toEqual([]);
    expect(result.imageDirections).toEqual([]);
  });

  it('should generate copy only', async () => {
    const mockResponse = `{
  "copies": [
    {
      "model": "1",
      "model_name": "P.A.S",
      "hook": "Struggling with ad performance?",
      "body": "Get 2x better results instantly",
      "cta": "Try Now",
      "headline": "2x Results",
      "description": "Better performance"
    }
  ]
}`;

    mockLlmClient.call.mockResolvedValue(mockResponse);

    const result = await studio.generateCopyOnly(
      'Performance Tool',
      'Marketers',
      '2x improvement'
    );

    expect(result).toHaveLength(1);
    expect(result[0].model_name).toBe('P.A.S');
    expect(result[0].hook).toContain('Struggling');
  });

  it('should return empty array on timeout for copy generation', async () => {
    const abortError = new Error('AbortError');
    abortError.name = 'AbortError';
    mockLlmClient.call.mockRejectedValue(abortError);

    const result = await studio.generateCopyOnly('Test', 'Test', 'Test');
    expect(result).toEqual([]);
  });

  it('should generate video script', async () => {
    const mockResponse = `{
  "videoScript": {
    "duration": "25 seconds",
    "hook": { "time": "0-3s", "visual": "test", "voiceover": "test voice", "onScreen": "test text" },
    "problem": { "time": "3-8s", "visual": "test", "voiceover": "test voice", "onScreen": "test text" },
    "solution": { "time": "8-18s", "visual": "test", "voiceover": "test voice", "onScreen": "test text" },
    "cta": { "time": "18-25s", "visual": "test", "voiceover": "test voice", "onScreen": "test text" }
  }
}`;

    mockLlmClient.call.mockResolvedValue(mockResponse);

    const result = await studio.generateVideoScript(
      'Video Product',
      'Video Audience',
      'Video Benefit'
    );

    expect(result.duration).toBe('25 seconds');
    expect(result.hook).toBeDefined();
    expect(result.problem).toBeDefined();
    expect(result.solution).toBeDefined();
    expect(result.cta).toBeDefined();
  });

  it('should return error object on timeout for video script', async () => {
    const abortError = new Error('AbortError');
    abortError.name = 'AbortError';
    mockLlmClient.call.mockRejectedValue(abortError);

    const result = await studio.generateVideoScript('Test', 'Test', 'Test');
    expect(result.error).toContain('timed out');
    expect(result.timeout).toBe(true);
  });

  it('should suggest targeting', async () => {
    const mockResponse = `{
  "targetingSuggestions": {
    "interests": [
      { "name": "Online Business", "reason": "relevant audience" },
      { "name": "Marketing", "reason": "interest match" }
    ],
    "ageRange": { "min": 28, "max": 50 },
    "locations": ["Indonesia", "Malaysia"],
    "genderNote": "All genders"
  }
}`;

    mockLlmClient.call.mockResolvedValue(mockResponse);

    const result = await studio.suggestTargeting(
      'Targeting Product',
      'Targeting Audience',
      'Targeting Benefit'
    );

    expect(result.interests).toHaveLength(2);
    expect(result.interests[0].name).toBe('Online Business');
    expect(result.ageRange.min).toBe(28);
    expect(result.ageRange.max).toBe(50);
    expect(result.locations).toContain('Indonesia');
  });

  it('should handle malformed JSON responses', async () => {
    mockLlmClient.call.mockResolvedValue('invalid json {{{');

    const result = await studio.generateAdPackage('Test', 'Test', 'Test');
    expect(result.copies).toEqual([]);
    expect(result.imageDirections).toEqual([]);
    expect(result.raw).toBe('invalid json {{{');
  });

  it('should parse JSON from markdown code blocks', async () => {
    const markdownResponse = `\`\`\`json
{
  "copies": [
    {
      "model": "1",
      "model_name": "P.A.S",
      "hook": "Test hook",
      "body": "Test body",
      "cta": "Test CTA",
      "headline": "Test",
      "description": "Test"
    }
  ],
  "imageDirections": [],
  "videoScript": null,
  "targetingSuggestions": {
    "interests": [],
    "ageRange": { "min": 25, "max": 55 },
    "locations": ["Indonesia"]
  }
}
\`\`\``;

    mockLlmClient.call.mockResolvedValue(markdownResponse);

    const result = await studio.generateAdPackage('Test', 'Test', 'Test');
    expect(result.copies).toHaveLength(1);
    expect(result.copies[0].hook).toBe('Test hook');
  });
});
