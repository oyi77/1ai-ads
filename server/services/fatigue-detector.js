import { createLogger } from '../lib/logger.js';
import { bus, EVENTS } from '../lib/event-bus.js';
import { v4 as uuid } from 'uuid';
import { MetaAdsAPI } from '../services/meta/index.js';
import { resolveOwnerPlatformToken } from '../lib/resolve-owner-platform.js';

const log = createLogger('fatigue-detector');

const BATCH_SIZE = 50;
const BATCH_DELAY_MS = 1000;
const SNAPSHOT_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * CreativePerformanceRepository — thin wrapper around the creative_performance table.
 */
class CreativePerformanceRepository {
  constructor(db) {
    this.db = db;
  }

  upsert(row) {
    this.db.prepare(`
      INSERT INTO creative_performance (id, ad_id, campaign_id, platform, snapshot_date, impressions, clicks, spend, conversions, ctr, cpc, frequency, reach, hook, body, image_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(ad_id, snapshot_date) DO UPDATE SET
        impressions = excluded.impressions,
        clicks = excluded.clicks,
        spend = excluded.spend,
        conversions = excluded.conversions,
        ctr = excluded.ctr,
        cpc = excluded.cpc,
        frequency = excluded.frequency,
        reach = excluded.reach,
        hook = excluded.hook,
        body = excluded.body,
        image_hash = excluded.image_hash
    `).run(
      row.id, row.ad_id, row.campaign_id, row.platform, row.snapshot_date,
      row.impressions, row.clicks, row.spend, row.conversions,
      row.ctr, row.cpc, row.frequency, row.reach,
      row.hook, row.body, row.image_hash
    );
  }

  findByAdId(adId, lookbackDays = 7) {
    return this.db.prepare(`
      SELECT * FROM creative_performance
      WHERE ad_id = ? AND snapshot_date >= date('now', ?)
      ORDER BY snapshot_date ASC
    `).all(adId, `-${lookbackDays} days`);
  }

  findByAccountId(accountId, lookbackDays = 7) {
    return this.db.prepare(`
      SELECT * FROM creative_performance
      WHERE snapshot_date >= date('now', ?)
      ORDER BY ad_id, snapshot_date ASC
    `).all(`-${lookbackDays} days`);
  }
}
export class FatigueDetector {
  constructor(metaApi, db, opts = {}) {
    const { creativeStudio, abTestService, platformAccountsRepo, settingsRepo } = opts;
    this.meta = metaApi;
    this.db = db;
    this.creativeStudio = creativeStudio;
    this.abTestService = abTestService;
    this.repo = new CreativePerformanceRepository(db);
    this._interval = null;
    this._subscriptions = [];
    this.platformAccountsRepo = platformAccountsRepo || null;
    this.settingsRepo = settingsRepo || null;
  }

  /**
   * Resolve a per-owner MetaAdsAPI client. Background system loops (no ownerId)
   * fall back to the default this.meta so DB-driven sweeps still work.
   */
  _metaApiForOwner(ownerId) {
    if (!ownerId) return this.meta;
    const token = resolveOwnerPlatformToken('meta', ownerId, {
      platformAccountsRepo: this.platformAccountsRepo,
      settingsRepo: this.settingsRepo,
    });
    if (!token) return this.meta;
    return MetaAdsAPI.withToken(token);
  }

  /**
   * Start periodic snapshot monitoring + subscribe to refresh events.
   */
  start() {
    log.info('Starting fatigue detector');

    // Run an initial snapshot, then every 6h
    this._runSnapshots().catch(err => log.error('Initial snapshot failed', { error: err.message }));
    this._interval = setInterval(() => {
      this._runSnapshots().catch(err => log.error('Periodic snapshot failed', { error: err.message }));
    }, SNAPSHOT_INTERVAL_MS);

    // Subscribe to CREATIVE_REFRESH_NEEDED for auto-flow
    const unsub = bus.onEvent(EVENTS.CREATIVE_REFRESH_NEEDED, (data) => {
      if (data.severity === 'critical' && this.creativeStudio && this.abTestService) {
        this.autoRefreshCreative(data).catch(err =>
          log.error('Auto-refresh failed', { error: err.message, adId: data.adId })
        );
      }
    });
    this._subscriptions.push(unsub);
  }

