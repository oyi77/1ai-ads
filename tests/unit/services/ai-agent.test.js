import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AiAgent } from '../../../server/services/ai-agent.js';

function makeMocks() {
  const settingsRepo = { get: vi.fn().mockReturnValue(true) };
  const adsRepo = {
    getByUserId: vi.fn().mockReturnValue([
      { id: 'ad1', title: 'Test Ad', status: 'active', platform: 'meta' },
    ]),
    update: vi.fn(),
  };
  const campaignsRepo = { getAll: vi.fn().mockReturnValue([]) };
  const llmClient = {
    call: vi.fn().mockResolvedValue(JSON.stringify([
      {
        type: 'ad_copy',
        target_id: 'ad1',
        target_type: 'ad',
        changes: [{ field: 'headline', value: 'Better Headline' }],
        rationale: 'Low CTR detected',
      },
    ])),
  };
  const suggestionsRepo = {
    create: vi.fn().mockReturnValue('sug1'),
    getById: vi.fn().mockReturnValue({ id: 'sug1', user_id: 'u1', type: 'ad_copy', target_id: 'ad1', target_type: 'ad', suggestion: JSON.stringify({ changes: [{ field: 'headline', value: 'Better' }] }), rationale: 'Low CTR', status: 'pending' }),
    updateStatus: vi.fn().mockReturnValue({ id: 'sug1', status: 'applied', applied_at: new Date().toISOString() }),
    listByUser: vi.fn().mockReturnValue([]),
  };
  const landingPagesRepo = { update: vi.fn() };
  return { settingsRepo, adsRepo, campaignsRepo, llmClient, suggestionsRepo, landingPagesRepo };
}

