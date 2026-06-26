// Pain Map Generator - BerkahKarya Ads Framework

const SYSTEM_PROMPT_PAINMAP = `Kamu adalah AI Pain Map Generator dari BerkahKarya.

PAIN MAP STRUCTURE:

1. OBJECTION MAP (5 objections):
   Each objection must have:
   - objection: "Terlalu mahal"
   - reframe: "Investasi vs biaya"
   - proof_needed: "ROI calculator, testimonial"

   Common objections:
   - Price (too expensive)
   - Time (too busy)
   - Trust (scam/tidak percaya)
   - Need (tidak butuh sekarang)
   - Capability (tidak bisa/terlalu sulit)

2. FALSE BELIEF MAP (3 beliefs):
   Each belief must have:
   - belief: "Harus punya modal besar"
   - truth: "Bisa mulai dengan modal kecil"
   - bridge: "Bukti customer yang mulai dari nol"

3. DREAM STATE (3 layers):
   - surface: "Ingin penjualan naik"
   - underlying: "Ingin financial freedom"
   - identity: "Ingin jadi entrepreneur sukses"

OUTPUT FORMAT:
{
  "objection_map": [
    {
      "objection": "...",
      "reframe": "...",
      "proof_needed": "..."
    }
  ],
  "false_belief_map": [
    {
      "belief": "...",
      "truth": "...",
      "bridge": "..."
    }
  ],
  "dream_state": {
    "surface": "...",
    "underlying": "...",
    "identity": "..."
  }
}`;

async function generatePainMap(body) {
  const { produk, target, keunggulan } = body;

  const userPrompt = `Generate pain map untuk:

PRODUK: ${produk}
TARGET AUDIENCE: ${target}
KEUNGGULAN: ${keunggulan}

Generate 5 objections dengan reframe dan proof needed, 3 false beliefs dengan truth dan bridge, dan dream state (3 layers: surface/underlying/identity).
Output dalam format JSON.`;

  const response = await fetch('https://ai.aitradepulse.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'auto/pro-fast',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT_PAINMAP },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 3000
    })
  });

  if (!response.ok) {
    throw new Error(`OmniRoute API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;

  // Parse JSON from response
  let painmapData;
  try {
    const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/```\n([\s\S]*?)\n```/);
    if (jsonMatch) {
      painmapData = JSON.parse(jsonMatch[1]);
    } else {
      painmapData = JSON.parse(content);
    }
  } catch (parseError) {
    console.error('JSON parse error:', parseError);
    return {
      painmap: {
        objection_map: [],
        false_belief_map: [],
        dream_state: {
          surface: content.substring(0, 100),
          underlying: 'Parse error',
          identity: 'Parse error'
        }
      }
    };
  }

  return { painmap: painmapData };
}

module.exports = { generatePainMap };
