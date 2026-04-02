import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase } from '../../../db/index.js';
import { CampaignsRepository } from '../../../server/repositories/campaigns.js';
import { makeCampaign } from '../../helpers/fixtures.js';

describe('CampaignsRepository', () => {
  let db;
  let repo;

  beforeEach(() => {
    db = createDatabase(':memory:');
    repo = new CampaignsRepository(db);
  });

  it('findAll returns empty array initially', () => {
    const result = repo.findAll();
    expect(result.data).toEqual([]);
  });

  it('upsert inserts new campaign', () => {
    const camp = makeCampaign();
    repo.upsert(camp);
    const all = repo.findAll();
    expect(all.data.length).toBe(1);
    expect(all.data[0].name).toBe('Test Campaign');
  });

  it('getDashboardMetrics returns aggregated data', () => {
    repo.upsert(makeCampaign({ spend: 100000, impressions: 50000, clicks: 2500, conversions: 50, revenue: 300000 }));
    repo.upsert(makeCampaign({ spend: 200000, impressions: 100000, clicks: 5000, conversions: 100, revenue: 700000 }));

    const metrics = repo.getDashboardMetrics();
    expect(metrics.total_spend).toBe(300000);
    expect(metrics.total_revenue).toBe(1000000);
    expect(metrics.total_impressions).toBe(150000);
    expect(metrics.total_clicks).toBe(7500);
    expect(metrics.total_conversions).toBe(150);
  });

  it('getDashboardMetrics returns nulls for empty data', () => {
    const metrics = repo.getDashboardMetrics();
    expect(metrics.total_spend).toBe(0);
    expect(metrics.total_revenue).toBeNull();
  });
});
