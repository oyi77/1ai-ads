// Hook Test Generator - BerkahKarya Ads Framework

const SYSTEM_PROMPT_HOOKTEST = `Kamu adalah AI Hook Test Generator dari BerkahKarya.

HOOK TEST CRITERIA (Score 0-100):

1. CLARITY (0-20 points)
   - Apakah hook jelas dan mudah dipahami?
   - Tidak ambigu atau membingungkan?

2. RELEVANCE (0-20 points)
   - Apakah relevan dengan target audience?
   - Menyentuh pain point atau desire mereka?

3. CURIOSITY (0-20 points)
   - Apakah membuat penasaran?
   - Ada gap yang ingin ditutup?

4. URGENCY (0-15 points)
   - Apakah ada sense of urgency?
   - Perlu action sekarang?

5. SPECIFICITY (0-15 points)
   - Apakah spesifik (bukan generic)?
   - Ada angka/detail konkret?

6. EMOTION (0-10 points)
   - Apakah trigger emosi kuat?
   - Fear/desire/curiosity/anger?

SCORING GUIDE:
- 90-100: Excellent (use immediately)
- 75-89: Good (minor tweaks)
- 60-74: Average (needs improvement)
- 40-59: Weak (major revision)
- 0-39: Poor (start over)

OUTPUT FORMAT:
{
  "hooks_tested": [
    {
      "hook": "Tingkatkan penjualan 3x dalam 30 hari",
      "scores": {
        "clarity": 18,
        "relevance": 19,
        "curiosity": 15,
        "urgency": 12,
        "specificity": 14,
        "emotion": 8
      },
      "total_score": 86,
      "rating": "Good",
      "feedback": "Strong hook with clear benefit. Add more urgency.",
      "improved_version": "Tingkatkan penjualan 3x dalam 30 hari — atau uang kembali!"
    }
  ]
}

Generate 10 hooks and test each one.`;

async function generateHookTest(body) {
  const { produk, target, keunggulan } = body;

  const userPrompt = `Generate dan test 10 hooks untuk:

PRODUK: ${produk}
TARGET AUDIENCE: ${target}
KEUNGGULAN: ${keunggulan}

Generate 10 hooks berbeda, test masing-masing dengan 6 criteria (clarity/relevance/curiosity/urgency/specificity/emotion), berikan total score, rating, feedback, dan improved version.
Output dalam format JSON.`;

  const response = await fetch('https://ai.aitradepulse.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'auto/pro-fast',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT_HOOKTEST },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.8,
      max_tokens: 5000
    })
  });

  if (!response.ok) {
    throw new Error(`OmniRoute API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;

  // Parse JSON from response
  let hooktestData;
  try {
    const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/```\n([\s\S]*?)\n```/);
    if (jsonMatch) {
      hooktestData = JSON.parse(jsonMatch[1]);
    } else {
      hooktestData = JSON.parse(content);
    }
  } catch (parseError) {
    console.error('JSON parse error:', parseError);
    return {
      hooktest: {
        hooks_tested: [],
        raw_content: content
      }
    };
  }

  return { hooktest: hooktestData };
}

module.exports = { generateHookTest };
