// Creative Brief Generator - BerkahKarya Ads Framework

const SYSTEM_PROMPT_BRIEF = `Kamu adalah AI Creative Brief Generator dari BerkahKarya.

CREATIVE BRIEF STRUCTURE:

1. HOOK OPTIONS (3 types):
   - Pain Hook: "Kamu pernah ngerasa..."
   - Curiosity Hook: "Rahasia yang..."
   - Social Proof Hook: "Sudah 1000+ orang..."

2. AD VARIATIONS (3 versions - 180° different):
   - Variant A: Pain/Fear angle
   - Variant B: Social Proof angle
   - Variant C: False Belief angle
   
   Each variant must have:
   - Unique angle
   - Different copy approach
   - Specific visual direction

3. VIDEO DIRECTION (very specific):
   - Camera angles
   - Lighting setup
   - Talent direction
   - B-roll shots
   - Transitions
   - Music/SFX

4. COLOR PALETTE:
   - 3 hex colors
   - Psychology behind each
   - Usage guidelines

5. SUCCESS METRIC:
   - Primary KPI
   - Target numbers
   - Testing timeline

6. TESTING PRIORITY:
   - Which variant to test first
   - Why
   - Budget allocation

OUTPUT FORMAT:
{
  "hook_options": [
    {"type": "pain", "text": "..."},
    {"type": "curiosity", "text": "..."},
    {"type": "social_proof", "text": "..."}
  ],
  "ad_variations": [
    {"variant": "A", "angle": "Pain/Fear", "copy": "...", "visual": "..."},
    {"variant": "B", "angle": "Social Proof", "copy": "...", "visual": "..."},
    {"variant": "C", "angle": "False Belief", "copy": "...", "visual": "..."}
  ],
  "video_direction": "very specific instructions",
  "color_palette": ["#hex1", "#hex2", "#hex3"],
  "success_metric": "CTR > 3%, CPA < IDR 50K",
  "testing_priority": "Test A first (highest urgency)"
}`;

async function generateBrief(body) {
  const { produk, target, keunggulan, platform, tone } = body;

  const userPrompt = `Generate creative brief untuk:

PRODUK: ${produk}
TARGET AUDIENCE: ${target}
KEUNGGULAN: ${keunggulan}
PLATFORM: ${platform || 'Meta Ads'}
TONE: ${tone || 'santai'}

Generate 3 hook options, 3 ad variations (180° different angles), video direction (very specific), color palette, success metrics, dan testing priority.
Output dalam format JSON.`;

  const response = await fetch('https://ai.aitradepulse.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'auto/pro-fast',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT_BRIEF },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.8,
      max_tokens: 4000
    })
  });

  if (!response.ok) {
    throw new Error(`OmniRoute API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;

  // Parse JSON from response
  let briefData;
  try {
    const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/```\n([\s\S]*?)\n```/);
    if (jsonMatch) {
      briefData = JSON.parse(jsonMatch[1]);
    } else {
      briefData = JSON.parse(content);
    }
  } catch (parseError) {
    console.error('JSON parse error:', parseError);
    return {
      brief: {
        hook_options: [],
        ad_variations: [],
        video_direction: content,
        color_palette: [],
        success_metric: 'Parse error',
        testing_priority: 'N/A'
      }
    };
  }

  return { brief: briefData };
}

module.exports = { generateBrief };
