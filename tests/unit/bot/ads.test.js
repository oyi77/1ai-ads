import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the MetaAdsAPI service BEFORE importing ads.js so the handlers use the fake.
const mockGetAdAccounts = vi.fn();
const mockGetCampaigns = vi.fn();
const mockGetAccountInsights = vi.fn();
const mockUpdateCampaign = vi.fn();

vi.mock('../../../server/services/meta/index.js', () => {
  return {
    MetaAdsAPI: {
      withToken(token) {
        return {
          _token: token,
          getAdAccounts: mockGetAdAccounts,
          getCampaigns: mockGetCampaigns,
          getAccountInsights: mockGetAccountInsights,
          updateCampaign: mockUpdateCampaign,
        };
      },
    },
  };
});

const { handleAds, handleAdsSelect, handleAdsToggle, handleAdsReport, handleAdsDisconnect } =
  await import('../../../server/bot/commands/ads.js');

function makeCtx(userId = 'u1') {
  const replies = [];
  return {
    userId,
    reply: async (msg) => { replies.push(msg); return { message: msg }; },
    answerCbQuery: async () => {},
    scene: { enter: (name, data) => { replies.push(`SCENE:${name}:${JSON.stringify(data)}`); } },
    _replies: replies,
  };
}

function makeDeps(accessToken = null, storedId = 'acc1') {
  const repo = {
    getByPlatform: (userId, platform) =>
      accessToken ? { id: storedId, user_id: userId, platform, access_token: accessToken, is_active: 1 } : null,
    findByUserId: () => [],
    update: vi.fn(() => ({ id: storedId })),
  };
  return { repos: { platformAccountsRepo: repo } };
}

describe('per-user ads handlers (disable/enable scoped to user token)', () => {
  beforeEach(() => {
    mockGetAdAccounts.mockReset();
    mockGetCampaigns.mockReset();
    mockGetAccountInsights.mockReset();
    mockUpdateCampaign.mockReset();
    mockGetAdAccounts.mockResolvedValue([
      { id: '1181078009580337', name: 'Selow ID 1340', status: 'active' },
    ]);
    mockGetCampaigns.mockResolvedValue([
      { id: 'c1', name: 'Camp A', status: 'active' },
      { id: 'c2', name: 'Camp B', status: 'paused' },
    ]);
    mockGetAccountInsights.mockResolvedValue({ spend: 100000, revenue: 250000, clicks: 50, impressions: 5000 });
    mockUpdateCampaign.mockResolvedValue({ success: true });
  });

  it('handleAds lists the user\'s OWN ad accounts via stored token', async () => {
    const ctx = makeCtx();
    await handleAds(makeDeps('USER_TOKEN'))(ctx);
    const text = ctx._replies[1];
    expect(text).toContain('Your Meta Ad Accounts');
    expect(text).toContain('act_1181078009580337');
    // The token passed to MetaAdsAPI must be the user's stored token, not a global/system token.
    expect(mockGetAdAccounts).toHaveBeenCalled();
    // withToken received the per-user token
    expect(ctx._replies[0]).toContain('Loading');
  });

  it('handleAds reports "No Meta account connected" when no stored token', async () => {
    const ctx = makeCtx();
    await handleAds(makeDeps(null))(ctx);
    const text = ctx._replies[0];
    expect(text).toContain('No Meta account connected');
  });

  it('handleAdsSelect reads campaigns for the chosen account (read-only)', async () => {
    const ctx = makeCtx();
    await handleAdsSelect(makeDeps('USER_TOKEN'))(ctx, 'act_1181078009580337');
    const text = ctx._replies[1];
    expect(text).toContain('Campaigns in act_1181078009580337');
    expect(text).toContain('Camp A');
    expect(mockGetCampaigns).toHaveBeenCalledWith('act_1181078009580337');
  });

  it('handleAdsToggle pauses an active campaign -> updateCampaign PAUSED', async () => {
    const ctx = makeCtx();
    await handleAdsToggle(makeDeps('USER_TOKEN'))(ctx, 'act_1181078009580337', 'c1', 'pause');
    expect(mockUpdateCampaign).toHaveBeenCalledWith('c1', { status: 'PAUSED' });
    expect(ctx._replies[1]).toContain('paused');
  });

  it('handleAdsToggle resumes a paused campaign -> updateCampaign ACTIVE', async () => {
    const ctx = makeCtx();
    await handleAdsToggle(makeDeps('USER_TOKEN'))(ctx, 'act_1181078009580337', 'c2', 'resume');
    expect(mockUpdateCampaign).toHaveBeenCalledWith('c2', { status: 'ACTIVE' });
    expect(ctx._replies[1]).toContain('resumed');
  });

  it('handleAdsReport aggregates spend across accounts', async () => {
    const ctx = makeCtx();
    await handleAdsReport(makeDeps('USER_TOKEN'))(ctx);
    const text = ctx._replies[1];
    expect(text).toContain('Meta Ads Report');
    expect(text).toContain('Rp 100.000'); // totalSpend formatted
    expect(mockGetAccountInsights).toHaveBeenCalledWith('1181078009580337', expect.objectContaining({ datePreset: 'last_30d' }));
  });

  it('handleAdsDisconnect deactivates the stored account row', async () => {
    const deps = makeDeps('USER_TOKEN');
    const ctx = makeCtx();
    await handleAdsDisconnect(deps)(ctx);
    expect(deps.repos.platformAccountsRepo.update).toHaveBeenCalledWith('acc1', { is_active: 0 });
    expect(ctx._replies[0]).toContain('Disconnected');
  });
});
