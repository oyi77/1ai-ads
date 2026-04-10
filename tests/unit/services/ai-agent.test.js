import { describe, it, expect, beforeEach, vi } from 'vitest';
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
  return { settingsRepo, adsRepo, campaignsRepo, llmClient, suggestionsRepo };
}

describe('AiAgent', () => {
  let agent;
  let mocks;

  beforeEach(() => {
    mocks = makeMocks();
    agent = new AiAgent(mocks.settingsRepo, mocks.adsRepo, mocks.campaignsRepo, mocks.llmClient, mocks.suggestionsRepo);
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
});
