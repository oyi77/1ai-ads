# AdForge Generator — BerkahKarya Ads Framework

AI-powered ad copy generator using 4 content models. Standalone module within 1ai-ads.

## Content Models

1. **P.A.S** (Problem-Agitate-Solution)
2. **Efek Gravitasi** (Curiosity hook → reveal → teaser)
3. **Hasil x3** (Bold result claim → proof → mechanism)
4. **Prospects-to-Prospects** (Customer story → before/after)

## API Endpoints

| Endpoint | Function |
|----------|----------|
| `POST /api/generate-ads` | Generate 4 ads (1 per content model) |
| `POST /api/generate-landing` | Generate landing page |
| `POST /api/generate-vsl` | Generate VSL script |
| `POST /api/generate-brief` | Generate creative brief |
| `POST /api/generate-painmap` | Generate pain map |
| `POST /api/generate-hooktest` | Generate hook test variants |

## Run Standalone

```bash
cd adforge-generator
npm install
node server.js
# Server on http://localhost:3000
```

## Dependencies

- OmniRoute (AI proxy) at `https://ai.aitradepulse.com/v1/chat/completions`
- Express, CORS

## Integration with 1ai-ads

This module can be imported into 1ai-ads's main server or run as a separate service.
Netlify functions in `../netlify/functions/` provide serverless deployment option.
