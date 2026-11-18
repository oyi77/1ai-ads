import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  hashUserId,
  safeInc,
  getBusinessMetricsText,
  campaignSpendTotal,
  revenueTotal,
  ruleFiresTotal,
  webhookDlqDepth,
  autonomousActionsTotal,
} from '../../../server/lib/metrics.js';

async function valueFor(name, labels = '') {
  const text = await getBusinessMetricsText();
  const line = text.split('\n').find(l => l.startsWith(name + (labels ? '{' + labels + '}' : ' ')));
  if (!line) return 0;
  return Number(line.split(' ').slice(-1)[0]);
}

beforeEach(() => {
  campaignSpendTotal.reset();
  revenueTotal.reset();
  ruleFiresTotal.reset();
  webhookDlqDepth.reset();
  autonomousActionsTotal.reset();
});

describe('hashUserId (DEF-14 privacy)', () => {
  it('returns 8 hex chars, never the raw id', () => {
    const h = hashUserId('telegram:123456789');
    expect(h).toMatch(/^[0-9a-f]{8}$/);
    expect(h).not.toContain('123456789');
  });
  it('is deterministic and distinct per user', () => {
    expect(hashUserId('u1')).toBe(hashUserId('u1'));
    expect(hashUserId('u1')).not.toBe(hashUserId('u2'));
  });
  it('handles nullish ids without throwing', () => {
    expect(hashUserId(null)).toBe('unknown');
    expect(hashUserId(undefined)).toBe('unknown');
  });
});

describe('business counters', () => {
  it('campaign spend counter increments by delta with hashed user label', async () => {
    const h = hashUserId('user-42');
    safeInc(campaignSpendTotal, { platform: 'meta', user_id_hash: h }, 12.5);
    safeInc(campaignSpendTotal, { platform: 'meta', user_id_hash: h }, 7.5);
    expect(await valueFor('adforge_campaign_spend_total', `platform="meta",user_id_hash="${h}"`)).toBe(20);
    expect(await getBusinessMetricsText()).not.toContain('user-42');
  });

  it('revenue counter increments with same label set', async () => {
    const h = hashUserId('user-9');
    safeInc(revenueTotal, { platform: 'google', user_id_hash: h }, 100);
    expect(await valueFor('adforge_revenue_total', `platform="google",user_id_hash="${h}"`)).toBe(100);
  });

  it('rule fires counter increments per action/platform', async () => {
    safeInc(ruleFiresTotal, { action_type: 'pause', platform: 'meta' });
    safeInc(ruleFiresTotal, { action_type: 'pause', platform: 'meta' });
    safeInc(ruleFiresTotal, { action_type: 'resume', platform: 'google' });
    expect(await valueFor('adforge_rule_fires_total', 'action_type="pause",platform="meta"')).toBe(2);
    expect(await valueFor('adforge_rule_fires_total', 'action_type="resume",platform="google"')).toBe(1);
  });

  it('autonomous actions counter increments per result', async () => {
    for (const r of ['executed', 'blocked_allowlist', 'blocked_live_flag', 'error']) {
      safeInc(autonomousActionsTotal, { result: r });
    }
    safeInc(autonomousActionsTotal, { result: 'executed' });
    expect(await valueFor('adforge_autonomous_actions_total', 'result="executed"')).toBe(2);
    expect(await valueFor('adforge_autonomous_actions_total', 'result="blocked_allowlist"')).toBe(1);
    expect(await valueFor('adforge_autonomous_actions_total', 'result="blocked_live_flag"')).toBe(1);
    expect(await valueFor('adforge_autonomous_actions_total', 'result="error"')).toBe(1);
  });

  it('DLQ depth gauge sets (not accumulates)', async () => {
    webhookDlqDepth.set(5);
    webhookDlqDepth.set(2);
    expect(await valueFor('adforge_webhook_dlq_depth')).toBe(2);
  });
});

describe('safeInc (failure isolation)', () => {
  it('never throws when given a broken metric', () => {
    const broken = { inc: vi.fn(() => { throw new Error('metrics down'); }) };
    expect(() => safeInc(broken, { x: 'y' }, 1)).not.toThrow();
  });
});

describe('integration with business code', () => {
  it('campaignsRepo.update increments spend/revenue counters on a real delta', async () => {
    const Database = (await import('better-sqlite3')).default;
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE campaigns (
      id TEXT PRIMARY KEY, user_id TEXT, platform TEXT, campaign_id TEXT,
      name TEXT, status TEXT, budget REAL, spend REAL, revenue REAL,
      impressions INTEGER, clicks INTEGER, conversions INTEGER, roas REAL, last_synced TEXT
    )`);
    db.exec(`CREATE UNIQUE INDEX ux_platform_campaign ON campaigns(platform, campaign_id)`);
    const { CampaignsRepository } = await import('../../../server/repositories/campaigns.js');
    const repo = new CampaignsRepository(db);
    // Fresh upsert is a creation, not a spend change — must not fire the counter.
    repo.upsert({ id: 'c1', campaign_id: 'fb-1', user_id: 'u-77', platform: 'meta', spend: 100, revenue: 10 });
    const h = hashUserId('u-77');
    expect(await valueFor('adforge_campaign_spend_total', `platform="meta",user_id_hash="${h}"`)).toBe(0);
    // +30 delta on spend, +5 delta on revenue.
    repo.update('c1', { spend: 130, revenue: 15 }, 'u-77');
    expect(await valueFor('adforge_campaign_spend_total', `platform="meta",user_id_hash="${h}"`)).toBe(30);
    expect(await valueFor('adforge_revenue_total', `platform="meta",user_id_hash="${h}"`)).toBe(5);
    // A decrease must not fire (would inflate the counter downward into negatives).
    repo.update('c1', { spend: 20, revenue: 1 }, 'u-77');
    expect(await valueFor('adforge_campaign_spend_total', `platform="meta",user_id_hash="${h}"`)).toBe(30);
    db.close();
  });
});
