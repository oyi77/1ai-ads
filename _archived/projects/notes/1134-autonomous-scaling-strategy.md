# 1134 Malaysia — Autonomous Scaling Strategy
> Vilona Full Auto-Manage System — No human intervention needed
> Created: 3 June 2026

---

## 🎯 SCALING UP (Vertical — maximize winning campaigns)

### Tier 1: Budget Ladder (Auto)
```
Level  | Trigger                    | Budget Range  | Scale Rule
───────┼────────────────────────────┼───────────────┼─────────────
L0     | New campaign               | Rp 25K-40K    | TEST mode, 3 days
L1     | CPC ≤ 250 + CTR ≥ 5%       | Rp 40K-70K    | GAS +20% per check
L2     | L1 sustained 24h + ROAS≥2x | Rp 70K-120K   | GAS +20% per check
L3     | L2 + CTR ≥ 7% + CPC ≤ 180  | Rp 120K-180K  | GAS+ +30% per check
L4     | L3 + ROAS≥3x for 3 days    | Rp 180K-250K  | Manual review flag
MAX    | Category cap hit           | per category  | STOP scaling
```

### Tier 2: Daily Budget Ceiling per Campaign
| Kategori | L0 (Test) | L1 | L2 | L3 | L4 (Max) |
|----------|-----------|----|----|----|-----------|
| Home/Kitchen | Rp 30K | Rp 50K | Rp 90K | Rp 150K | Rp 200K |
| Fashion | Rp 30K | Rp 45K | Rp 80K | Rp 120K | Rp 150K |
| Kids/Baby | Rp 25K | Rp 40K | Rp 70K | Rp 100K | Rp 120K |
| Beauty | Rp 30K | Rp 45K | Rp 80K | Rp 120K | Rp 150K |
| Electronics | Rp 30K | Rp 50K | Rp 90K | Rp 150K | Rp 180K |
| Health | Rp 25K | Rp 45K | Rp 80K | Rp 120K | Rp 150K |
| Food | Rp 25K | Rp 40K | Rp 70K | Rp 100K | Rp 120K |
| Default | Rp 25K | Rp 40K | Rp 70K | Rp 100K | Rp 120K |

### Tier 3: Acceleration Events
```
Event                          | Action
───────────────────────────────|────────────────────
CPC drop 30%+ hour-over-hour   | Force GAS regardless of time
CTR spike 2x+ baseline         | Skip cooldown, scale now
ROAS ≥ 5x for 24h              | Jump 2 budget tiers directly
Weekend performance > weekday  | Auto-increase hard cap +20%
```

---

## 🌐 SCALING OUT (Horizontal — expand to new products/audiences)

### Phase 1: Clone Winners (Auto, after L2 reached)
```
1. Identify WINNER campaign (L2+, ROAS ≥ 2x)
2. Create CLONE with:
   - Same product, different creative angle
   - Same budget (L1 starting)
   - Different ad format (if original is video → clone as carousel)
   - Different headline
3. Max 2 clones per winner
4. Original + clone share combined budget pool
```

### Phase 2: Audience Expansion (Auto)
```
When campaign reaches L2:
  1. Create Lookalike audience from purchasers (1%, 3%, 5%)
  2. Launch parallel TEST campaign with LAL audiences at L0 budget
  3. If LAL outperforms → promote, demote original interest-based
  4. Auto-rotate interests every 7 days for stale campaigns
```

### Phase 3: Multi-Product Matrix
```
Priority: Home/Kitchen > Fashion > Beauty > Kids > Electronics > Health

Rule:
- Max 3 active products simultaneously
- Rotate lowest performer every 7 days
- New product gets 3-day TEST window at Rp 30K/day
- If CPC > Rp 500 in first 24h → kill immediately
- If no conversions in 48h → kill
```

### Phase 4: Cross-Border Insights
```
If 1134 campaign succeeds with Product X:
  → Flag for 1041 (Indonesia) testing
  → Apply winning interests with local adjustments
  → Share creative templates between accounts
```

---

## 🤖 FULL AUTONOMOUS BEHAVIOR

