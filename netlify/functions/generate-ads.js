// AdForge AI - Generate Ads Function
// BerkahKarya Ads Framework

// Use OmniRoute API (OpenAI-compatible)
const OMNIROUTE_API_URL = 'https://ai.aitradepulse.com/v1/chat/completions';
const OMNIROUTE_MODEL = 'auto/pro-fast'; // or auto/pro-coding

// BerkahKarya Ads Framework - 4 Content Models
const CONTENT_MODELS = {
  1: {
    name: 'P.A.S (Problem-Agitate-Solution)',
    structure: ['Problem', 'Agitate', 'Solution', 'Benefits', 'Social Proof', 'CTA'],
    best_for: ['Video', 'Carousel', 'Single Image']
  },
  2: {
    name: 'Efek Gravitasi',
    structure: ['Hook Curiosity', 'Reveal Problem', 'Solution Teaser', 'Benefits', 'CTA'],
    best_for: ['Video', 'Carousel']
  },
  3: {
    name: 'Hasil x3',
    structure: ['Bold Result Claim', 'Proof', 'How It Works', 'Benefits', 'CTA'],
    best_for: ['Single Image', 'Carousel']
  },
  4: {
    name: 'Prospects-to-Prospects',
    structure: ['Customer Story', 'Before State', 'After State', 'How They Did It', 'CTA'],
    best_for: ['Video', 'Carousel']
  }
};

// System Prompt for BerkahKarya Ads Framework
const SYSTEM_PROMPT = `Kamu adalah AI Ads Copywriter dari BerkahKarya yang menggunakan BerkahKarya Ads Framework.

FRAMEWORK INTI — VALUE CREATION (WAJIB):
- OUTPUT: Hasil konkret yang didapat customer
- DURASI: Seberapa cepat hasil tercapai
- RISIKO: Kurangi dengan garansi/social proof
- USAHA: Tunjukkan mudahnya proses
- PENGORBANAN: Tidak perlu korbankan hal lain

4 CONTENT MODELS:
1. P.A.S (Problem-Agitate-Solution)
   - Problem: Identifikasi masalah spesifik
   - Agitate: Perbesar rasa sakit/urgency
   - Solution: Tawarkan solusi konkret
   - Benefits: 3-5 manfaat spesifik
   - Social Proof: Testimoni/angka
   - CTA: Call to action jelas

2. Efek Gravitasi
   - Hook Curiosity: Buat penasaran
   - Reveal Problem: Ungkap masalah tersembunyi
   - Solution Teaser: Hint solusi tanpa reveal semua
   - Benefits: Hasil yang bisa dicapai
   - CTA: Ajakan untuk tahu lebih lanjut

3. Hasil x3
   - Bold Result Claim: Klaim hasil berani (3x, 10x, dll)
   - Proof: Data/testimoni yang mendukung
   - How It Works: Mekanisme singkat
   - Benefits: Manfaat spesifik
   - CTA: Ajakan action

4. Prospects-to-Prospects
   - Customer Story: Cerita customer nyata
   - Before State: Kondisi sebelum pakai produk
   - After State: Kondisi setelah pakai produk
   - How They Did It: Langkah yang mereka ambil
   - CTA: Ajakan ikuti jejak mereka

RULES:
- Hook max 10 kata (untuk attention span pendek)
- Body copy: jelas, spesifik, benefit-driven
- CTA: action-oriented, urgent
- Text overlay: singkat, mudah dibaca di mobile
- Setiap model harus punya angle berbeda 180°

OUTPUT FORMAT:
Generate 4 iklan (1 per model) dalam format JSON dengan struktur:
{
  "format": "single_image|carousel|video",
  "ads": [
    {
      "model": "1",
      "model_name": "P.A.S",
      "angle": "specific angle for this ad",
      "hook": "max 10 words",
      "body": "main copy",
      "cta": "call to action",
      "media_spec": {
        "format": "single_image|carousel|video",
        "dimensions": "1080x1080",
        "aspect_ratio": "1:1|9:16|16:9"
      },
      "design_json": {
        "canvas_size": {"width": 1080, "height": 1080},
        "text_elements": [
          {"content": "text from hook", "position": "top", "font_size": "48px"},
          {"content": "key message from body", "position": "center", "font_size": "32px"},
          {"content": "cta text", "position": "bottom", "font_size": "28px"}
        ],
        "background": {"type": "gradient", "colors": ["#hex1", "#hex2"]},
        "export": {"format": "PNG", "quality": "high"}
      }
    }
  ]
}

CRITICAL: text_elements harus diambil dari hook/body/cta, BUKAN generic text!`;

exports.handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle OPTIONS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const body = JSON.parse(event.body);
    const { produk, target, keunggulan, platform, format, tone } = body;

    // Validate required fields
    if (!produk || !target || !keunggulan) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing required fields: produk, target, keunggulan' })
      };
    }

    // Build user prompt
    const userPrompt = `Generate 4 iklan untuk:

PRODUK: ${produk}
TARGET AUDIENCE: ${target}
KEUNGGULAN: ${keunggulan}
PLATFORM: ${platform || 'Meta Ads'}
FORMAT: ${format || 'single_image'}
TONE: ${tone || 'santai'}

Generate 4 iklan (1 per model) dengan angle berbeda 180°. Output dalam format JSON sesuai struktur yang sudah ditentukan.`;

    // Call OmniRoute API (no auth needed for localhost)
    const response = await fetch(OMNIROUTE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: OMNIROUTE_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
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
    let adsData;
    try {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/```\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        adsData = JSON.parse(jsonMatch[1]);
      } else {
        adsData = JSON.parse(content);
      }
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      // Fallback: return raw content
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          format: format || 'single_image',
          ads: [],
          raw_content: content,
          error: 'Failed to parse JSON, returning raw content'
        })
      };
    }

    // Ensure design_json text_elements are populated from hook/body/cta
    if (adsData.ads) {
      adsData.ads = adsData.ads.map(ad => {
        if (ad.design_json && ad.design_json.text_elements) {
          // Auto-populate text_elements from hook/body/cta if empty or generic
          ad.design_json.text_elements = [
            {
              content: ad.hook || 'Hook text',
              position: 'top',
              font_size: '48px'
            },
            {
              content: ad.body ? ad.body.substring(0, 50) : 'Key message',
              position: 'center',
              font_size: '32px'
            },
            {
              content: ad.cta || 'CTA text',
              position: 'bottom',
              font_size: '28px'
            }
          ];
        }
        return ad;
      });
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(adsData)
    };

  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message
      })
    };
  }
};
