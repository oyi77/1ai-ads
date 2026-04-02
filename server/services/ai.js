const OMNIROUTE_URL = process.env.OMNIROUTE_URL || 'http://localhost:20128/v1/chat/completions';
const MODEL = 'auto/pro-fast';

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
9. Use ONLY these colors: [insert palette]
10. System fonts only, no custom fonts
11. Spacing: 4/8/12/16/24/32px scale only
12. Sections must be complete: Hero, Benefits, How It Works, Social Proof, Offer, CTA
13. No fake testimonials - use placeholders
14. No fake metrics - use real data or mark as example
15. No generic headlines - must be product-specific
`;

const SYSTEM_PROMPT = `Kamu adalah AI Ads Copywriter dari BerkahKarya.

4 CONTENT MODELS:
1. P.A.S (Problem-Agitate-Solution)
2. Efek Gravitasi
3. Hasil x3
4. Prospects-to-Prospects

OUTPUT FORMAT:
Generate 4 iklan (1 per model) dalam format JSON:
{"format": "single_image", "ads": [{"model": "1", "model_name": "P.A.S", "hook": "...", "body": "...", "cta": "..."}]}`;

export async function generateAds(product, target, keunggulan) {
  const userPrompt = `Generate 4 iklan untuk: PRODUK: ${product}, TARGET: ${target}, KEUNGGULAN: ${keunggulan}`;

  try {
    const response = await fetch(OMNIROUTE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.8,
        max_tokens: 4000
      })
    });

    const data = await response.json();
    const content = data.choices[0].message.content;

    // Extract JSON
    const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/```\n([\s\S]*?)\n```/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[1]) : JSON.parse(content);

    return parsed;
  } catch (e) {
    console.error('AI generation error:', e);
    throw e;
  }
}

export async function generateLandingPage(product, price, benefits, cta, theme) {
  const userPrompt = `Generate landing page HTML untuk: PRODUK: ${product}, HARGA: ${price}, BENEFITS: ${benefits}, CTA: ${cta}`;

  try {
    const response = await fetch(OMNIROUTE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: ANTI_HALLUCINATION_RULES + '\n\nGenerate clean, functional HTML that follows Uncodixfy rules.' },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 8000
      })
    });

    const data = await response.json();
    const content = data.choices[0].message.content;

    // Extract HTML
    const htmlMatch = content.match(/```html\n([\s\S]*?)\n```/) || content.match(/```\n([\s\S]*?)\n```/);
    const html = htmlMatch ? htmlMatch[1] : content;

    return html;
  } catch (e) {
    console.error('Landing page generation error:', e);
    throw e;
  }
}
