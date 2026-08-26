import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: () => {}, error: () => {}, warn: () => {}, debug: () => {} }),
}));

import { MetaAdsAPI } from '../../../server/services/meta/index.js';

describe('MetaAdsAPI.getAccountInsightsByHour', () => {
  it('aggregates time_of_day rows into sorted buckets with derived roas', async () => {
    const api = new MetaAdsAPI('test-token');
    let capturedPath = '';
    let capturedParams = {};
    api._get = async (path, params) => {
      capturedPath = path;
      capturedParams = params;
      return {
        data: [
          { hourly_stats_aggregated_by_advertiser_time_zone: '09:00:00 - 09:59:59', spend: '100', impressions: '5000', clicks: '50', actions: [{ action_type: 'purchase', value: '2' }], action_values: [{ action_type: 'purchase', value: '400' }] },
          { hourly_stats_aggregated_by_advertiser_time_zone: '21:00:00 - 21:59:59', spend: '50', impressions: '2000', clicks: '10', actions: [], action_values: [] },
          { hourly_stats_aggregated_by_advertiser_time_zone: '09:00:00 - 09:59:59', spend: '60', impressions: '3000', clicks: '30', actions: [{ action_type: 'purchase', value: '1' }], action_values: [{ action_type: 'purchase', value: '150' }] },
        ],
      };
    };

    const hours = await api.getAccountInsightsByHour('12345', { datePreset: 'last_7d' });

    // breakdowns=time_of_day requested (dayparting data source)
    expect(capturedParams.breakdowns).toBe('hourly_stats_aggregated_by_advertiser_time_zone');
    expect(capturedParams.date_preset).toBe('last_7d');
    expect(capturedPath).toBe('/12345/insights');

    // merged hour 9 across the window
    const h9 = hours.find(h => h.hour === 9);
    expect(h9.spend).toBeCloseTo(160);
    expect(h9.purchases).toBe(3);
    expect(h9.revenue).toBeCloseTo(550);
    expect(h9.roas).toBeCloseTo(550 / 160);

    // sorted ascending
    const ids = hours.map(h => h.hour);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
  });
});
