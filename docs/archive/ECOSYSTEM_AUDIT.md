# Ecosystem Audit & Integration Plan
> Generated: 2026-06-02 | Goal: Unify 1ai-ads + 1ai-social + 1ai-content into cohesive automation platform

---

## Current State

### 1ai-ads (Node.js/Express/SQLite) ✅ Production-ready
| Component | Status | Tests |
|-----------|--------|-------|
| Campaign management | ✅ Complete | 863 passing |
| Meta/Google/TikTok ads | ✅ Complete | |
| SELOW integration | ✅ Complete | |
| Workflow engine | ✅ Complete | |
| Profitability calculator | ✅ Complete | |
| Stoploss engine | ✅ Complete | |
| Scale manager | ✅ Complete | |
| MCP server (13 tools) | ✅ Complete | |
| Payment gateway | ❌ Not implemented | BACKLOG_PAYMENTS.md |

### 1ai-social (Python/FastAPI/PostgreSQL) ✅ Fully implemented
| Component | Status | Tests |
|-----------|--------|-------|
| Multi-platform social (8 platforms) | ✅ Complete | 60 passing |
| GoLogin integration | ✅ Created (not wired) | |
| LemonSqueezy billing | ✅ Complete | |
| GDPR compliance | ✅ Complete | |
| Cross-project bridge | ❌ Not connected | |

### 1ai-content (TypeScript/Telegraf/Fastify/PostgreSQL) ✅ Production-deployed
| Component | Status | Tests |
|-----------|--------|-------|
| Telegram bot SaaS | ✅ Live (3 users) | 68 files |
| 9-tier video fallback | ✅ Complete | |
| Duitku payment | ✅ Production | |
| Content bridge | ✅ Created (not wired) | |
| Failing tests | ❌ 18 failures | IMPROVEMENT_PLAN.md |
| Payment simulation gate | ❌ Security issue | GAP_ANALYSIS |

---

## IKLAN_WORKFLOW Coverage Gap Analysis

| Workflow Step | 1ai-ads | 1ai-social | 1ai-content | Integration Status |
|---|---|---|---|---|
| 1. Product research (Shopee) | ✅ shopee-adapter | — | — | ✅ Standalone |
| 2. Video content creation | — | — | ✅ 9-tier fallback | ⚠️ Bridge created, not wired |
| 3. Fanpage posting | — | ✅ GoLogin client | — | ⚠️ Bridge created, not wired |
| 4. Campaign setup | ✅ Meta/Google/TikTok | — | — | ✅ Standalone |
| 5. Monitoring (3-day eval) | ✅ workflow-engine | — | — | ✅ Standalone |
| 6. Scale up | ✅ scale-manager | — | — | ✅ Standalone |
| 7. Reporting | ✅ campaign-reporter | — | — | ✅ Standalone |
| 8. Social distribution | — | ✅ 8 platforms | — | ❌ Not connected |
| 9. Content-to-ads pipeline | — | — | ✅ video gen | ❌ Not connected |

---

## Integration Plan

### Phase 1: Fix Immediate Issues (1ai-content) ✅ DONE
**Priority: CRITICAL**

1. **Fix 18 failing tests** ✅ All 1090 tests passing
   - `help.test.ts` — update to match Bahasa Indonesia rebrand
   - `subscription.test.ts` — fix markdown format expectations
   - `broadcast.test.ts` — fix mock filter
   - `start.test.ts` — update welcome message
   - `web.test.ts` — register rate limit plugin
   - `video-generation.service.test.ts` — fix success logic
   - `prompts.test.ts` — update for refactored commands

2. **Gate payment simulation handler** ✅ Gated with `NODE_ENV === 'production'`

3. **Fix onboarding race condition** ✅ Fixed

### Phase 2: Wire Cross-Project Bridges (1ai-ads ↔ 1ai-content ↔ 1ai-social) ⏳ IN PROGRESS
**Priority: HIGH**

