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
    repo.upsert(makeCampaign({ campaign_id: 'camp_1', spend: 100000, impressions: 50000, clicks: 2500, conversions: 50, revenue: 300000 }));
    repo.upsert(makeCampaign({ campaign_id: 'camp_2', spend: 200000, impressions: 100000, clicks: 5000, conversions: 100, revenue: 700000 }));

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

  it('findAll scopes by userId and includes system rows', () => {
    repo.upsert(makeCampaign({ user_id: 'userA', campaign_id: 'a1' }));
    repo.upsert(makeCampaign({ user_id: 'userB', campaign_id: 'b1' }));
    repo.upsert(makeCampaign({ user_id: 'system', campaign_id: 's1' }));

    const a = repo.findAll({ userId: 'userA' });
    const ids = a.data.map((c) => c.campaign_id);
    expect(ids).toContain('a1');
    expect(ids).toContain('s1');
    expect(ids).not.toContain('b1');
  });

  it('findAll without userId returns all campaigns', () => {
    repo.upsert(makeCampaign({ user_id: 'userA', campaign_id: 'a1' }));
    repo.upsert(makeCampaign({ user_id: 'userB', campaign_id: 'b1' }));
    expect(repo.findAll().data.length).toBe(2);
  });

  it('findById scoped to userId excludes other users', () => {
    const idA = repo.upsert(makeCampaign({ user_id: 'userA', campaign_id: 'a1' }));
    const idB = repo.upsert(makeCampaign({ user_id: 'userB', campaign_id: 'b1' }));
    const mine = repo.findById(idA, 'userA');
    expect(mine).not.toBeNull();
    expect(mine.campaign_id).toBe('a1');
    const others = repo.findById(idB, 'userA');
    expect(others).toBeNull();
  });

  it('findById unscoped returns the row', () => {
    const idA = repo.upsert(makeCampaign({ user_id: 'userA', campaign_id: 'a1' }));
    expect(repo.findById(idA)).not.toBeNull();
  });

  it('update does not mutate other users campaigns', () => {
    const idA = repo.upsert(makeCampaign({ user_id: 'userA', campaign_id: 'a1', name: 'Orig' }));
    const idB = repo.upsert(makeCampaign({ user_id: 'userB', campaign_id: 'b1', name: 'Other' }));
    const res = repo.update(idB, { name: 'Hacked' }, 'userA');
    expect(res).toBe(false);
    const b = repo.findById(idB);
    expect(b.name).toBe('Other');
  });

  it('update mutates own campaign when scoped', () => {
    const idA = repo.upsert(makeCampaign({ user_id: 'userA', campaign_id: 'a1', name: 'Orig' }));
    const res = repo.update(idA, { name: 'Updated' }, 'userA');
    expect(res).toBe(true);
    expect(repo.findById(idA).name).toBe('Updated');
  });

  it('getByUserId excludes system rows', () => {
    repo.upsert(makeCampaign({ user_id: 'userA', campaign_id: 'a1' }));
    repo.upsert(makeCampaign({ user_id: 'system', campaign_id: 's1' }));
    const rows = repo.getByUserId('userA');
    expect(rows.map((c) => c.campaign_id)).toEqual(['a1']);
  });
});
