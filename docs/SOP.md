# 🛡️ VILONA META ADS — GLOBAL SOP

> Last updated: 2026-06-22 WIB
> Berlaku untuk: 3 akun aktif

---

## 1. AD ACCOUNTS

| Account ID | Nama |
|------------|------|
| `act_435670549443081` | 0858 |
| `act_380721031313330` | 1041 |
| `act_1181078009580337` | 1340 |

**Config**: `config/satpam.py` → `SatpamConfig.AD_ACCOUNTS`

---

## 2. SPEND CAP (per akun)

| Parameter | Value |
|-----------|-------|
| Total spend harian | **Rp 300.000** per akun |
| Scope | Semua campaign aktif digabung |
| Aksi saat cap terlewati | Pause semua campaign aktif (kecuali OFF_) |

**Config**: `config/satpam.py` → `SatpamConfig.SPEND_CAP_PER_ACCOUNT`
**Implementation**: `scheduler/rules/satpam.py` → `evaluate_spend_cap()`

---

## 3. SATPAM RULES (CPR = Cost Per Outbound Click)

**Result** = Outbound Clicks (link clicks to website)
**CPR** = Cost Per Outbound Click = `spend / outbound_clicks`
**Data window**: Last 7 days (excluding today) untuk evaluasi, real-time untuk spend cap

| # | Kondisi | Aksi | Catatan |
|---|---------|------|---------|
| 1 | CPR 7d < 130 **AND** Result > 1 | ✅ **ON** | Kecuali OFF_ |
| 2 | CPR > 130 **AND** Result > 5 | ❌ **OFF (PAUSE)** | Kecuali OFF_ |
| 3 | Result > 0 **AND** CPR < 130 | ✅ **ON** | Kecuali OFF_ |
| 4 | Spend > 130 **AND** Result = 0 | ❌ **OFF (PAUSE)** | Kecuali OFF_ |

**Config**: `config/satpam.py` → `SatpamConfig.CPR_THRESHOLD`, `SPEND_KILL_THRESHOLD`
**Implementation**: `scheduler/rules/satpam.py` → `evaluate_campaign()`

---

## 4. RULE DETAIL

### Rule 1: Re-Activation (CPR 7d bagus)
- **Kondisi**: Campaign PAUSED + CPR last 7d (excl today) < Rp 130 + clicks > 1
- **Aksi**: Resume campaign
- **Note**: Hanya campaign yang di-pause oleh satpam, bukan manual
- **Code**: `scheduler/rules/satpam.py` → `rule_1_reactive()`

### Rule 2: Stop-Loss (CPR mahal + banyak hasil)
- **Kondisi**: Campaign ACTIVE + CPR > Rp 130 + clicks > 5
- **Aksi**: Pause campaign
- **Note**: Campaign sudah banyak spending tapi gak efisien
- **Code**: `scheduler/rules/satpam.py` → `rule_2_stop_loss()`

### Rule 3: Re-Activation (ada hasil + CPR bagus)
- **Kondisi**: Campaign PAUSED + clicks > 0 + CPR < Rp 130
- **Aksi**: Resume campaign
- **Note**: Subset dari Rule 1, covers campaign dengan 1 click
- **Code**: `scheduler/rules/satpam.py` → `rule_3_reactive_clicks()`

### Rule 4: Early Kill (spending tanpa hasil)
- **Kondisi**: Campaign ACTIVE + spend > Rp 130 + clicks = 0
- **Aksi**: Pause campaign
- **Note**: Buang campaign yang gak menghasilkan
- **Code**: `scheduler/rules/satpam.py` → `rule_4_early_kill()`

---

## 5. NAMING CONVENTION

| Prefix | Arti | Action |
|--------|------|--------|
| `🌟_` | WINNER | Scale candidate — manual clone |
| *(no prefix)* | Normal | KEEP |
| `OFF_` | Sampah permanen | 🚫 NEVER TOUCH |
| `DEAD_` | Trash | Bisa dihapus |

**Implementation**: `scheduler/common.py` → `CampaignData.is_off`

---

## 6. HARD RULES

1. **OFF_ = HARAM disentuh** — jangan pause/resume/rename
   - **Code**: `scheduler/rules/satpam.py` → `should_skip()`

2. **Total spend cap Rp 300K/hari per akun** — pause semua saat cap terlewati
   - **Code**: `scheduler/rules/satpam.py` → `evaluate_spend_cap()`

3. **CPR threshold = Rp 130** — batas efisiensi
   - **Config**: `config/satpam.py` → `SatpamConfig.CPR_THRESHOLD`

4. **Hanya resume campaign yang di-pause oleh satpam**, bukan manual
   - **Code**: `scheduler/common.py` → `GuardBase.is_guard_paused()`

5. **Token dibaca dari DB**, bukan hardcoded
   - **Code**: `scheduler/common.py` → `GuardBase.get_token_for_account()`

---

## 7. REPORT FORMAT (tiap 5m)

```
🛡️ SATPAM {ACCOUNT_ID} {timestamp}
ACTIVE:{n} | PAUSED:{n} | Spend:Rp{x}/300K

CPR (7d avg): Rp{x}

⚡ RE-ACTIVE: {list (Rule 1/3)}
🛑 PAUSED: {list (Rule 2/4)}
🚨 SPEND CAP: {list if cap hit}

Aksi: {ringkasan}
```

**Implementation**: `scheduler/notifier.py` → `Notifier.send_action_alert()`

---

## 8. META API FIELDS

```
insights:
  - campaign_id
  - spend
  - outbound_clicks (result = link clicks)
  - cost_per_outbound_click (CPR)

campaigns:
  - id, name, status
```

**Implementation**: `scheduler/insights.py` → `parse_campaign_row()`

---

## 9. SCHEDULE

| Job | Interval | File |
|-----|----------|------|
| Realtime Guard | Every 5 min | `scheduler/realtime_guard.py` |
| Daily Eval Guard | 01:00 WIB | `scheduler/daily_eval_guard.py` |
| Bid Satpam | Every 5 min | `scheduler/bid_satpam.py` |
| Spend Guard | Every 5 min | `scheduler/spend_guard.py` |
| Daily Dashboard | 07:00 WIB | `scheduler/daily_dashboard.py` |

**Config**: `scheduler/jobs.py` → `init_scheduler()`

---

## 10. TESTING

| Test Type | File | Coverage |
|-----------|------|----------|
| Unit Tests | `tests/test_satpam_rules.py` | 37 tests, 100% rule coverage |
| Integration Tests | `tests/test_guard_integration.py` | 13 tests, 90%+ guard coverage |

**Run tests**: `pytest tests/ -v`

---

## 11. MONITORING

### Metrics
- `satpam_campaign_actions_total` - Total actions taken
- `satpam_guard_duration_seconds` - Guard execution time
- `satpam_spend_cap_violations_total` - Spend cap hits
- `satpam_api_calls_total` - Meta API calls

**Implementation**: `scheduler/metrics.py` → `MetricsCollector`

### Health Checks
- Redis connection
- Meta token validity
- Scheduler status

**Implementation**: `scheduler/health.py` → `HealthChecker`
**Endpoint**: `GET /health`

### Logging
- Structured JSON logs
- Campaign-level context
- Performance metrics

**Implementation**: `scheduler/logging.py` → `setup_structured_logging()`
