# Service Architecture Diagrams (SDD)

## 1. IKLAN_WORKFLOW — Full Campaign Lifecycle

```
User (OpenClaw)
    │
    ▼
┌─────────────────────────────────────────────────────┐
│                    MCP Server                        │
│  selow_topup │ run_workflow │ check_profitability    │
│  trigger_scale │ list_campaigns                     │
└──────┬──────────────┬──────────────┬────────────────┘
       │              │              │
       ▼              ▼              ▼
┌──────────┐  ┌──────────────┐  ┌──────────────┐
│ SelowAPI │  │WorkflowEngine│  │ ScaleManager │
│ (T1)     │  │ (T5)         │  │ (T4)         │
└──────────┘  └──────┬───────┘  └──────┬───────┘
                     │                  │
         ┌───────────┼──────────┐       │
         ▼           ▼          ▼       ▼
┌─────────────┐ ┌─────────┐ ┌──────────────────────┐
│Profitability│ │Stoploss │ │  MetaAdsAPI           │
│Calculator   │ │Engine   │ │  (Campaign CRUD)      │
│ (T2)        │ │ (T3)    │ │  + LLM (interests)    │
└─────────────┘ └─────────┘ └──────────────────────┘
```

## 2. Workflow Engine — Daily Check Sequence

```
OpenClaw ──POST /api/workflow──▶ WorkflowEngine.runDailyCheck(userId)
                                    │
                                    ├──▶ campaignsRepo.findActive(userId)
                                    │
                                    ├──▶ FOR EACH campaign:
                                    │       ├──▶ metaApi.getCampaignInsights(id, last_3d)
                                    │       ├──▶ profitabilityCalculator.evaluateROAS(commission, spend)
                                    │       └──▶ profitabilityCalculator.getCampaignStatus(commission, spend)
                                    │
                                    └──▶ RETURN CampaignStatus[]
```

## 3. 3-Day Evaluation — Decision Flow

```
WorkflowEngine.run3DayEvaluation(campaignId)
    │
    ├──▶ metaApi.getCampaignInsights(last_3d)
    │
    ├──▶ evaluateStoploss({ currentROAS, previousROAS, consecutiveDrops })
    │       │
    │       ├── action: WAIT       → return "monitoring"
    │       ├── action: REDUCE     → metaApi.updateBudget(50%) → return "budget_cut"
    │       ├── action: KILL       → metaApi.pauseCampaign() → return "stopped"
    │       └── action: NONE       → continue ↓
    │
    ├──▶ scaleManager.evaluateScaleEligibility({ roas, ctr, cpc })
    │       │
    │       ├── canScale: true     → return "SCALE_UP"
    │       └── canScale: false    → continue ↓
    │
    └──▶ roas < 1?
            ├── yes → metaApi.pauseCampaign() → return "stopped"
            └── no  → return "CONTINUE"
```

## 4. Scale-Up Flow

```
ScaleManager.duplicateCampaign(accountId, sourceCampaignId, interests)
    │
    ├──▶ metaApi.getCampaigns() → find source
    ├──▶ metaApi.createCampaign(PAUSED) → new campaign
    ├──▶ metaApi.createAdSet(new interests) → new adset
    └──▶ RETURN { campaignId, adsetId, requiresManualActivation: true }

ScaleManager.expandHiddenInterests(product, currentInterests)
    │
    ├──▶ llmClient.generate(prompt) → competitor brands, media, activities
    └──▶ RETURN filtered interests (exclude current)

ScaleManager.discoverBudgetCap(currentBudget, roasIsDropping)
    │
    ├── roasIsDropping → HOLD
    └── find next in ladder [200k, 500k, 1M, 2M, 5M, 10M]
        └── RETURN INCREASE
```

## 5. Stoploss Cascade

```
evaluateStoploss(params)
    │
    ├── ROAS drop < 30%?     → MONITOR
    ├── ROAS drop >= 30%?
    │   ├── consecutiveDrops == 1 → WAIT (fluktuasi normal)
    │   ├── consecutiveDrops == 2 → REDUCE_BUDGET (potong 50%)
    │   └── consecutiveDrops >= 3 → KILL (matikan campaign)
    │
    └── canIncreaseBudget(roasIsDropping)?
        ├── true  → budget increase OK
        └── false → "Jangan pernah tambah budget saat ROAS turun"
```

## 6. Cross-Project Integration

```
┌──────────────┐     POST /api/content/generate-video     ┌──────────────┐
│   1ai-ads    │ ─────────────────────────────────────────▶│  1ai-content │
│ (Express)    │◀──────────────────────────────────────────│ (Fastify)    │
│              │     { jobId, status, videoUrl }           │              │
└──────┬───────┘                                           └──────────────┘
       │
       │  POST /api/social/post
       ▼
┌──────────────┐                                           ┌──────────────┐
│  1ai-social  │ ─────────────────────────────────────────▶│   GoLogin    │
│ (FastAPI)    │     { profileId, pageId, content }        │   Browser    │
└──────────────┘                                           └──────────────┘
```

## 7. SRP Service Decomposition (T12)

```
BEFORE: AutonomousAgent (500+ lines, 5 concerns)
    ├── Facebook OAuth
    ├── Rule Engine
    ├── Campaign Actions
    ├── Monitoring Loop
    └── Daily Reports

AFTER:
    AutonomousAgent (thin orchestrator, ~100 lines)
        ├── FacebookConnectionService (OAuth + accounts)
        ├── RuleEvaluator (rules + actions)
        ├── CampaignReporter (reports + stats)
        └── (workflow/scale delegated to WorkflowEngine/ScaleManager)
```

## 8. Local Deployment Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Docker Compose                         │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ 1ai-ads  │  │1ai-social│  │1ai-content│              │
│  │ :3000    │  │ :8000    │  │ :3001     │              │
│  └────┬─────┘  └────┬─────┘  └────┬──────┘              │
│       │              │              │                     │
│  ┌────┴─────┐  ┌────┴─────┐  ┌────┴──────┐             │
│  │  SQLite  │  │PostgreSQL│  │PostgreSQL  │             │
│  │  (vol)   │  │  Redis   │  │  Redis     │             │
│  └──────────┘  └──────────┘  └────────────┘             │
│                                                          │
│  ┌──────────────────────────────────────────────┐       │
│  │           OpenClaw (MCP Client)               │       │
│  │  connects to 1ai-ads MCP server on :3000      │       │
│  └──────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────┘
```
