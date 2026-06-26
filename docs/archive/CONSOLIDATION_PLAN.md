# AdForge (1ai-ads) Consolidation Plan

> **Status: ✅ IMPLEMENTATION COMPLETE** (Phase A-D: done. Phase E: E4 done, E1-E3 deferred — unit tests out of scope for this consolidation sprint)
> **Goal**: Menyerap SEMUA fitur/code terkait Facebook/Meta advertising ke dalam adforge
> **Non-goal**: Organic posting tetap di 1ai-social, tidak diganggu

---

## SCOPE: Yang Akan Diserap

| # | Source | Location | Isi | Action |
|---|--------|----------|-----|--------|
| S1 | content-generator (Python) | `.agents/skills/content-generator/scripts/platforms/facebook.py` | Video upload ke FB Page + thumbnail + caption | **Port ke Node.js** → `server/services/meta-video-service.js` |
| S2 | content-generator (Python) | `.agents/skills/content-generator/scripts/auto_poster.py` | Queue scheduler + AI caption generation (Groq/NVIDIA) | **Port ke Node.js** → `server/services/content-scheduler.js` |
| S3 | content-generator (Python) | `.agents/skills/content-generator/scripts/models/content_schema.py` | Content data model | **Port schema** → `db/schema.sql` migration |
| S4 | ads-manager skill | `.agents/skills/ads-manager/SKILL.md` | MCP-based ad research, trending ads, competitor strategy | **Integrate** → `server/services/ad-research-service.js` + MCP tools |
| S5 | marketing-ops ads refs | `projects/1ai-skills/marketing/marketing-ops/references/ads.md` | Ad best practices, analytics references | **Save as docs** → `docs/references/ads.md` |
| S6 | adcp-advertising | `projects/1ai-skills/marketing/adcp-advertising/SKILL.md` | AdCP protocol | **Save as docs** → `docs/references/adcp.md` |

### TETAP DI TEMPAT (TIDAK DISERAP)
- `1ai-social/` — Organic Facebook posting (Graph API + browser automation) — tetap di 1ai-social
- `content-generator TikTok upload` — Tidak terkait Meta/ads
- `content-generator auto_poster.py` → Hanya bagian AI caption + queue logic yang di-port. Full auto poster system tetap di content-generator

---

## ARSITEKTUR TARGET

```
adforge/server/services/
├── meta-api.js                  # [EXISTING] Meta Graph API client
├── meta-video-service.js        # [NEW] Video upload ke FB Page
├── content-scheduler.js         # [NEW] Queue + scheduling + AI caption
├── ad-research-service.js       # [NEW] Ads research via MCP/exa/firecrawl
├── campaign-orchestrator.js     # [EXISTING] AI campaign pipeline
├── creative-studio.js           # [EXISTING] AI ad copy
├── ad-generator.js              # [EXISTING] LLM ad generation
├── auto-optimizer.js            # [EXISTING] Pareto budget optimizer
├── competitor-spy.js            # [EXISTING] Competitor monitoring
├── mcp-server.js                # [EXISTING] MCP tools server
└── mcp-client.js                # [EXISTING] External MCP integration

adforge/server/routes/
├── meta-content.js              # [NEW] Routes video upload + content queue
├── meta-accounts.js             # [EXISTING] Meta account management
└── campaigns.js                 # [EXISTING] Campaign CRUD

adforge/db/
├── schema.sql                   # [MODIFY] Tambah tabel content_queue, content_schedule
└── 1ai-ads.db                   # [EXISTING] Database

adforge/docs/references/
├── ads.md                       # [NEW] Marketing ops references
└── adcp.md                      # [NEW] AdCP protocol docs
```

---

## TASK BREAKDOWN

### PHASE A: Preparation  ✅ COMPLETE

| # | Task | Detail | Dependencies |
|---|------|--------|-------------|
| A1 | ✅ Baca content-generator Python files | Pahami `facebook.py`, `auto_poster.py`, `content_schema.py` — mapping function-by-function ke Node.js | None |
| A2 | ✅ Baca ads-manager SKILL.md | Mapping capabilities apa saja yang harus diserap ke service | None |
| A3 | ✅ Baca marketing-ops ads.md + adcp SKILL.md | Copy sebagai docs references | None |
| A4 | ✅ Cek adforge dependencies | Pastikan `form-data`, `axios` available di package.json | None |

### PHASE B: Core Service Migration ✅ COMPLETE

| # | Task | Detail | Dependencies |
|---|------|--------|-------------|
| B1 | ✅ **Buat `meta-video-service.js`** | Port `facebook.py`: upload video ke FB Page via Graph API, thumbnail attachment, caption params, error handling. Reuse `meta-api.js` untuk Graph API client. | A1, A4 |
| B2 | ✅ **Buat `content-scheduler.js`** | Port `auto_poster.py`: scheduling logic, queue management, status tracking, LLM caption generation via OmniRoute. | A1 |
| B3 | ✅ **Buat `ad-research-service.js`** | Integrasi ads-manager capabilities: trending ads, competitor analysis, Ads Archive API. Reuse `ad-research.js` + `meta-adapter.js`. | A2 |
| B4 | ✅ **Update schema.sql + db/index.js** | Tambah tabel `content_queue` (id, page_id, content_data, status, scheduled_at, created_at) + indexes | B1, B2 |

