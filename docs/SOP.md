# 🛡️ AdForge Operational SOP — Guard / Spend-Cap / Approval

> **Refreshed:** 2026-08-28. **IMPORTANT:** the prior version described a **Python `scheduler/satpam.py` + `config/satpam.py`** system that **does not exist in this Node repo**. This rewrite maps those guard concepts onto the **actual** AdForge implementation (`server/services/draft-service.js`, `auto-optimizer.js`, `rule-evaluator.js`, bot cron).

---

## 1. What This Repo Actually Has (guard model)
AdForge's safety model is **approval-first + audit**, not a standalone Python satpam:

| Concept (old SOP) | Actual implementation |
|---|---|
| `SatpamConfig.SPEND_CAP` | `auto-optimizer.js` budget guard + per-platform `daily_spend_cap` (e.g. Pinterest `createCampaign`) |
| `SatpamConfig.CPR_THRESHOLD` | **Not implemented as hard CPR rule** — optimization is user-authored rules (`rule-evaluator.js` compound `{all}/{any}`) |
| `scheduler/rules/satpam.py evaluate_campaign()` | `auto-optimizer.js` + `domain/optimization.js` (stoploss/scale/dayparting) |
| `GuardBase.is_guard_paused()` | `draft-service.js:102 guardAutonomousChange()` — gates autonomous mutations |
| `Notifier.send_action_alert()` | `server/bot/scheduler.js` Telegram digest/alert jobs |
| `should_skip()` (OFF_ prefix) | naming convention — enforce in rule conditions, not a separate module |

> **Gap:** there is **no built-in CPR/spend-cap auto-pause** like the old SOP. If you need it, implement as a `rule-evaluator` rule (IF spend > X AND roas < Y → pause) or extend `auto-optimizer.js`. Tracked as a potential T-item.

---

## 2. Spend Cap (recommended config)
Set per-platform daily caps at account connect (UI) or via `daily_spend_cap` in create calls. Bot cron monitors spend every 5 min (`scheduler.js`).

## 3. Approval-First Rules (the real "satpam")
Users define compound rules in dashboard/bot:
```
IF roas < 1.0 AND active > 3d  → PAUSE (draft action → owner approves)
IF ctr < 2% AND spend > 50K    → SCALE DOWN (draft → approve)
```
`rule-evaluator.js` evaluates `{all}/{any}` nested (depth ≤3). Autonomous tier (optional) executes without approval after N verified actions — see `GAP-RESOLUTION-PLAN.md` T3.

## 4. Naming Convention (keep)
| Prefix | Meaning | Action |
|--------|---------|--------|
| `🌟_` | Winner | Scale candidate (manual clone) |
| *(none)* | Normal | Keep |
| `OFF_` | Permanent dead | Never touch (encode in rule `should_skip`) |
| `DEAD_` | Trash | Deletable |

## 5. Hard Rules
1. `OFF_` never auto-touched — exclude in rule conditions.
2. Spend cap enforced per account — pause all on breach.
3. Token from DB (`resolve-owner-platform.js`), never hardcoded.
4. Every mutation → **audit log** (`middleware/audit.js`, body+redaction).
5. No action without owner approval **by default** (autonomous tier opt-in, audited).

## 6. Schedule (bot cron — 11 jobs, `server/bot/scheduler.js`)
| Job | Interval | Purpose |
|-----|----------|---------|
| Token health fan-out | `0 */6 * * *` | multi-platform token check |
| Campaign monitor / anomaly | `*/5 * * * *` | detect + alert |
| Billing expiry | `0 0 * * *` | downgrade expired Pro |
| Daily digest | `0 18 * * *` | Telegram recap |
| Backup | `0 */6 * * *` | DB backup |
| Auto-scale | triggered | by monitor |

## 7. Monitoring
- `curl /health` (healthcheck in docker-compose)
- `pm2 logs 1ai-ads`
- Telegram owner chat for digests/alerts
- Audit log table for every action

## 8. Testing
```bash
npm test            # 1867 tests (verified)
npm run test:smoke  # boot
```
