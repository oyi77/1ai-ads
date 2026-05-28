import { createLogger } from '../lib/logger.js';
import crypto from 'crypto';

const log = createLogger('ab-test-service');

export class ABTestService {
  constructor(metaApi) {
    this.meta = metaApi;
    this.tests = new Map();
  }

  async createTest({ name, campaignId, variants, metric, confidence }) {
    log.info('createTest', { name, campaignId, variants: variants?.length });
    const id = `abt_${crypto.randomUUID().slice(0, 8)}`;
    const test = {
      id,
      name,
      campaignId,
      variants: (variants || []).map((v, i) => ({
        id: `v${i + 1}`,
        name: v.name || `Variant ${i + 1}`,
        adId: v.adId,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        spend: 0,
        ctr: 0,
        cpc: 0
      })),
      metric: metric || 'ctr',
      confidence: confidence || 0.95,
      status: 'draft',
      createdAt: new Date().toISOString()
    };
    this.tests.set(id, test);
    return test;
  }

  async getTests() {
    return [...this.tests.values()];
  }

  async getTest(testId) {
    const test = this.tests.get(testId);
    if (!test) throw new Error(`Test ${testId} not found`);
    return { ...test, results: this._calculateResults(test) };
  }

  async startTest(testId) {
    const test = this.tests.get(testId);
    if (!test) throw new Error(`Test ${testId} not found`);
    test.status = 'running';
    test.startedAt = new Date().toISOString();
    log.info('test_started', { testId });
    return test;
  }

  async stopTest(testId) {
    const test = this.tests.get(testId);
    if (!test) throw new Error(`Test ${testId} not found`);
    test.status = 'completed';
    test.stoppedAt = new Date().toISOString();
    test.results = this._calculateResults(test);
    log.info('test_stopped', { testId });
    return test;
  }

  async updateWinner(testId, winnerId) {
    const test = this.tests.get(testId);
    if (!test) throw new Error(`Test ${testId} not found`);
    test.winner = winnerId;
    test.status = 'winner_selected';
    log.info('winner_selected', { testId, winnerId });
    return test;
  }

  _calculateResults(test) {
    const totalImpressions = test.variants.reduce((s, v) => s + v.impressions, 0);
    const totalClicks = test.variants.reduce((s, v) => s + v.clicks, 0);
    const totalSpend = test.variants.reduce((s, v) => s + v.spend, 0);
    return {
      totalImpressions,
      totalClicks,
      totalSpend,
      overallCtr: totalImpressions > 0 ? totalClicks / totalImpressions : 0,
      variants: test.variants.map(v => ({
        ...v,
        ctr: v.impressions > 0 ? v.clicks / v.impressions : 0,
        cpc: v.clicks > 0 ? v.spend / v.clicks : 0,
        cvr: v.clicks > 0 ? v.conversions / v.clicks : 0
      }))
    };
  }
}