### Auto-Actions (NO permission needed):
| Action | Trigger | Frequency |
|--------|---------|-----------|
| Scale winning campaigns | Governor GAS rules | Every 15 min |
| Pause bad campaigns | Governor REM rules | Every 15 min |
| Pause all (hard cap breach) | Spend > Rp 400K/day | Immediate |
| Reactivate paused winners | CPC dropped below threshold | Hourly check |
| Budget redistribution | Moving budget from dead to winners | Every 4 hours |
| Creative rotation alert | CTR < 2% for 2h | Auto-flag |
| Weekend mode toggle | Friday 23:00 / Monday 05:00 | Weekly |

### Auto-Reports (to Veris):
| Report | Frequency | Content |
|--------|-----------|---------|
| Hourly pulse | Every hour | Spend, CPC, active campaigns |
| Scaling log | On scale event | What scaled, from/to, reason |
| Kill log | On pause event | What paused, CPC, reason |
| Daily summary | 21:00 WIB | Full day performance |
| Weekly review | Monday 09:00 | Winners, losers, recommendations |

### Guardian Rules:
```
1. NEVER unpause OFF_ campaigns (Veris overrides only)
2. Never exceed Rp 400K daily hard cap
3. Never scale same campaign within 2h cooldown
4. Never scale during 23:00-05:00 WIB
5. Never create campaigns without Veris approval
6. Only scale LC_ (Lowest Cost) campaigns
7. Maximum 3 active products at once
```

---

## 📊 PERFORMANCE BANDS

### Campaign Health Score (Auto-calculated):
```
Score = (CTR × 10) + (1/CPC × 1000) + (ROAS × 20)

> 100: GOLD 🥇  — Aggressive scale, protect at all costs
 70-100: GREEN ✅ — Standard scale, monitor
 40-70: YELLOW ⚠️ — Hold, optimize creative
 20-40: ORANGE 🟠 — Reduce budget 20%, test new creative
 < 20: RED 🔴    — Kill within 24h if no improvement
```

### Budget Allocation Algorithm:
```
Total pool: Rp 400K/day

1. GOLD campaigns: 50% of pool (Rp 200K)
2. GREEN campaigns: 30% of pool (Rp 120K)
3. YELLOW campaigns: 15% of pool (Rp 60K)
4. ORANGE campaigns: 5% of pool (Rp 20K)
5. RED: 0% — paused

Auto-rebalance every 4 hours.
```

---

## 🔄 RECOVERY PROTOCOLS

### Governor Crash Recovery:
```
1. Systemd auto-restart (if configured)
2. Cron fallback: runs every 15 min regardless
3. State preserved in /tmp/1134_governor_state.json
4. On recovery: check last run time
   - If < 30 min gap → resume normal
   - If > 2h gap → conservative mode (no scales for 1 cycle)
   - If > 6h gap → full audit, report to Veris
```

### Token Expiry Recovery:
```
1. Governor detects API error
2. Log error + timestamp
3. Alert: "Token expired for 1134"
4. Try auto-refresh via system token
5. If failed 3x → escalate to Veris
```

### Spend Anomaly Detection:
```
If spend suddenly drops >50% hour-over-hour:
  → Check: account paused? campaign paused? billing issue?
  → Auto-fix: unpause if accidentally paused
  → Alert if can't fix

If spend suddenly spikes >2x:
  → Immediate PAUSE ALL (potential runaway)
  → Audit: what caused it?
  → Report to Veris before resuming
```

---

## 📈 MILESTONES & TARGETS

### Month 1 (Learning):
- Find 2-3 profitable products
- Stabilize avg CPC below Rp 350
- Achieve ROAS ≥ 1.5x on 50%+ campaigns
- Daily spend: Rp 100-200K

### Month 2 (Scaling):
- Scale winners to L3 budget levels
- ROAS ≥ 2.0x on winning campaigns
- Daily spend: Rp 200-400K
- Expand to 5+ active products

### Month 3 (Dominating):
- Consistent ROAS ≥ 2.5x
- Daily spend: Rp 400K (hard cap)
- Consider hard cap increase to Rp 600K
- Cross-border insights feeding Indonesia campaigns

---

*Autonomous by Vilona — zero human touch needed for day-to-day ops*
*Veris hanya perlu review laporan harian + approve campaign baru*
