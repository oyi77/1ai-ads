import { describe, it, expect, vi, beforeEach } from 'vitest';

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

const { handleAds, handleAdsSelect, handleAdsToggle, handleAdsReport } =
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

function makeDeps({ accessToken = null, storedId = 'acc1', connected = null } = {}) {
  const repo = {
    getByPlatform: (userId, platform) =>
      accessToken ? { id: storedId, user_id: userId, platform, access_token: accessToken, is_active: 1 } : null,
    findByUserId: () => connected || (accessToken ? [{ id: storedId, platform: 'meta', access_token: accessToken, is_active: 1, account_name: 'Test' }] : []),
    findById: () => null,
    update: vi.fn(() => ({ id: storedId })),
  };
  return { repos: { platformAccountsRepo: repo } };
}

describe('per-user ads handlers (multi-platform)', () => {
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

  it('handleAds shows connect prompt when no connected platforms', async () => {
    const ctx = makeCtx();
    await handleAds(makeDeps({ accessToken: null }))(ctx);
    const text = ctx._replies[0];
    expect(text).toContain('No ad account connected');
  });

  it('handleAds lists ad accounts when single platform connected', async () => {
    const ctx = makeCtx();
    await handleAds(makeDeps({ accessToken: 'USER_TOKEN' }))(ctx);
    const text = ctx._replies[1];
    expect(text).toContain('META Ad Accounts');
    expect(text).toContain('Selow ID 1340');
    expect(mockGetAdAccounts).toHaveBeenCalled();
  });

  it('handleAdsSelect reads campaigns for the chosen account', async () => {
    const ctx = makeCtx();
    await handleAdsSelect(makeDeps({ accessToken: 'USER_TOKEN' }))(ctx, 'meta', '1181078009580337');
    const text = ctx._replies[1];
    expect(text).toContain('Campaigns (2)');
    expect(text).toContain('Camp A');
    expect(mockGetCampaigns).toHaveBeenCalledWith('1181078009580337');
  });

  it('handleAdsToggle pauses an active campaign', async () => {
    const ctx = makeCtx();
    await handleAdsToggle(makeDeps({ accessToken: 'USER_TOKEN' }))(ctx, 'meta', '1181078009580337', 'c1', 'pause');
    expect(mockUpdateCampaign).toHaveBeenCalledWith('c1', { status: 'PAUSED' });
    expect(ctx._replies[1]).toContain('paused');
  });

  it('handleAdsToggle resumes a paused campaign', async () => {
    const ctx = makeCtx();
    await handleAdsToggle(makeDeps({ accessToken: 'USER_TOKEN' }))(ctx, 'meta', '1181078009580337', 'c2', 'resume');
    expect(mockUpdateCampaign).toHaveBeenCalledWith('c2', { status: 'ACTIVE' });
    expect(ctx._replies[1]).toContain('resumed');
  });
});