describe('AiAgent', () => {
  let agent;
  let mocks;

  beforeEach(() => {
    mocks = makeMocks();
    agent = new AiAgent(mocks.settingsRepo, mocks.adsRepo, mocks.campaignsRepo, mocks.llmClient, mocks.suggestionsRepo, mocks.landingPagesRepo);
  });

  it('analyzeAndSuggest returns [] when ai_mode_enabled is false', async () => {
    mocks.settingsRepo.get.mockReturnValue(false);
    const result = await agent.analyzeAndSuggest('u1');
    expect(result).toEqual([]);
    expect(mocks.llmClient.call).not.toHaveBeenCalled();
  });

  it('analyzeAndSuggest calls LLM and creates suggestion with pending status when auto mode off', async () => {
    mocks.settingsRepo.get.mockImplementation((key) => key === 'ai_mode_enabled' ? true : false);
    const ids = await agent.analyzeAndSuggest('u1');
    expect(ids).toHaveLength(1);
    expect(mocks.suggestionsRepo.create).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' }));
  });

  it('analyzeAndSuggest auto-applies suggestions when auto_mode is on', async () => {
    mocks.settingsRepo.get.mockReturnValue(true); // both enabled
    const ids = await agent.analyzeAndSuggest('u1');
    expect(ids).toHaveLength(1);
    expect(mocks.suggestionsRepo.create).toHaveBeenCalledWith(expect.objectContaining({ status: 'applied' }));
    expect(mocks.adsRepo.update).toHaveBeenCalledWith('ad1', expect.objectContaining({ headline: 'Better Headline' }));
  });

  it('analyzeAndSuggest returns [] when LLM returns invalid JSON', async () => {
    mocks.llmClient.call.mockResolvedValue('not json');
    const ids = await agent.analyzeAndSuggest('u1');
    expect(ids).toEqual([]);
  });

  it('applySuggestion applies changes and marks status applied', async () => {
    const updated = await agent.applySuggestion('u1', 'sug1');
    expect(mocks.adsRepo.update).toHaveBeenCalled();
    expect(mocks.suggestionsRepo.updateStatus).toHaveBeenCalledWith('sug1', 'applied');
    expect(updated.status).toBe('applied');
  });

  it('applySuggestion throws when suggestion not found', async () => {
    mocks.suggestionsRepo.getById.mockReturnValue(null);
    await expect(agent.applySuggestion('u1', 'missing')).rejects.toThrow('not found');
  });

  it('applySuggestion throws when suggestion belongs to different user', async () => {
    mocks.suggestionsRepo.getById.mockReturnValue({ id: 'sug1', user_id: 'other', status: 'pending', suggestion: '{}' });
    await expect(agent.applySuggestion('u1', 'sug1')).rejects.toThrow('not found');
  });

  it('analyzeAndSuggest returns [] when no ads or campaigns', async () => {
    mocks.adsRepo.getByUserId.mockReturnValue([]);
    mocks.campaignsRepo.getAll.mockReturnValue([]);
    const ids = await agent.analyzeAndSuggest('u1');
    expect(ids).toEqual([]);
    expect(mocks.llmClient.call).not.toHaveBeenCalled();
  });

  // US-001: landing_page apply
  it('auto-applies landing_page suggestion by calling landingPagesRepo.update', async () => {
    mocks.settingsRepo.get.mockReturnValue(true);
    mocks.llmClient.call.mockResolvedValue(JSON.stringify([{
      type: 'landing_page',
      target_id: 'lp1',
      target_type: 'landing_page',
      changes: [{ field: 'cta_primary', value: 'Buy Now' }, { field: 'product_name', value: 'Super Widget' }],
      rationale: 'Low conversion',
    }]));
    await agent.analyzeAndSuggest('u1');
    expect(mocks.landingPagesRepo.update).toHaveBeenCalledWith('lp1', { cta_primary: 'Buy Now', product_name: 'Super Widget' });
  });

  it('applySuggestion applies landing_page changes via landingPagesRepo.update', async () => {
    mocks.suggestionsRepo.getById.mockReturnValue({
      id: 'sug2', user_id: 'u1', type: 'landing_page', target_id: 'lp1', target_type: 'landing_page',
      suggestion: JSON.stringify({ changes: [{ field: 'cta_primary', value: 'Sign Up' }] }),
      rationale: 'Test', status: 'pending',
    });
    await agent.applySuggestion('u1', 'sug2');
    expect(mocks.landingPagesRepo.update).toHaveBeenCalledWith('lp1', { cta_primary: 'Sign Up' });
    expect(mocks.suggestionsRepo.updateStatus).toHaveBeenCalledWith('sug2', 'applied');
  });

  // US-002: scheduler
  describe('scheduler', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { agent.stopScheduler(); vi.useRealTimers(); });

    it('startScheduler fires analyzeAndSuggest after interval', async () => {
      const spy = vi.spyOn(agent, 'analyzeAndSuggest').mockResolvedValue([]);
      agent.startScheduler(() => ['u1', 'u2'], 1000);
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
      expect(spy).toHaveBeenCalledWith('u1');
      expect(spy).toHaveBeenCalledWith('u2');
    });

    it('stopScheduler prevents further analyzeAndSuggest calls', async () => {
      const spy = vi.spyOn(agent, 'analyzeAndSuggest').mockResolvedValue([]);
      agent.startScheduler(() => ['u1'], 1000);
      agent.stopScheduler();
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
      expect(spy).not.toHaveBeenCalled();
    });

    it('scheduler skips analyzeAndSuggest when AI mode is disabled', async () => {
      mocks.settingsRepo.get.mockReturnValue(false);
      const spy = vi.spyOn(agent, 'analyzeAndSuggest').mockResolvedValue([]);
      agent.startScheduler(() => ['u1'], 1000);
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
      expect(spy).not.toHaveBeenCalled();
    });
  });

  // US-003: creative with design_json
  it('auto-applies creative suggestion updating design_json and content fields', async () => {
    mocks.settingsRepo.get.mockReturnValue(true);
    mocks.llmClient.call.mockResolvedValue(JSON.stringify([{
      type: 'creative',
      target_id: 'ad1',
      target_type: 'ad',
      changes: [
        { field: 'design_json', value: '{"color":"red"}' },
        { field: 'hook', value: 'New Hook' },
        { field: 'body', value: 'New Body' },
        { field: 'cta', value: 'Shop Now' },
      ],
      rationale: 'Refresh creative',
    }]));
    await agent.analyzeAndSuggest('u1');
    expect(mocks.adsRepo.update).toHaveBeenCalledWith('ad1', {
      design_json: '{"color":"red"}',
      hook: 'New Hook',
      body: 'New Body',
      cta: 'Shop Now',
    });
  });
});
