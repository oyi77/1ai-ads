import { describe, it, expect, vi } from 'vitest';
import { RuleEvaluator } from '../../../server/services/rule-evaluator.js';

function evaluatorWith({ token = 'TOK', budget = 200000 } = {}) {
  const api = {
    updateCampaign: vi.fn(async () => ({ success: true })),
    getCampaign: vi.fn(async () => ({ dailyBudget: budget })),
    duplicateCampaign: vi.fn(async () => ({ newCampaignId: 'new1' })),
  };
  class MetaCls { constructor() { return api; } }
  const ev = new RuleEvaluator({}, {}, {}, null, {
    platformAccountsRepo: { findAllActiveByUserAndPlatform: () => (token ? [{ access_token: token }] : []) },
  }, null);
  ev.constructor.PLATFORM_APIS = { meta: MetaCls };
  return { ev, api };
}

const camp = (over = {}) => ({
  id: 'uuid-1', campaign_id: '123', platform: 'meta', user_id: 'u1',
  name: 'Promo', status: 'active', budget: 100000, ...over,
});

describe('rule-evaluator fail-loud (BLOCKER: approve palsu)', () => {
  it('pause tanpa token → throw, bukan diam', async () => {
    const { ev } = evaluatorWith({ token: null });
    await expect(ev._pauseCampaign(camp())).rejects.toThrow(/Token Meta/);
  });

  it('pause tanpa campaign_id → throw, bukan kirim UUID ke Meta', async () => {
    const { ev, api } = evaluatorWith();
    await expect(ev._pauseCampaign(camp({ campaign_id: null }))).rejects.toThrow(/belum terikat/);
    expect(api.updateCampaign).not.toHaveBeenCalled();
  });

  it('pause valid → Meta terima campaign_id asli', async () => {
    const { ev, api } = evaluatorWith();
    await ev._pauseCampaign(camp());
    expect(api.updateCampaign).toHaveBeenCalledWith('123', { status: 'PAUSED' });
  });

  it('scale pakai budget FRESH dari Meta, bukan snapshot basi', async () => {
    const { ev, api } = evaluatorWith({ budget: 500000 });
    await ev._increaseBudget(camp({ budget: 100000 }), 20);
    // 500k * 1.2 = 600k — bukan 100k * 1.2 = 120k
    expect(api.updateCampaign).toHaveBeenCalledWith('123', { dailyBudget: 600000 });
  });

  it('scale fallback snapshot kalau fetch gagal', async () => {
    const { ev, api } = evaluatorWith();
    api.getCampaign.mockRejectedValueOnce(new Error('net down'));
    await ev._increaseBudget(camp({ budget: 100000 }), 20);
    expect(api.updateCampaign).toHaveBeenCalledWith('123', { dailyBudget: 120000 });
  });

  it('duplicate tanpa campaign_id → throw', async () => {
    const { ev } = evaluatorWith();
    await expect(ev._duplicateCampaign(camp({ campaign_id: null }))).rejects.toThrow(/belum terikat/);
  });
});
