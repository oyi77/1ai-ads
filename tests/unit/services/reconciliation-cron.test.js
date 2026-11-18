import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const mockWithToken = vi.fn();
vi.mock('../../../server/services/meta/index.js', () => ({
  MetaAdsAPI: { withToken: (...a) => mockWithToken(...a) },
}));

const mockGetPlatformSync = vi.fn();
vi.mock('../../../server/platforms/index.js', () => ({
  getPlatformSync: (...a) => mockGetPlatformSync(...a),
}));

const mockResolveToken = vi.fn();
vi.mock('../../../server/lib/resolve-owner-platform.js', () => ({
  resolveOwnerPlatformToken: (...a) => mockResolveToken(...a),
}));

import { ReconciliationService } from '../../../server/services/reconciliation-cron.js';

function makeDb() {
  const run = vi.fn();
  return { prepare: vi.fn(() => ({ run })), _run: run };
}

describe('ReconciliationService', () => {
  let db, campaignsRepo, platformAccountsRepo, settingsRepo, service;

  beforeEach(() => {
    vi.clearAllMocks();
    db = makeDb();
    campaignsRepo = {
      findAll: vi.fn(() => ({ data: [] })),
      update: vi.fn(() => true),
    };
    platformAccountsRepo = { getAccounts: vi.fn(() => []) };
    settingsRepo = {};
    service = new ReconciliationService({ db, campaignsRepo, platformAccountsRepo, settingsRepo });
  });

  it('skips unsupported platforms', async () => {
    const r = await service.reconcileAccount('reddit', 'acct-1', 'u1');
    expect(r.errors).toBe(1);
    expect(r.checked).toBe(0);
    expect(mockResolveToken).not.toHaveBeenCalled();
  });

  it('returns zero result when the owner has no token', async () => {
    mockResolveToken.mockReturnValue(null);
    const r = await service.reconcileAccount('meta', 'act_1', 'u1');
    expect(r.errors).toBe(1);
    expect(campaignsRepo.findAll).not.toHaveBeenCalled();
  });

  it('records drift without applying in dry-run mode', async () => {
    mockResolveToken.mockReturnValue('tok');
    const remote = { getCampaigns: vi.fn().mockResolvedValue([{ id: 'c1', status: 'PAUSED', dailyBudget: 50 }]) };
    mockWithToken.mockReturnValue(remote);
    campaignsRepo.findAll.mockReturnValue({
      data: [{ id: 'local-1', campaign_id: 'c1', status: 'active', budget: 40 }],
    });

    const r = await service.reconcileAccount('meta', 'act_1', 'u1');

    expect(r.checked).toBe(1);
    expect(r.drifted).toBe(1);
    expect(r.applied).toBe(0);
    expect(campaignsRepo.update).not.toHaveBeenCalled();
    expect(db._run).toHaveBeenCalledOnce();
  });

  it('applies remote state when apply=true', async () => {
    service = new ReconciliationService({
      db, campaignsRepo, platformAccountsRepo, settingsRepo, apply: true,
    });
    mockResolveToken.mockReturnValue('tok');
    mockWithToken.mockReturnValue({
      getCampaigns: vi.fn().mockResolvedValue([{ id: 'c1', status: 'PAUSED', dailyBudget: 50 }]),
    });
    campaignsRepo.findAll.mockReturnValue({
      data: [{ id: 'local-1', campaign_id: 'c1', status: 'active', budget: 40 }],
    });

    const r = await service.reconcileAccount('meta', 'act_1', 'u1');

    expect(r.applied).toBe(1);
    expect(campaignsRepo.update).toHaveBeenCalledWith('local-1', { status: 'paused', budget: 50 }, 'u1');
  });

  it('does not flag drift when local matches remote', async () => {
    mockResolveToken.mockReturnValue('tok');
    mockWithToken.mockReturnValue({
      getCampaigns: vi.fn().mockResolvedValue([{ id: 'c1', status: 'active', dailyBudget: 40 }]),
    });
    campaignsRepo.findAll.mockReturnValue({
      data: [{ id: 'local-1', campaign_id: 'c1', status: 'active', budget: 40 }],
    });

    const r = await service.reconcileAccount('meta', 'act_1', 'u1');
    expect(r.drifted).toBe(0);
    expect(db._run).not.toHaveBeenCalled();
  });

  it('survives a provider fetch failure', async () => {
    mockResolveToken.mockReturnValue('tok');
    mockWithToken.mockReturnValue({ getCampaigns: vi.fn().mockRejectedValue(new Error('throttled')) });

    const r = await service.reconcileAccount('meta', 'act_1', 'u1');
    expect(r.errors).toBe(1);
    expect(r.checked).toBe(0);
  });

  it('reconcileAll sweeps every supported account and aggregates', async () => {
    mockResolveToken.mockReturnValue('tok');
    mockWithToken.mockReturnValue({
      getCampaigns: vi.fn().mockResolvedValue([{ id: 'c1', status: 'paused', dailyBudget: 10 }]),
    });
    platformAccountsRepo.getAccounts.mockReturnValue([
      { platform: 'meta', user_id: 'u1', credentials: { ad_account_id: 'act_1' } },
      { platform: 'reddit', user_id: 'u1', credentials: { ad_account_id: 'r_1' } },
      { platform: 'meta', user_id: null, credentials: { ad_account_id: 'act_x' } },
    ]);
    campaignsRepo.findAll.mockReturnValue({ data: [{ id: 'l1', campaign_id: 'c1', status: 'active', budget: 10 }] });

    const summary = await service.reconcileAll();
    expect(summary.accounts).toBe(1); // reddit unsupported, null-user skipped
    expect(summary.checked).toBe(1);
    expect(summary.drifted).toBe(1);
  });
});