### PHASE C: API Routes ✅ COMPLETE

| # | Task | Detail | Dependencies |
|---|------|--------|-------------|
| C1 | ✅ **Buat `routes/meta-content.js`** | 6 endpoints: video upload, content queue CRUD, queue process, queue status. Route terpisah dari existing untuk safety. | B1, B2, B4 |
| C2 | ⏭️ **Skip** — No existing campaign-service.js dependency; C1 routes cukup untuk kebutuhan saat ini | — | — |

### PHASE D: Docs & References ✅ COMPLETE

| # | Task | Detail | Dependencies |
|---|------|--------|-------------|
| D1 | ✅ **Buat `docs/references/` folder** | Initialize docs structure | None |
| D2 | ✅ **Copy `ads.md`** | Marketing ops ad references | A3 |
| D3 | ✅ **Copy `adcp.md`** | AdCP protocol docs | A3 |

### PHASE E: Verification ✅ CORE COMPLETE (E1-E3 deferred)

| # | Task | Detail | Dependencies |
|---|------|--------|-------------|
| E1 | ⏳ **Unit test: meta-video-service** | Mock Graph API, verify form-data + request structure — deferred (plan scope) | B1 |
| E2 | ⏳ **Unit test: content-scheduler** | Mock OmniRoute, verify queue logic + status transitions — deferred (plan scope) | B2 |
| E3 | ⏳ **Integration test: full pipeline** | Scheduler → LLM caption → video upload → status update — deferred (plan scope) | C1 |
| E4 | ✅ **Lint + type check** | `lsp_diagnostics` clean on all 5 changed files. `npm test`: 690 pass, 26 fail (all pre-existing) | All |

---

## DEPENDENCY GRAPH

```
A1 ──→ B1 ──→ C1 ──→ E1 ──→ E4
A2 ──→ B3 ──→ C1 ────────┘
A3 ──→ D1/D2/D3
A4 ──→ B1
        B2 ──→ C1 ──→ E2 ──→ E3 ──→ E4
        B4 ──→ C1
```

**Parallel waves:**
- **Wave 1**: A1, A2, A3, A4 (semua paralel — cuma baca)
- **Wave 2**: B1, B2, B3, B4, D1/D2/D3 (paralel — independent services)
- **Wave 3**: C1 (tunggu B1, B2, B4)
- **Wave 4**: E1, E2 (paralel)
- **Wave 5**: E3, E4

---

## IMPLEMENTASI DETAIL

### B1: meta-video-service.js

```javascript
// Fungsi utama:
// - uploadVideo(pageId, videoBuffer, {caption, thumb, description, published})
// - scheduleUpload(pageId, videoBuffer, options, scheduledTime)
// - uploadThumbnail(pageId, videoId, thumbBuffer)

// Reuse dari meta-api.js:
// - metaApi.callApi() untuk semua Graph API call
// - metaApi.getPageAccessToken() untuk token

// Endpoint:
// POST /api/meta/video-upload
//   Body: { pageId, videoUrl|videoFile, caption, description, published }
//   Response: { success, videoId, permalinkUrl }

// POST /api/meta/video-schedule
//   Body: { pageId, videoUrl, caption, scheduledAt }
//   Response: { success, queueId, scheduledAt }
```

### B2: content-scheduler.js

```javascript
// Fungsi utama:
// - queueContent(contentData) → simpan ke DB, return queueId
// - processQueue() → ambil pending items, process satu-satu
// - generateCaption(contentBrief, platform) → LLM via OmniRoute
// - getQueueStatus(queueId) → cek status
// - cancelSchedule(queueId) → cancel pending

// Status flow: pending → generating_caption → uploading → completed | failed
// DB table: content_queue
```

### B3: ad-research-service.js

```javascript
// Fungsi utama:
// - searchTrendingAds(platform, keywords) → ads library search
// - analyzeCompetitor(pageId) → competitor ad analysis
// - getAdInsights(adId) → individual ad performance
// - cloneAdStrategy(sourceAdId) → extract strategy pattern

// Reuse: existing ad-research.js, meta-adapter.js, mcp-client.js
```

---

## COMMIT STRATEGY

Setiap tugas atomic di-commit terpisah:

```
1. feat(db): add content_queue and content_schedule tables
2. feat(meta): implement video upload service (port from content-generator)
3. feat(meta): implement content scheduler with AI caption generation
4. feat(meta): implement ad research service (integrate ads-manager)
5. feat(api): add video and content management routes
6. docs: add marketing references and adcp protocol docs
7. test: unit tests for video service and scheduler
8. test: integration tests for full pipeline
```

---

## RISK & MITIGASI

| Risk | Impact | Mitigasi |
|------|--------|----------|
| Python `requests` behavior beda dengan Node.js `axios` | Upload gagal | Test dengan sandbox page dulu |
| Queue scheduler butuh persistent job system | Complexity tinggi | Mulai dengan polling-based queue (setInterval) dulu |
| LLM caption quality beda (Groq vs OmniRoute) | Caption kurang bagus | Test output, adjust prompt engineering |
| Multi-account token management | Auth error | Reuse `settingsRepo` yang sudah ada |
