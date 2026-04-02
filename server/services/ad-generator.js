const SYSTEM_PROMPT = `Kamu adalah AI Ads Copywriter dari BerkahKarya.

4 CONTENT MODELS:
1. P.A.S (Problem-Agitate-Solution)
2. Efek Gravitasi
3. Hasil x3
4. Prospects-to-Prospects

OUTPUT FORMAT:
Generate 4 iklan (1 per model) dalam format JSON:
{"format": "single_image", "ads": [{"model": "1", "model_name": "P.A.S", "hook": "...", "body": "...", "cta": "..."}]}`;

function parseJsonResponse(raw) {
  try {
    const jsonMatch = raw.match(/```json\n([\s\S]*?)\n```/) || raw.match(/```\n([\s\S]*?)\n```/);
    return jsonMatch ? JSON.parse(jsonMatch[1]) : JSON.parse(raw);
  } catch {
    return { error: 'Failed to parse AI response as JSON', raw_content: raw };
  }
}

export class AdGenerator {
  constructor(llmClient) {
    this.llm = llmClient;
  }

  buildPrompt(product, target, keunggulan) {
    return `Generate 4 iklan untuk: PRODUK: ${product}, TARGET: ${target}, KEUNGGULAN: ${keunggulan}`;
  }

  async generateAds(product, target, keunggulan) {
    const content = await this.llm.call(SYSTEM_PROMPT, this.buildPrompt(product, target, keunggulan));
    return parseJsonResponse(content);
  }
}