4. **Wire content bridge** (1ai-ads → 1ai-content) ✅ DONE
   - `server/services/content-bridge.js` updated with correct 1ai-content API (`/api/content/video/create`)
   - MCP tools added: `1ai-content_generate_video`, `1ai-content_list_videos`, `1ai-content_health`
   - ContentBridge wired into MCP server via `mcp.js`

5. **Wire GoLogin bridge** (1ai-ads → 1ai-social) ⏳ TODO
   - `ai_social/integrations/gologin_client.py` already exists
   - Need: REST endpoint in 1ai-social for Fanpage posting
   - Need: MCP tool in 1ai-ads to trigger Fanpage post

6. **Add reverse integration** (1ai-content → 1ai-ads) ✅ DONE
   - Webhook endpoint added: `POST /api/webhooks/video-complete`
   - 1ai-social already has `content_webhook.py` for receiving content

### Phase 3: Unified MCP Server ⏳ IN PROGRESS
**Priority: HIGH**

7. **Expand 1ai-ads MCP tools** for cross-project operations ✅ DONE
   - `1ai-content_generate_video` — request video from 1ai-content ✅
   - `1ai-content_list_videos` — list videos ✅
   - `1ai-content_health` — check content service health ✅
   - `1ai-social_post_fanpage` — post content via GoLogin ⏳ TODO
   - `1ai-social_post_social` — distribute to social platforms ⏳ TODO

8. **Create unified MCP config** for OpenClaw ⏳ TODO
   - Single MCP server entry pointing to 1ai-ads
   - 1ai-ads proxies to 1ai-social and 1ai-content
   - OpenClaw sees one unified tool set

### Phase 4: Shared API Contracts ✅ DONE
**Priority: MEDIUM**

9. **Define content generation contract** ✅ `docs/plans/CROSS_PROJECT_CONTRACTS.md`
   ```
   POST /api/content/generate
   Request: { productName, description, niche, style, duration }
   Response: { jobId, status }
   
   GET /api/content/status/:jobId
   Response: { jobId, status, videoUrl, thumbnailUrl }
   ```

10. **Define social posting contract**
    ```
    POST /api/social/post
    Request: { platform, accountId, content, mediaUrl }
    Response: { postId, status }
    ```

11. **Define campaign creation contract**
    ```
    POST /api/campaigns/auto
    Request: { productName, videoUrl, budget, interests }
    Response: { campaignId, adsetId, status }
    ```

### Phase 5: Unified Docker Compose
**Priority: MEDIUM**

12. **Create root-level docker-compose.yml**
    - All 3 projects + shared network
    - PostgreSQL (shared or per-project)
    - Redis (shared)
    - Health checks
    - Volume mounts for data persistence

### Phase 6: Documentation
**Priority: LOW**

13. **Ecosystem architecture diagram**
    - Service communication flow
    - Data flow between projects
    - MCP tool mapping

14. **OpenClaw system prompt update**
    - Include cross-project tools
    - Full IKLAN_WORKFLOW lifecycle
    - Social distribution capabilities

---

## Execution Order

```
Phase 1 (fix 1ai-content) → Phase 2 (wire bridges) → Phase 3 (MCP) → Phase 4 (contracts) → Phase 5 (docker) → Phase 6 (docs)
```

Phases 1-2 are blocking (workflow can't complete without content creation and posting).
Phases 3-6 are enhancement (better DX, cleaner architecture).

---

## Files to Create/Modify

### New files
- `docs/plans/ECOSYSTEM_AUDIT.md` (this file)
- `docker-compose.yml` (root-level, unified)
- `docs/architecture/ecosystem-diagrams.md`

### Modified files
- 1ai-ads: `server/services/content-bridge.js`, `server/services/mcp-server.js`, `server/app.js`
- 1ai-social: `ai_social/api/social_routes.py` (new endpoint)
- 1ai-content: Fix 18 tests, gate payment simulation, fix onboarding
