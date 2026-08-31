import { createLogger } from '../lib/logger.js';

const log = createLogger('ai-agent');

const VALID_LEVELS = ['off', 'manual', 'semi_auto', 'fully_auto'];
const SEMI_AUTO_TYPES = new Set(['ad_copy', 'creative']);

const SYSTEM_PROMPT = `You are an AI advertising optimization agent.
Analyze the provided campaigns, ads, and analytics data, then return improvement suggestions as a JSON array.
Each suggestion must be: { type: "ad_copy"|"landing_page"|"bid"|"pause_ad"|"creative", target_id: string, target_type: "ad"|"campaign"|"landing_page", changes: [{field, value}], rationale: string }
Return ONLY a valid JSON array of suggestions, no other text.`;

export class AiAgent {
  constructor(settingsRepo, adsRepo, campaignsRepo, llmClient, suggestionsRepo, landingPagesRepo, draftService = null) {
    this.settingsRepo = settingsRepo;
    this.adsRepo = adsRepo;
    this.campaignsRepo = campaignsRepo;
    this.llmClient = llmClient;
    this.suggestionsRepo = suggestionsRepo;
    this.landingPagesRepo = landingPagesRepo;
    this.draftService = draftService;
  }

  getAutonomyLevel() {
    const level = this.settingsRepo.get('ai_autonomy_level');
    return VALID_LEVELS.includes(level) ? level : 'off';
  }

  isEnabled() {
    return this.getAutonomyLevel() !== 'off';
  }

  isAutoMode() {
    return this.getAutonomyLevel() === 'fully_auto';
  }

  shouldAutoApply(type) {
    const level = this.getAutonomyLevel();
    if (level === 'fully_auto') return true;
    if (level === 'semi_auto') return SEMI_AUTO_TYPES.has(type);
    return false;
  }

  async analyzeAndSuggest(userId) {
    if (!this.isEnabled()) return [];

    const ads = this.adsRepo.findAll ? this.adsRepo.findAll({ userId }).data || [] : [];
    const campaigns = this.campaignsRepo.findAll ? this.campaignsRepo.findAll({ userId }).data || [] : [];
    if (ads.length === 0 && campaigns.length === 0) return [];

    const context = this._buildAnalysisContext(ads, campaigns);
    const suggestions = await this._fetchSuggestions(context);
    if (suggestions.length === 0) return [];

    const created = [];
    for (const s of suggestions) {
      const id = await this._persistSuggestion(userId, s);
      created.push(id);
    }
    return created;
  }

  _buildAnalysisContext(ads, campaigns) {
    return JSON.stringify({
      ads: ads.slice(0, 10).map(a => ({ id: a.id, title: a.title, status: a.status, platform: a.platform })),
      campaigns: campaigns.slice(0, 5).map(c => ({ id: c.id, name: c.name, status: c.status, budget: c.budget })),
    });
  }

  async _fetchSuggestions(context) {
    try {
      const response = await this.llmClient.call(SYSTEM_PROMPT, `Analyze these ads and campaigns and suggest improvements:\n${context}`);
      const parsed = JSON.parse(response);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      log.warn('AI analysis failed', { error: err.message });
      return [];
    }
  }

  async _persistSuggestion(userId, s) {
    const autoApply = Boolean(s.target_id) && this.shouldAutoApply(s.type || 'ad_copy');
    const status = autoApply ? 'applied' : 'pending';
    const id = this.suggestionsRepo.create({
      user_id: userId,
      type: s.type || 'ad_copy',
      target_id: s.target_id || null,
      target_type: s.target_type || null,
      suggestion: JSON.stringify({ changes: s.changes || [] }),
      rationale: s.rationale || '',
      status,
    });

    if (autoApply) {
      // Approval gate: if enabled, keep the change as a draft instead of live-apply.
      const intercepted = this.draftService
        ? await this.draftService.guardAutonomousChange({
            type: `ai_apply_${s.type || 'ad_copy'}`,
            summary: `AI auto-apply ${s.type} on ${s.target_type} ${s.target_id}`,
            details: { suggestion: s, userId },
            proposedBy: 'ai-agent',
            campaignId: s.target_type === 'campaign' ? s.target_id : null,
          })
        : false;
      if (!intercepted) {
        await this._applyChanges(s).catch(err => log.warn('Auto-apply failed', { id, error: err.message }));
        this.suggestionsRepo.updateStatus(id, 'applied');
      }
    }
    return id;
  }

  async applySuggestion(userId, suggestionId) {
    const row = this.suggestionsRepo.getById(suggestionId);
    if (!row || row.user_id !== userId) throw new Error('Suggestion not found');
    if (row.status !== 'pending') throw new Error(`Suggestion is already ${row.status}`);

    const suggestion = this._parseSuggestion(row.suggestion);
    await this._applyChanges({ type: row.type, target_id: row.target_id, target_type: row.target_type, changes: suggestion.changes || [] });
    return this.suggestionsRepo.updateStatus(suggestionId, 'applied');
  }

  _parseSuggestion(value) {
    if (!value) return {};
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch { return {}; }
  }

  async _applyChanges(suggestion) {
    const { type, target_id, changes = [] } = suggestion;
    if (!target_id || changes.length === 0) return;

    if (type === 'ad_copy' || type === 'creative') {
      const updates = {};
      for (const { field, value } of changes) updates[field] = value;
      if (this.adsRepo.update) this.adsRepo.update(target_id, updates);
    } else if (type === 'pause_ad') {
      if (this.adsRepo.update) this.adsRepo.update(target_id, { status: 'paused' });
    } else if (type === 'landing_page') {
      const updates = {};
      for (const { field, value } of changes) updates[field] = value;
      if (this.landingPagesRepo?.update) this.landingPagesRepo.update(target_id, updates);
    }
  }

  startScheduler(getActiveUserIds, intervalMs = 5 * 60 * 1000) {
    this._schedulerInterval = setInterval(async () => {
      if (!this.isEnabled()) return;
      const userIds = getActiveUserIds();
      for (const userId of userIds) {
        this.analyzeAndSuggest(userId).catch(err => log.warn('Scheduler analyzeAndSuggest failed', { userId, error: err.message }));
      }
    }, intervalMs);
  }

  stopScheduler() {
    clearInterval(this._schedulerInterval);
    this._schedulerInterval = null;
  }
}
