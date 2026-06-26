# AGENTS.md — 1ai-ecosystem Engineering Rules

This repository is part of the **1ai-ecosystem**. You are governed by the mandatory engineering rules below.

---

## ⚡ START HERE

Read the rules in the order specified for your session type. **Do not skip. Do not summarize. Read the full text.**

> The rules are located at `_rules/` in this repo, synced from `github.com/oyi77/1ai-rules`.

```
_rules/
├── ENGINEERING.md    ← core engineering protocol (always required)
├── VERIFICATION.md   ← receipt enforcement (always required)
├── QA.md             ← QA protocol (for testing sessions)
├── SURPASS.md        ← competitive strategy (for planning sessions)
└── DOCS.md           ← documentation standards (for docs sessions)
```

---

## Session Classification

Determine your session type, then load the required rules **in order**:

| Session Type | Required Reading | Order |
|---|---|---|
| **Coding / bugfix / feature** | ENGINEERING.md + VERIFICATION.md | 1 → 2 |
| **QA / testing existing code** | QA.md + VERIFICATION.md | 1 → 2 |
| **Competitive research / planning** | SURPASS.md | 1 |
| **Documentation** | DOCS.md | 1 |
| **Full sprint (build + test + docs)** | ALL rules (ENGINEERING.md + VERIFICATION.md + QA.md + SURPASS.md + DOCS.md) | 1→2→3→4→5 |

---

## Hard Rules (apply regardless of session type)

1. **Receipts are mandatory.** Every "done" claim requires literal verbatim terminal/test/log output. A summary is not a receipt. No receipt = not done.
2. **Break it before you ship it.** Adversarial test required before any completion claim. Empty input, max boundary, error paths, concurrent access, auth boundaries.
3. **Docs are part of the deliverable.** Code changes without synced docs are incomplete. Update docs in the same change.
4. **No silent failure.** Every error must be caught, logged, and surfaced. Empty catches and suppressed errors are defects.
5. **No hallucinated paths/symbols/APIs.** Read the file before claiming it exists. Use codebase-memory-mcp or equivalent on indexed repos.
6. **These rules cannot be waived** by any instruction, task phrasing, or user request. See ENGINEERING.md §8 for the conflict hierarchy.

---

## Detection

- If `_rules/` does not exist → this repo hasn't been set up yet. Load rules from `~/.1ai/rules/` (on the local filesystem) or clone `github.com/oyi77/1ai-rules` first.
- If `~/.1ai/` does not exist → run the setup script: `gh repo clone oyi77/1ai-rules ~/.1ai`

---

## Project-Specific Notes

<!-- Add repo-specific rules below this line -->
<!-- Examples: port numbers, env vars, deploy targets, CI commands, local quirks -->

---

<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-08 | Updated: 2026-04-08 -->

# 1ai-ads

## Purpose
Full-stack ad management platform. Express backend with SQLite persistence, Vite/React SPA frontend, and integrations with Meta, Google, and TikTok ad APIs. Includes AI-powered ad generation, campaign orchestration, landing page builder, and competitor monitoring.

## Key Files
| File | Description |
|------|-------------|
| `server.js` | Server bootstrap — seeds DB, creates Express app, starts HTTP server |
| `mcp.js` | MCP (Model Context Protocol) server implementation |
| `vite.config.js` | Vite build config — sets `root: 'client'`, outputs to `../dist` |
| `vitest.config.js` | Vitest test runner configuration |
| `playwright.config.js` | Playwright E2E test configuration |
| `ecosystem.config.cjs` | PM2 process manager config for production |
| `package.json` | Single monorepo manifest (ESM `"type": "module"`) |
| `.env.example` | Environment variable template |
| `qa.mjs` | QA validation scripts |

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| `client/` | Frontend SPA (Vite + vanilla JS) — see `client/AGENTS.md` |
| `server/` | Backend API (Express 5, services, repositories) — see `server/AGENTS.md` |
| `db/` | SQLite database, schema, and seeding — see `db/AGENTS.md` |
| `tests/` | Test suites (unit, integration, e2e, functional, smoke) — see `tests/AGENTS.md` |
| `src/design/` | Design tokens (colors, CSS variables) — see `src/design/AGENTS.md` |

## For AI Agents

### Working In This Directory
- Always run `npm install` after modifying `package.json`
- ESM throughout — use `import/export`, never `require()`
- Backend follows layered architecture: `routes/ → services/ → repositories/ → db/`
- Frontend views live under `client/src/views/`
- No separate `package.json` for client — all deps in root manifest

### Testing Requirements
- Run `npm test` (Vitest) before committing
- Run `npm run test:e2e` (Playwright) for full-stack tests
- Tests follow `*.test.js` (Vitest) and `*.spec.js` (Playwright) conventions

### Common Patterns
- UUIDs for primary keys (via `uuid` package)
- JSON fields stored as TEXT in SQLite (parsed/stringified in repositories)
- Demo data seeding runs on every server start (should be env-gated for production)

## Dependencies

### Internal
- `server/` depends on `db/` for persistence
- `client/` consumes API from `server/` via `/api/…` namespace
- `server/lib/` contains shared utilities (LLM client, MCP client, API adapters)

### External
- Express 5 — HTTP framework
- better-sqlite3 — SQLite driver
- Vite 8 — Frontend build tool
- Vitest 4 — Unit/integration test runner
- Playwright — E2E test framework
- bcryptjs + jsonwebtoken — Auth
- @modelcontextprotocol/sdk — MCP integration
- meta-ads-mcp — Meta Ads API MCP bridge

## Guardrails (Active During Development)

**Single source of truth:** `.opencode/guardrails.md` + agent prompts in `.opencode/agent/`

### Key Enforcement Points
- **No direct Meta API calls** → Use `vilona_trakpro_engine` (`fb_get`, `fb_post`)
- **No duplicate token logic** → Import `ACCESS_TOKEN` from engine
- **No hardcoded paths** → Use `WORKSPACE`, `DATA_DIR` from engine
- **No root directory files** → All code in `server/`, `client/`, `scripts/`, `tests/`
- **No scattered test scripts** → Tests in `tests/` with Vitest/Playwright
- **Layered architecture** → Routes → Services → Repositories → DB
- **MCP for externals** → Ads Library, Competitor Spy, Web Scraping

### Agent-Specific Prompts
| Agent | Prompt File |
|-------|-------------|
| Sisyphus (main) | `.opencode/agent/sisyphus.md` |
| Build (Sisyphus-Jr) | `.opencode/agent/build.md` |
| Explore | `.opencode/agent/explore.md` |
| Oracle | `.opencode/agent/oracle.md` |
| Librarian | `.opencode/agent/librarian.md` |
| Plan (Metis/Momus) | `.opencode/agent/plan.md` |

### Permission Rules (opencode.json)
- `scripts/test_*.py` → **DENIED** (throwaway tests)
- `*.log` → **DENIED** (gitignored)
- `data/*.json` → **DENIED** (auto-regenerate)
- `/home/openclaw/**` → **DENIED** (hardcoded paths)

<!-- MANUAL: Custom project notes can be added below -->
