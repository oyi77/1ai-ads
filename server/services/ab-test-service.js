import { createLogger } from '../lib/logger.js';
import { bus, EVENTS } from '../lib/event-bus.js';
import { v4 as uuid } from 'uuid';

const log = createLogger('ab-test-service');

/**
 * ABTestsRepository — persistence for ab_tests + ab_test_variants tables.
 */
class ABTestsRepository {
  constructor(db) {
    this.db = db;
  }

  createTest(row) {
    this.db.prepare(`
      INSERT INTO ab_tests (id, name, campaign_id, status, metric, confidence, winner_id, config, started_at, stopped_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      row.id, row.name, row.campaign_id, row.status, row.metric,
      row.confidence, row.winner_id, row.config,
      row.started_at, row.stopped_at
    );
  }

  createVariant(row) {
    this.db.prepare(`
      INSERT INTO ab_test_variants (id, test_id, ad_id, creative_id, name, hook, body, variant_index, impressions, clicks, spend, conversions, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      row.id, row.test_id, row.ad_id, row.creative_id, row.name,
      row.hook, row.body, row.variant_index,
      row.impressions, row.clicks, row.spend, row.conversions
    );
  }

  getTest(testId) {
    return this.db.prepare('SELECT * FROM ab_tests WHERE id = ?').get(testId);
  }

  getTests({ status, page = 1, limit = 50 } = {}) {
    const where = [];
    const params = [];
    if (status) { where.push('status = ?'); params.push(status); }
    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = this.db.prepare(`SELECT COUNT(*) as count FROM ab_tests ${whereClause}`).get(...params).count;
    const offset = (page - 1) * limit;
    const data = this.db.prepare(
      `SELECT * FROM ab_tests ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);
    return { data, total, page, limit };
  }

  getVariants(testId) {
    return this.db.prepare('SELECT * FROM ab_test_variants WHERE test_id = ? ORDER BY variant_index').all(testId);
  }

  updateTest(testId, updates) {
    const sets = [];
    const values = [];
    for (const [key, val] of Object.entries(updates)) {
      sets.push(`${key} = ?`);
      values.push(val);
    }
    sets.push('updated_at = CURRENT_TIMESTAMP');
    values.push(testId);
    this.db.prepare(`UPDATE ab_tests SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  }

  updateVariant(variantId, updates) {
    const sets = [];
    const values = [];
    for (const [key, val] of Object.entries(updates)) {
      sets.push(`${key} = ?`);
      values.push(val);
    }
    values.push(variantId);
    this.db.prepare(`UPDATE ab_test_variants SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  }

  getVariant(variantId) {
    return this.db.prepare('SELECT * FROM ab_test_variants WHERE id = ?').get(variantId);
  }
}

export class ABTestService {
  constructor(metaApi, db) {
    this.meta = metaApi;
    this.db = db;
    this.repo = new ABTestsRepository(db);
  }

  /**
   * Create a new A/B test with variants.
   */
  async createTest({ name, campaignId, variants, metric, confidence, accountId, adsetId, pageId, linkUrl, userId }) {
    log.info('Creating A/B test', { name, variantCount: variants?.length });

    const id = uuid();
    const config = JSON.stringify({ accountId, adsetId, pageId, linkUrl });

    this.repo.createTest({
      id,
      name,
      userId,
      campaign_id: campaignId || null,
      status: 'draft',
      metric: metric || 'ctr',
      confidence: confidence || 0.95,
      winner_id: null,
      config,
      started_at: null,
      stopped_at: null,
    });

    const savedVariants = [];
    for (let i = 0; i < (variants || []).length; i++) {
      const v = variants[i];
      const variantId = uuid();
      this.repo.createVariant({
        id: variantId,
        test_id: id,
        ad_id: v.adId || null,
        creative_id: null,
        name: v.name || `Variant ${i + 1}`,
        hook: v.hook || null,
        body: v.body || null,
        variant_index: i,
        impressions: 0,
        clicks: 0,
        spend: 0,
        conversions: 0,
      });
      savedVariants.push({ id: variantId, ...v, variantIndex: i });
    }

    const test = this.repo.getTest(id);
    const testVariants = this.repo.getVariants(id);

    log.info('A/B test created', { id, variants: testVariants.length });
    return this._enrichTest(test, testVariants);
  }

  /**
   * Start a test: optionally creates ad creatives + ads on Meta for variants without ad_id.
   */
  async startTest(testId, userId) {
    const test = this.repo.getTest(testId, userId);
    if (!test) throw new Error(`Test ${testId} not found`);

    const variants = this.repo.getVariants(testId);
    const config = JSON.parse(test.config || '{}');

    // Create Meta ads for variants that don't have an ad_id yet
    if (this.meta && config.accountId && config.adsetId && config.pageId && config.linkUrl) {
      for (const variant of variants) {
        if (!variant.ad_id) {
          try {
            const creative = await this.meta.createAdCreative(config.accountId, {
              name: `${test.name} — ${variant.name}`,
              pageId: config.pageId,
              message: variant.body || '',
              headline: variant.hook || '',
              linkUrl: config.linkUrl,
            });

            const ad = await this.meta.createAd(config.accountId, {
              adsetId: config.adsetId,
              creativeId: creative.id,
              name: `${test.name} — ${variant.name}`,
              status: 'PAUSED',
            });

            this.repo.updateVariant(variant.id, {
              ad_id: ad.id,
              creative_id: creative.id,
            });

            log.info('Created Meta ad for variant', { variantId: variant.id, adId: ad.id });
          } catch (err) {
            log.error('Failed to create Meta ad for variant', {
              variantId: variant.id, error: err.message,
            });
          }
        }
      }
    }

    this.repo.updateTest(testId, {
      status: 'running',
      started_at: new Date().toISOString(),
    });

    bus.fire(EVENTS.AB_TEST_STARTED, { testId, name: test.name });

    log.info('A/B test started', { testId });
    return this.getTest(testId);
  }

  /**
   * Stop a test: syncs final metrics, calculates winner using Bayesian test.
   */
  async stopTest(testId, userId) {
    const test = this.repo.getTest(testId, userId);
    if (!test) throw new Error(`Test ${testId} not found`);

    // Sync final metrics
    await this.syncTest(testId);

    // Calculate winner
    const winner = this._calculateWinner(testId, test.metric);

    this.repo.updateTest(testId, {
      status: 'completed',
      stopped_at: new Date().toISOString(),
      winner_id: winner?.id || null,
    });

    bus.fire(EVENTS.AB_TEST_COMPLETED, { testId, winner });

    if (winner) {
      bus.fire(EVENTS.AB_TEST_WINNER_SELECTED, { testId, winnerId: winner.id, winnerName: winner.name });
    }

    log.info('A/B test stopped', { testId, winnerId: winner?.id });
    return this.getTest(testId);
  }

  /**
   * Fetch current insights per variant from Meta API and update DB.
   */
  async syncTest(testId) {
    const test = this.repo.getTest(testId);
    if (!test) throw new Error(`Test ${testId} not found`);

    const variants = this.repo.getVariants(testId);

    for (const variant of variants) {
      if (!variant.ad_id || !this.meta) continue;

      try {
        const insights = await this.meta.apiGet(`/${variant.ad_id}/insights`, {
          fields: 'impressions,clicks,spend,actions,ctr,cpc',
          date_preset: 'last_7d',
        });

        const raw = insights.data?.[0];
        if (raw) {
          const conversions = this._extractConversions(raw.actions || []);
          this.repo.updateVariant(variant.id, {
            impressions: parseInt(raw.impressions || 0),
            clicks: parseInt(raw.clicks || 0),
            spend: parseFloat(raw.spend || 0),
            conversions,
          });
        }
      } catch (err) {
        log.debug('Failed to sync variant', { variantId: variant.id, error: err.message });
      }
    }

    return this.getTest(testId);
  }

  /**
   * Auto-select winner after 48h using Bayesian method.
   * Scales winner ad, pauses losers.
   */
  async autoSelectWinner(testId) {
    const test = this.repo.getTest(testId);
    if (!test) throw new Error(`Test ${testId} not found`);

    // Only run if test has been running >= 48h
    if (!test.started_at) {
      log.debug('Test not started yet', { testId });
      return null;
    }

    const startedAt = new Date(test.started_at).getTime();
    const elapsed = Date.now() - startedAt;
    const fortyEightHours = 48 * 60 * 60 * 1000;

    if (elapsed < fortyEightHours) {
      log.debug('Test not 48h old yet', { testId, elapsedHours: (elapsed / 3600000).toFixed(1) });
      return null;
    }

    // Sync latest data
    await this.syncTest(testId);

    // Try Bayesian winner selection
    const winner = this._calculateWinner(testId, test.metric);

    if (!winner) {
      log.info('No significant winner yet', { testId });
      return null;
    }

    // Scale winner, pause losers
    const variants = this.repo.getVariants(testId);
    const config = JSON.parse(test.config || '{}');

    if (this.meta && config.accountId) {
      for (const variant of variants) {
        if (!variant.ad_id) continue;

        try {
          if (variant.id === winner.id) {
            // Scale winner: increase budget by 50%
            await this.meta.apiPost(`/${config.accountId}/ads`, {
              status: 'ACTIVE',
            });
          } else {
            // Pause loser
            await this.meta.apiPost(`/${variant.ad_id}`, { status: 'PAUSED' });
          }
        } catch (err) {
          log.error('Failed to adjust variant', { variantId: variant.id, error: err.message });
        }
      }
    }

    this.repo.updateTest(testId, {
      status: 'winner_selected',
      winner_id: winner.id,
    });

    bus.fire(EVENTS.AB_TEST_WINNER_SELECTED, {
      testId,
      winnerId: winner.id,
      winnerName: winner.name,
      method: 'auto_bayesian',
    });

    log.info('Auto-selected winner', { testId, winnerId: winner.id });
    return this.getTest(testId);
  }

  /**
   * Thompson Sampling traffic allocation.
   * Returns recommended traffic split based on posterior Beta distributions.
   */
  allocateTraffic(testId) {
    const variants = this.repo.getVariants(testId);
    if (!variants.length) return [];

    const samples = 1000;
    const wins = new Array(variants.length).fill(0);

    for (let s = 0; s < samples; s++) {
      let bestIdx = 0;
      let bestSample = -1;

      for (let i = 0; i < variants.length; i++) {
        const v = variants[i];
        const alpha = v.clicks + 1;        // successes + prior
        const beta = (v.impressions - v.clicks) + 1; // failures + prior
        const sample = this._sampleBeta(alpha, beta);
        if (sample > bestSample) {
          bestSample = sample;
          bestIdx = i;
        }
      }
      wins[bestIdx]++;
    }

    return variants.map((v, i) => ({
      id: v.id,
      name: v.name,
      trafficShare: (wins[i] / samples),
    }));
  }

  getTests({ status, page = 1, limit = 50, userId } = {}) {
    const { data, total, page: p, limit: l } = this.repo.getTests({ status, page, limit, userId });
    const enriched = data.map(t => {
      const variants = this.repo.getVariants(t.id);
      return this._enrichTest(t, variants);
    });
    return { data: enriched, total, page: p, limit: l };
  }

  getTest(testId) {
    const test = this.repo.getTest(testId);
    if (!test) throw new Error(`Test ${testId} not found`);
    const variants = this.repo.getVariants(testId);
    return this._enrichTest(test, variants);
  }

  updateWinner(testId, winnerId, userId) {
    const test = this.repo.getTest(testId, userId);
    if (!test) throw new Error(`Test ${testId} not found`);

    this.repo.updateTest(testId, {
      winner_id: winnerId,
      status: 'winner_selected',
    });

    bus.fire(EVENTS.AB_TEST_WINNER_SELECTED, { testId, winnerId });
    log.info('Winner updated', { testId, winnerId });
    return this.getTest(testId);
  }

  /**
   * Bayesian A/B test for CTR using Beta-Binomial model.
   * Monte Carlo with 10k samples.
   * Returns per-variant: { id, name, significant, winProbability, credibleInterval }
   */
  _bayesianTestCTR(variants, confidence = 0.95) {
    const samples = 10000;
    const wins = new Array(variants.length).fill(0);
    const allSamples = variants.map(() => []);

    for (let s = 0; s < samples; s++) {
      let bestIdx = 0;
      let bestVal = -1;

      for (let i = 0; i < variants.length; i++) {
        const v = variants[i];
        const alpha = v.clicks + 1;
        const beta = Math.max(v.impressions - v.clicks, 0) + 1;
        const sample = this._sampleBeta(alpha, beta);
        allSamples[i].push(sample);

        if (sample > bestVal) {
          bestVal = sample;
          bestIdx = i;
        }
      }
      wins[bestIdx]++;
    }

    const alpha = 1 - confidence;

    return variants.map((v, i) => {
      const sorted = [...allSamples[i]].sort((a, b) => a - b);
      const lo = sorted[Math.floor((alpha / 2) * samples)];
      const hi = sorted[Math.floor((1 - alpha / 2) * samples)];
      const winProb = wins[i] / samples;

      // Significant if the winner has >95% win probability
      const significant = winProb > confidence;

      return {
        id: v.id,
        name: v.name,
        significant,
        winProbability: winProb,
        credibleInterval: [lo, hi],
      };
    });
  }

  /**
   * Calculate winner for a test based on metric.
   */
  _calculateWinner(testId, metric = 'ctr') {
    const variants = this.repo.getVariants(testId);
    if (variants.length < 2) return null;

    if (metric === 'ctr') {
      const results = this._bayesianTestCTR(variants);
      const best = results.reduce((a, b) => a.winProbability > b.winProbability ? a : b);
      if (!best.significant) return null;

      const variant = variants.find(v => v.id === best.id);
      return { id: variant.id, name: variant.name, ...best };
    }

    // Heuristic for CPC/CPA: pick lowest
    const scored = variants.map(v => {
      const ctr = v.impressions > 0 ? v.clicks / v.impressions : 0;
      const cpc = v.clicks > 0 ? v.spend / v.clicks : 0;
      const cvr = v.clicks > 0 ? v.conversions / v.clicks : 0;
      const cpa = v.conversions > 0 ? v.spend / v.conversions : Infinity;
      return { ...v, ctr, cpc, cvr, cpa };
    });

    // Require minimum data
    const withData = scored.filter(v => v.impressions >= 100);
    if (withData.length < 2) return null;

    let best;
    if (metric === 'cpc') {
      best = withData.reduce((a, b) => a.cpc < b.cpc ? a : b);
    } else if (metric === 'cpa') {
      best = withData.reduce((a, b) => a.cpa < b.cpa ? a : b);
    } else {
      best = withData.reduce((a, b) => a.ctr > b.ctr ? a : b);
    }

    return { id: best.id, name: best.name, significant: true, winProbability: 1 };
  }

  /**
   * Enrich test object with computed metrics.
   */
  _enrichTest(test, variants) {
    const enrichedVariants = variants.map(v => ({
      ...v,
      ctr: v.impressions > 0 ? v.clicks / v.impressions : 0,
      cpc: v.clicks > 0 ? v.spend / v.clicks : 0,
      cvr: v.clicks > 0 ? v.conversions / v.clicks : 0,
      cpa: v.conversions > 0 ? v.spend / v.conversions : null,
    }));

    const totalImpressions = variants.reduce((s, v) => s + (v.impressions || 0), 0);
    const totalClicks = variants.reduce((s, v) => s + (v.clicks || 0), 0);
    const totalSpend = variants.reduce((s, v) => s + (v.spend || 0), 0);
    const totalConversions = variants.reduce((s, v) => s + (v.conversions || 0), 0);

    return {
      ...test,
      config: undefined, // Don't expose raw config string
      variants: enrichedVariants,
      results: {
        totalImpressions,
        totalClicks,
        totalSpend,
        totalConversions,
        overallCtr: totalImpressions > 0 ? totalClicks / totalImpressions : 0,
        overallCpc: totalClicks > 0 ? totalSpend / totalClicks : 0,
      },
    };
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
   * Sample from Beta(alpha, beta) using Jöhnk's algorithm.
   * Simple approximation sufficient for Monte Carlo.
   */
  _sampleBeta(alpha, beta) {
    // Use the Gamma-based method for Beta sampling
    const ga = this._sampleGamma(alpha, 1);
    const gb = this._sampleGamma(beta, 1);
    return ga / (ga + gb);
  }

  /**
   * Sample from Gamma(shape, scale=1) using Marsaglia and Tsang's method.
   */
  _sampleGamma(shape, scale) {
    if (shape < 1) {
      // For shape < 1, use the relation: Gamma(a) = Gamma(a+1) * U^(1/a)
      return this._sampleGamma(shape + 1, scale) * Math.pow(Math.random(), 1 / shape);
    }

    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);

    while (true) {
      let x, v;
      do {
        x = this._randn();
        v = 1 + c * x;
      } while (v <= 0);

      v = v * v * v;
      const u = Math.random();

      if (u < 1 - 0.0331 * x * x * x * x) return d * v * scale;
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v * scale;
    }
  }

  /**
   * Standard normal random using Box-Muller transform.
   */
  _randn() {
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
}
