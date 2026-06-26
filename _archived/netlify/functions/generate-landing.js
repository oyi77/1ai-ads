// Landing Page Generator - BerkahKarya Ads Framework

const SYSTEM_PROMPT_LANDING = `Kamu adalah AI Landing Page Generator dari BerkahKarya.

STRUKTUR LANDING PAGE (7 SECTIONS - PAS):
1. PROBLEM (Hero Section)
   - Hook headline (max 10 words)
   - Sub-headline (pain point)
   - CTA button primary

2. BENEFIT (Value Proposition)
   - 3-5 benefits konkret
   - Format: "Kamu bisa X dalam Y — tanpa Z"
   - Icon/visual per benefit

3. BRIDGING (How It Works)
   - 3 langkah simple
   - Visual timeline
   - Proof of concept

4. BONUS (Value Stack)
   - Bonus items (3-10x harga jual)
   - Total value vs price
   - Urgency element

5. SOCIAL PROOF (Testimonials)
   - 3-5 testimonials (name + result + role)
   - Stats with context
   - Before/after stories

6. OFFER (Pricing & Guarantee)
   - Price breakdown
   - Payment options
   - Money-back guarantee
   - Countdown timer (15 min)

7. OBJECTION HANDLING (FAQ)
   - 5 objection handlers
   - 5+ FAQ
   - Final CTA

DESIGN THEMES (6 OPTIONS):
1. Dark Modern - #1a1a2e, #16213e, #0f3460
2. Clean White - #ffffff, #f8f9fa, #e9ecef
3. Purple Premium - #6c5ce7, #a29bfe, #fd79a8
4. Green Trust - #00b894, #00cec9, #55efc4
5. Fire Orange - #ff7675, #fd79a8, #fdcb6e
6. Blue Corporate - #0984e3, #74b9ff, #a29bfe

FEATURES:
- Sticky CTA (2 buttons: WA hijau + Checkout orange)
- Countdown timer (15 min)
- Sales notification popup (random)
- A/B headline random
- Pixel tracking placeholder
- Mobile responsive

OUTPUT: Full HTML dengan inline CSS (ready to deploy).`;

// Handler untuk generate landing page
async function generateLandingPage(body) {
  const { produk, target, keunggulan, tone, theme, wa_link, checkout_link } = body;

  const userPrompt = `Generate landing page HTML untuk:

PRODUK: ${produk}
TARGET AUDIENCE: ${target}
KEUNGGULAN: ${keunggulan}
TONE: ${tone || 'santai'}
THEME: ${theme || 'dark'}
WA LINK: ${wa_link || 'https://wa.me/6285732740006'}
CHECKOUT LINK: ${checkout_link || '#'}

Generate full HTML dengan 7 sections (PAS structure), sticky CTA, countdown timer, dan sales popup.
Output harus siap deploy (inline CSS, no external dependencies).`;

  const response = await fetch('https://ai.aitradepulse.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'auto/pro-fast',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT_LANDING },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 8000
    })
  });

  if (!response.ok) {
    throw new Error(`OmniRoute API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;

  // Extract HTML from markdown code blocks
  let html;
  const htmlMatch = content.match(/```html\n([\s\S]*?)\n```/) || content.match(/```\n([\s\S]*?)\n```/);
  if (htmlMatch) {
    html = htmlMatch[1];
  } else {
    html = content;
  }

  return {
    lp_type: 'PAS',
    theme: theme || 'dark',
    html: html,
    sections: {
      section_1_problem: 'Hero with hook headline',
      section_2_benefit: '3-5 benefits',
      section_3_bridging: 'How it works (3 steps)',
      section_4_bonus: 'Value stack',
      section_5_social_proof: 'Testimonials + stats',
      section_6_offer: 'Pricing + guarantee',
      section_7_objection: 'FAQ + final CTA'
    }
  };
}

module.exports = { generateLandingPage };
