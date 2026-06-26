const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Import tool generators
const { generateLandingPage } = require('./netlify/functions/generate-landing');
const { generateVSL } = require('./netlify/functions/generate-vsl');
const { generateBrief } = require('./netlify/functions/generate-brief');
const { generatePainMap } = require('./netlify/functions/generate-painmap');
const { generateHookTest } = require('./netlify/functions/generate-hooktest');

// OmniRoute API endpoint
const OMNIROUTE_API_URL = 'https://ai.aitradepulse.com/v1/chat/completions';
const OMNIROUTE_MODEL = 'auto/pro-fast';

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

// API endpoint
app.post('/api/generate-ads', async (req, res) => {
  try {
    const { produk, target, keunggulan, platform, format, tone } = req.body;

    // Validate required fields
    if (!produk || !target || !keunggulan) {
      return res.status(400).json({ 
        error: 'Missing required fields: produk, target, keunggulan' 
      });
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

    // Call OmniRoute API
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
      return res.json({
        format: format || 'single_image',
        ads: [],
        raw_content: content,
        error: 'Failed to parse JSON, returning raw content'
      });
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

    res.json(adsData);

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ AdForge AI server running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🎯 API endpoint: http://localhost:${PORT}/api/generate-ads`);
});

// Tool 2: Landing Page
app.post('/api/generate-landing', async (req, res) => {
  try {
    const result = await generateLandingPage(req.body);
    res.json(result);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// Tool 3: VSL Script
app.post('/api/generate-vsl', async (req, res) => {
  try {
    const result = await generateVSL(req.body);
    res.json(result);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// Tool 4: Creative Brief
app.post('/api/generate-brief', async (req, res) => {
  try {
    const result = await generateBrief(req.body);
    res.json(result);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// Tool 5: Pain Map
app.post('/api/generate-painmap', async (req, res) => {
  try {
    const result = await generatePainMap(req.body);
    res.json(result);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// Tool 6: Hook Test
app.post('/api/generate-hooktest', async (req, res) => {
  try {
    const result = await generateHookTest(req.body);
    res.json(result);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});
