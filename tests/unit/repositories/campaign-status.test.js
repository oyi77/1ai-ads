import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase } from '../../../db/index.js';
import { CampaignsRepository } from '../../../server/repositories/campaigns.js';
import { CampaignReporter } from '../../../server/services/campaign-reporter.js';
import { isActiveStatus, filterActiveCampaigns } from '../../../server/lib/campaign-status.js';
import { makeCampaign } from '../../helpers/fixtures.js';

// `campaigns.status` holds the provider-mapped status — every sync writes
// 'active'/'paused' (verified on the live DB: 38 'active', 276 'paused', nothing
// else). Several readers compared against the provider's UPPER-CASE enum, which
// was never true, so the campaign monitor, the daily eval guard and the bot's
// counters all silently processed zero campaigns while reporting success.
describe('campaign status casing', () => {
  let db;
  let repo;

  beforeEach(() => {
    db = createDatabase(':memory:');
    repo = new CampaignsRepository(db);
  });

  it('treats the stored lower-case status as active', () => {
    expect(isActiveStatus('active')).toBe(true);
  });

  it('tolerates the upper-case spelling and stray whitespace', () => {
    expect(isActiveStatus('ACTIVE')).toBe(true);
    expect(isActiveStatus(' Active ')).toBe(true);
  });

  it('rejects paused, unknown and missing values', () => {
    expect(isActiveStatus('paused')).toBe(false);
    expect(isActiveStatus('WINNING')).toBe(false);
    expect(isActiveStatus(undefined)).toBe(false);
    expect(filterActiveCampaigns([{ status: 'active' }, { status: 'paused' }, {}])).toHaveLength(1);
  });

  it('findActive returns the rows the syncs actually write', () => {
    // Regression: this query hard-coded 'ACTIVE' and matched no row, so every
    // caller saw an empty list of live campaigns.
    repo.upsert(makeCampaign({ campaign_id: 'live', userId: 'u1', status: 'active' }));
    repo.upsert(makeCampaign({ campaign_id: 'stopped', userId: 'u1', status: 'paused' }));
    const active = repo.findActive('u1');
    expect(active.map(c => c.campaign_id)).toEqual(['live']);
    // Shaped like the other read paths (stats inlined for the schedulers).
    expect(active[0].stats).toEqual(expect.objectContaining({ spend: expect.any(Number) }));
  });

  it('findActive never crosses tenants', () => {
    repo.upsert(makeCampaign({ campaign_id: 'mine', userId: 'u1', status: 'active' }));
    repo.upsert(makeCampaign({ campaign_id: 'theirs', userId: 'u2', status: 'active' }));
    expect(repo.findActive('u1').map(c => c.campaign_id)).toEqual(['mine']);
  });
});

describe('CampaignReporter', () => {
  const reporter = (campaigns, rules) => new CampaignReporter(
    { getByUserId: () => campaigns },
    { getAll: (userId) => (userId === 'u1' ? rules : []) },
    { analyzeAndSuggest: async () => [] },
  );

  it('counts the caller’s delivering campaigns', async () => {
    const campaigns = [
      { id: '1', status: 'active', stats: { spend: 100, roas: 2 } },
      { id: '2', status: 'paused', stats: { spend: 100, roas: 2 } },
    ];
    const report = await reporter(campaigns, []).sendDailyReport('u1');
    expect(report.totalCampaigns).toBe(2);
    // Regression: the upper-case compare reported 0 active on every report.
    expect(report.activeCampaigns).toBe(1);
  });

  it('counts today’s actions from the hydrated field, for that owner only', async () => {
    const today = new Date().toISOString().split('T')[0];
    const rules = [
      { lastTriggeredAt: `${today} 09:15:00` },   // hydrated (camelCase) row
      { lastTriggeredAt: '2020-01-01 09:15:00' },  // older than today
      { lastTriggered: `${today} 09:15:00` },      // raw column name, ignored
    ];
    const report = await reporter([], rules).sendDailyReport('u1');
    // Regression: the repo is queried with the owner id and the hydrated row
    // carries `lastTriggeredAt`, so both the lookup and the field were wrong.
    expect(report.actionsTaken).toBe(1);
  });
});
