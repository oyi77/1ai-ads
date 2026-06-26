import { describe, it, expect } from 'vitest';
import { calculateCampaignStats, formatDailyReport, aggregatePlatformMetrics } from '../../../server/domain/reporting.js';
import { tagUrl, matchConversion, summarizeAttributions } from '../../../server/domain/attribution.js';
import { scoreCreative, detectFatigue } from '../../../server/domain/creative.js';

describe('Domain: Reporting', () => {
  it('calculateCampaignStats aggregates correctly', () => {
    const campaigns = [
      { id: '1', name: 'A', status: 'ACTIVE', spend: 100000, revenue: 200000 },
      { id: '2', name: 'B', status: 'PAUSED', spend: 50000, revenue: 30000 },
    ];
    const stats = calculateCampaignStats(campaigns);
    expect(stats.totalCampaigns).toBe(2);
    expect(stats.activeCampaigns).toBe(1);
    expect(stats.totalSpend).toBe(150000);
    expect(stats.totalRevenue).toBe(230000);
  });

  it('calculateCampaignStats handles empty', () => {
    const stats = calculateCampaignStats([]);
    expect(stats.totalCampaigns).toBe(0);
  });

  it('formatDailyReport produces readable output', () => {
    const stats = calculateCampaignStats([{ id: '1', name: 'Test', status: 'ACTIVE', spend: 100000, revenue: 200000 }]);
    const report = formatDailyReport(stats, '2026-01-01');
    expect(report).toContain('Daily Report');
    expect(report).toContain('Test');
  });

  it('aggregatePlatformMetrics combines platforms', () => {
    const data = { meta: { spend: 100, revenue: 200, impressions: 1000, clicks: 50 }, google: { spend: 50, revenue: 100, impressions: 500, clicks: 20 } };
    const result = aggregatePlatformMetrics(data);
    expect(result.totalSpend).toBe(150);
    expect(result.byPlatform).toHaveLength(2);
  });
});

describe('Domain: Attribution', () => {
  it('tagUrl generates UTM parameters', () => {
    const result = tagUrl({ url: 'https://example.com', campaign: 'camp1', adset: 'adset1' });
    expect(result.taggedUrl).toContain('utm_source=adforge');
    expect(result.taggedUrl).toContain('utm_campaign=camp1');
  });

  it('matchConversion matches by click_id', () => {
    const ads = [{ ad_id: 'a1', click_id: 'c1' }];
    const result = matchConversion({ click_id: 'c1', revenue: 100 }, ads);
    expect(result.method).toBe('click_id');
    expect(result.confidence).toBe('high');
  });

  it('matchConversion returns null for no match', () => {
    expect(matchConversion({ click_id: 'x' }, [])).toBeNull();
  });

  it('summarizeAttributions aggregates correctly', () => {
    const attrs = [{ method: 'click_id', revenue: 100, campaign_id: 'c1' }, { method: 'utm_params', revenue: 50, campaign_id: 'c1' }];
    const result = summarizeAttributions(attrs);
    expect(result.total).toBe(2);
    expect(result.totalRevenue).toBe(150);
    expect(result.byMethod.click_id.count).toBe(1);
  });
});

describe('Domain: Creative', () => {
  it('scoreCreative returns 0-100 score', () => {
    const result = scoreCreative({ impressions: 10000, clicks: 500, conversions: 50, spend: 100000, ctr: 5, cpc: 50, roas: 3 });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.breakdown).toHaveProperty('engagement');
  });

  it('scoreCreative suggests improvements for poor metrics', () => {
    const result = scoreCreative({ ctr: 0.5, cpc: 200, roas: 0.5 });
    expect(result.suggestions.length).toBeGreaterThan(0);
  });

  it('detectFatigue detects declining CTR', () => {
    const history = [
      { ctr: 0.5, cpc: 200, frequency: 4 },
      { ctr: 0.6, cpc: 180, frequency: 3.5 },
      { ctr: 0.7, cpc: 160, frequency: 3 },
      { ctr: 2.0, cpc: 80, frequency: 1.5 },
      { ctr: 2.5, cpc: 70, frequency: 1.2 },
    ];
    const result = detectFatigue(history);
    expect(result.fatigued).toBe(true);
    expect(result.signals.length).toBeGreaterThan(0);
  });

  it('detectFatigue returns no fatigue for stable metrics', () => {
    const history = [
      { ctr: 2.0, cpc: 80, frequency: 1.5 },
      { ctr: 2.1, cpc: 78, frequency: 1.4 },
      { ctr: 2.0, cpc: 80, frequency: 1.5 },
    ];
    const result = detectFatigue(history);
    expect(result.fatigued).toBe(false);
  });
});
