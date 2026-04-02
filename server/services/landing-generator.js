const ANTI_HALLUCINATION_RULES = `
STRICT RULES FOR LANDING PAGE GENERATION:
1. NO <small> tags as headers
2. NO border-radius above 12px
3. NO glassmorphism or frosted panels
4. NO gradient backgrounds on cards
5. NO decorative copy explaining the UI
6. NO eyebrow labels with uppercase
7. NO transform animations on hover
8. NO dramatic shadows (max 0 2px 8px rgba(0,0,0,0.1))
9. Use ONLY these colors: Background #0d1117, Surface #161b22, Primary #58a6ff, Secondary #79c0ff, Accent #f78166, Text #c9d1d9
10. System fonts only, no custom fonts
11. Spacing: 4/8/12/16/24/32px scale only
12. Sections must be complete: Hero, Benefits, How It Works, Social Proof, Offer, CTA
13. No fake testimonials - use placeholders
14. No fake metrics - use real data or mark as example
15. No generic headlines - must be product-specific

Generate clean, functional HTML that follows Uncodixfy rules.`;

function parseHtmlResponse(raw) {
  const htmlMatch = raw.match(/```html\n([\s\S]*?)\n```/) || raw.match(/```\n([\s\S]*?)\n```/);
  return htmlMatch ? htmlMatch[1] : raw;
}

export class LandingGenerator {
  constructor(llmClient) {
    this.llm = llmClient;
    this.systemPrompt = ANTI_HALLUCINATION_RULES;
  }

  buildPrompt(product, price, benefits, cta) {
    return `Generate landing page HTML untuk: PRODUK: ${product}, HARGA: ${price}, BENEFITS: ${benefits}, CTA: ${cta}`;
  }

  async generateLandingPage(product, price, benefits, cta) {
    const content = await this.llm.call(this.systemPrompt, this.buildPrompt(product, price, benefits, cta), {
      temperature: 0.7,
      max_tokens: 8000,
    });
    return parseHtmlResponse(content);
  }
}
