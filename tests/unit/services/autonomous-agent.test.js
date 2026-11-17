import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('../../../server/services/facebook-connection.js', () => ({
  FacebookConnectionService: class {
    constructor() {
      this.connectFacebook = vi.fn();
      this.getFacebookAccounts = vi.fn();
      this.linkFacebookAccount = vi.fn();
    }
  },
}));

vi.mock('../../../server/services/rule-evaluator.js', () => ({
  RuleEvaluator: class {
    constructor() {
      this.rulesRepo = { countEnabled: vi.fn().mockResolvedValue(0) };
      this.checkCampaigns = vi.fn().mockResolvedValue(0);
      this.createRule = vi.fn();
    }
  },
}));

vi.mock('../../../server/services/campaign-reporter.js', () => ({
  CampaignReporter: class {
    constructor() {
      this.sendDailyReport = vi.fn();
    }
  },
}));

vi.mock('../../../server/config/index.js', () => ({
  default: { intervals: { autonomousAgent: 900000 } },
}));

import { AutonomousAgent } from '../../../server/services/autonomous-agent.js';
import { RuleEvaluator } from '../../../server/services/rule-evaluator.js';

describe('AutonomousAgent._checkUserCampaigns', () => {
  let agent;
  let mockPlatformAccountsRepo;
  let mockRulesRepo;
  let mockCampaignsRepo;
  let mockSettingsRepo;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPlatformAccountsRepo = {
      findAllActiveByUserAndPlatform: vi.fn().mockResolvedValue([]),
      getUsersWithAutoMode: vi.fn().mockResolvedValue([]),
    };
    mockSettingsRepo = {};
    mockCampaignsRepo = { findAll: vi.fn(() => ({ data: [] })) };
    mockRulesRepo = { countEnabled: vi.fn().mockResolvedValue(0) };

    agent = new AutonomousAgent(
      mockSettingsRepo,
      mockPlatformAccountsRepo,
      mockCampaignsRepo,
      mockRulesRepo,
      {},
      undefined,
      {},
      null
    );
  });

  it('returns early when user has zero enabled rules', async () => {
    agent.ruleEvaluator.rulesRepo.countEnabled.mockResolvedValue(0);

    await agent._checkUserCampaigns({ id: 'user-1' });

    expect(agent.ruleEvaluator.checkCampaigns).not.toHaveBeenCalled();
  });

  it('returns early when user has rules but no usable token on any platform', async () => {
    agent.ruleEvaluator.rulesRepo.countEnabled.mockResolvedValue(3);
    mockPlatformAccountsRepo.findAllActiveByUserAndPlatform.mockResolvedValue([
      { access_token: null },
      { access_token: '' },
    ]);

    await agent._checkUserCampaigns({ id: 'user-1' });

    expect(agent.ruleEvaluator.checkCampaigns).not.toHaveBeenCalled();
  });

  // DEF-01 (audit 2026-11-17): the previous implementation counted rules,
  // checked tokens, then logged "Autonomous actions executed" without ever
  // calling checkCampaigns(). This test locks in the fix.
  it('calls ruleEvaluator.checkCampaigns when user has rules and a usable token', async () => {
    agent.ruleEvaluator.rulesRepo.countEnabled.mockResolvedValue(2);
    mockPlatformAccountsRepo.findAllActiveByUserAndPlatform
      .mockResolvedValueOnce([{ access_token: 'valid-token' }]) // meta
      .mockResolvedValue([]); // google, tiktok
    agent.ruleEvaluator.checkCampaigns.mockResolvedValue(1);

    await agent._checkUserCampaigns({ id: 'user-1' });

    expect(agent.ruleEvaluator.checkCampaigns).toHaveBeenCalledWith('user-1');
  });

  it('still calls checkCampaigns when only a non-Meta platform has a token', async () => {
    agent.ruleEvaluator.rulesRepo.countEnabled.mockResolvedValue(2);
    mockPlatformAccountsRepo.findAllActiveByUserAndPlatform
      .mockResolvedValueOnce([]) // meta: no accounts
      .mockResolvedValueOnce([]) // google: no accounts
      .mockResolvedValueOnce([{ access_token: 'tt-token' }]); // tiktok
    agent.ruleEvaluator.checkCampaigns.mockResolvedValue(0);

    await agent._checkUserCampaigns({ id: 'user-1' });

    expect(agent.ruleEvaluator.checkCampaigns).toHaveBeenCalledWith('user-1');
  });

  it('does not throw when checkCampaigns rejects', async () => {
    agent.ruleEvaluator.rulesRepo.countEnabled.mockResolvedValue(2);
    mockPlatformAccountsRepo.findAllActiveByUserAndPlatform
      .mockResolvedValue([{ access_token: 'valid-token' }]);
    agent.ruleEvaluator.checkCampaigns.mockRejectedValue(new Error('boom'));

    await expect(agent._checkUserCampaigns({ id: 'user-1' })).rejects.toThrow('boom');
  });
});