  /**
   * Stop periodic monitoring and unsubscribe.
   */
  stop() {
    log.info('Stopping fatigue detector');
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
    for (const unsub of this._subscriptions) unsub();
    this._subscriptions = [];
  }

  /**
   * Snapshot all creatives for an account into the creative_performance table.
   * Batches Meta API calls in groups of 50 with 1s delay between batches.
   */
  async snapshotCreatives(accountId, { ownerId } = {}) {
    log.info('Snapshotting creatives', { accountId });

    const meta = this._metaApiForOwner(ownerId);
    const ads = await meta.getAds(accountId);
    if (!ads || ads.length === 0) {
      log.info('No ads found', { accountId });
      return 0;
    }

    let snapshotted = 0;

    // Process in batches of BATCH_SIZE
    for (let i = 0; i < ads.length; i += BATCH_SIZE) {
      const batch = ads.slice(i, i + BATCH_SIZE);

      const results = await Promise.allSettled(
        batch.map(ad => this._snapshotOneAd(ad, accountId, meta))
      );

      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) snapshotted++;
      }

      // Delay between batches to respect rate limits
      if (i + BATCH_SIZE < ads.length) {
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }

    log.info('Snapshot complete', { accountId, snapshotted, total: ads.length });
    return snapshotted;
  }

  /**
   * Return stored creative performance history for a specific ad.
   * Delegates to the creative_performance repository (keyed by ad_id).
   */
  async getHistory(adId, { _ownerId } = {}) {
    return this.repo.findByAdId(adId);
  }

  async _snapshotOneAd(ad, accountId, meta) {
    try {
      const insights = await meta.apiGet(`/${ad.id}/insights`, {
        fields: 'impressions,clicks,spend,actions,ctr,cpc,reach,frequency',
        date_preset: 'today',
      });

      const raw = insights.data?.[0];
      if (!raw) return null;

      const actions = this._extractConversions(raw.actions || []);
      const impressions = parseInt(raw.impressions || 0);
      const clicks = parseInt(raw.clicks || 0);
      const spend = parseFloat(raw.spend || 0);

      this.repo.upsert({
        id: uuid(),
        ad_id: ad.id,
        campaign_id: accountId,
        platform: 'meta',
        snapshot_date: new Date().toISOString().slice(0, 10),
        impressions,
        clicks,
        spend,
        conversions: actions,
        ctr: parseFloat(raw.ctr || 0),
        cpc: parseFloat(raw.cpc || 0),
        frequency: parseFloat(raw.frequency || 0),
        reach: parseInt(raw.reach || 0),
        hook: ad.creative?.title || null,
        body: ad.creative?.body || null,
        image_hash: null,
      });

      return ad.id;
    } catch (err) {
      log.debug('Failed to snapshot ad', { adId: ad.id, error: err.message });
      return null;
    }
  }

  /**
   * Detect fatigued creatives using multi-signal analysis.
   * Uses adaptive baselines: rolling 7-day average, z-score detection (>2σ),
   * and linear regression trend analysis (R²>0.5).
   */
  async detectFatigue(accountId, {
    _ownerId,
    lookbackDays = 7,
    frequencyThreshold = 3.0,
    ctrDropPercent = 30,
  } = {}) {
    log.info('Detecting fatigue', { accountId, lookbackDays });

    const allRows = this.repo.findByAccountId(accountId, lookbackDays);
    if (!allRows.length) {
      log.info('No performance data for fatigue detection', { accountId });
      return [];
    }

    // Group by ad_id
    const byAd = new Map();
    for (const row of allRows) {
      if (!byAd.has(row.ad_id)) byAd.set(row.ad_id, []);
      byAd.get(row.ad_id).push(row);
    }

    const results = [];

    for (const [adId, history] of byAd) {
      if (history.length < 2) continue;

      const signals = [];
      const latest = history[history.length - 1];

      // Signal 1: High Frequency (P75 threshold)
      const frequencies = history.map(h => h.frequency).filter(f => f > 0);
      if (frequencies.length > 0) {
        const p75 = this._percentile(frequencies, 0.75);
        const threshold = Math.max(p75, frequencyThreshold);
        if (latest.frequency >= threshold) {
          signals.push({
            type: 'high_frequency',
            value: latest.frequency,
            threshold,
            detail: `Frequency ${latest.frequency.toFixed(1)} exceeds P75 threshold ${threshold.toFixed(1)}`,
          });
        }
      }

      // Signal 2: CTR Decay (z-score based, >2σ)
      const ctrs = history.map(h => h.ctr).filter(c => c > 0);
      if (ctrs.length >= 3) {
        const avg = this._calculateMovingAverage(ctrs, ctrs.length);
        const stdDev = this._calculateStdDev(ctrs);
        if (stdDev > 0) {
          const zScore = (ctrs[ctrs.length - 1] - avg) / stdDev;
          if (zScore < -2) {
            const dropPct = avg > 0 ? ((avg - ctrs[ctrs.length - 1]) / avg) * 100 : 0;
            if (dropPct >= ctrDropPercent) {
              signals.push({
                type: 'ctr_decay',
                value: ctrs[ctrs.length - 1],
                baseline: avg,
                zScore: zScore.toFixed(2),
                dropPercent: dropPct.toFixed(1),
                detail: `CTR dropped ${dropPct.toFixed(1)}% (z=${zScore.toFixed(2)}, >2σ below mean)`,
              });
            }
          }
        }
      }

      // Signal 3: CPA Inflation (>50% increase vs baseline)
      const spends = history.map(h => h.spend);
      const conversionsArr = history.map(h => h.conversions);
      const cpas = spends.map((s, i) => conversionsArr[i] > 0 ? s / conversionsArr[i] : null).filter(c => c !== null);
      if (cpas.length >= 3) {
        const baselineCpa = this._calculateMovingAverage(cpas.slice(0, Math.ceil(cpas.length / 2)), undefined);
        const currentCpa = cpas[cpas.length - 1];
        if (baselineCpa > 0 && currentCpa > 0) {
          const inflationPct = ((currentCpa - baselineCpa) / baselineCpa) * 100;
          if (inflationPct > 50) {
            signals.push({
              type: 'cpa_inflation',
              value: currentCpa,
              baseline: baselineCpa,
              inflationPercent: inflationPct.toFixed(1),
              detail: `CPA inflated ${inflationPct.toFixed(1)}% vs baseline`,
            });
          }
        }
      }

      // Signal 4: Diminishing Returns (impressions flat but spend rising)
      if (history.length >= 3) {
        const impTrend = this._detectTrend(history, 'impressions');
        const spendTrend = this._detectTrend(history, 'spend');
        if (impTrend.slope <= 0 && spendTrend.slope > 0 && impTrend.r2 > 0.5) {
          signals.push({
            type: 'diminishing_returns',
            impressionSlope: impTrend.slope.toFixed(2),
            spendSlope: spendTrend.slope.toFixed(2),
            detail: 'Impressions flat/declining while spend increases',
          });
        }
      }

      // Signal 5: Trend Decline (any core metric with negative slope, R²>0.5)
      if (history.length >= 3) {
        for (const metric of ['ctr', 'clicks', 'conversions']) {
          const trend = this._detectTrend(history, metric);
          if (trend.slope < 0 && trend.r2 > 0.5) {
            signals.push({
              type: 'trend_decline',
              metric,
              slope: trend.slope.toFixed(4),
              r2: trend.r2.toFixed(3),
              detail: `${metric} declining (slope=${trend.slope.toFixed(4)}, R²=${trend.r2.toFixed(3)})`,
            });
          }
        }
      }

      if (signals.length > 0) {
        const severity = signals.some(s =>
          s.type === 'high_frequency' || s.type === 'ctr_decay' || s.type === 'cpa_inflation'
        ) ? 'critical' : 'warning';

        const recommendation = severity === 'critical'
          ? 'rotate'
          : signals.some(s => s.type === 'trend_decline') ? 'refresh' : 'pause';

        const entry = {
          adId,
          adName: latest.hook || adId,
          signals,
          severity,
          recommendation,
          hook: latest.hook,
          body: latest.body,
          latestMetrics: {
            impressions: latest.impressions,
            clicks: latest.clicks,
            spend: latest.spend,
            ctr: latest.ctr,
            cpc: latest.cpc,
            frequency: latest.frequency,
          },
        };

        results.push(entry);

        bus.fire(EVENTS.CREATIVE_FATIGUE_DETECTED, { accountId, ...entry });

        if (severity === 'critical') {
          bus.fire(EVENTS.CREATIVE_REFRESH_NEEDED, {
            accountId,
            adId,
            adName: latest.hook || adId,
            severity,
            hook: latest.hook,
            body: latest.body,
            signals,
          });
        }
      }
    }

    log.info('Fatigue detection complete', { accountId, fatigued: results.length });
    return results;
  }

  /**
   * Auto-refresh a fatigued creative: generate new variants and create an A/B test.
   */
  async autoRefreshCreative({ accountId, adId, adName, hook, body }) {
    if (!this.creativeStudio || !this.abTestService) {
      log.warn('Cannot auto-refresh: creativeStudio or abTestService not configured');
      return null;
    }

    log.info('Auto-refreshing creative', { adId, adName });

    const copies = await this.creativeStudio.generateCopyOnly(
      adName || 'product',
      'engaged audience',
      hook || 'high performing ad',
      'meta'
    );

    if (!copies || copies.length === 0) {
      log.warn('No variants generated for auto-refresh', { adId });
      return null;
    }

    const variants = [
      { name: 'Original', adId, hook, body },
      ...copies.slice(0, 3).map((c, i) => ({
        name: `Variant ${i + 1}`,
        hook: c.headline || c.hook || '',
        body: c.primaryText || c.body || '',
      })),
    ];

    const test = await this.abTestService.createTest({
      name: `Fatigue Refresh: ${adName || adId}`,
      campaignId: accountId,
      variants,
      metric: 'ctr',
      confidence: 0.95,
      accountId,
    });

    try {
      await this.abTestService.startTest(test.id);
      log.info('Auto-refresh A/B test started', { testId: test.id, adId });
    } catch (err) {
      log.error('Failed to auto-start refresh test', { testId: test.id, error: err.message });
    }

    return test;
  }

  /**
   * Simple moving average over a window.
   */
  _calculateMovingAverage(data, window) {
    if (!data || data.length === 0) return 0;
    const w = window || data.length;
    const slice = data.slice(-w);
    return slice.reduce((sum, v) => sum + v, 0) / slice.length;
  }

  /**
   * Population standard deviation.
   */
  _calculateStdDev(data) {
    if (!data || data.length < 2) return 0;
    const mean = data.reduce((s, v) => s + v, 0) / data.length;
    const variance = data.reduce((s, v) => s + (v - mean) ** 2, 0) / data.length;
    return Math.sqrt(variance);
  }

  /**
   * Simple linear regression.
   * Expects points = [{x, y}]. Returns {slope, intercept, r2}.
   */
  _linearRegression(points) {
    const n = points.length;
    if (n < 2) return { slope: 0, intercept: 0, r2: 0 };

    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (const { x, y } of points) {
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
    }

    const denom = n * sumX2 - sumX * sumX;
    if (denom === 0) return { slope: 0, intercept: sumY / n, r2: 0 };

    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;

    // R² (coefficient of determination)
    const meanY = sumY / n;
    const ssTot = points.reduce((s, { y }) => s + (y - meanY) ** 2, 0);
    const ssRes = points.reduce((s, { x: _x, y }) => s + (y - (slope * _x + intercept)) ** 2, 0);
    const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

    return { slope, intercept, r2 };
  }

  /**
   * Detect trend in a metric over time using linear regression.
   */
  _detectTrend(history, metric) {
    const points = history
      .map((h, i) => ({ x: i, y: h[metric] || 0 }))
      .filter(p => p.y !== null && p.y !== undefined);
    return this._linearRegression(points);
  }

  /**
   * Extract total conversions from Meta actions array.
   */
  _extractConversions(actions) {
    if (!Array.isArray(actions)) return 0;
    let total = 0;
    for (const a of actions) {
      if (a.action_type === 'purchase' || a.action_type === 'offsite_conversion' ||
          a.action_type === 'onsite_conversion' || a.action_type === 'lead') {
        total += parseInt(a.value || 0);
      }
    }
    return total;
  }

  /**
   * Run snapshots for all tracked accounts.
   */
  async _runSnapshots() {
    try {
      const accounts = this.db.prepare(
        `SELECT id, user_id FROM platform_accounts WHERE platform = 'meta' AND health_status = 'active'`
      ).all();

      for (const account of accounts) {
        try {
          await this.snapshotCreatives(account.id, { ownerId: account.user_id });
        } catch (err) {
          log.error('Snapshot failed for account', { accountId: account.id, error: err.message });
        }
      }
    } catch (err) {
      log.error('Run snapshots failed', { error: err.message });
    }
  }

  /**
   * Calculate P-th percentile.
   */
  _percentile(arr, p) {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.ceil(p * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }
}
