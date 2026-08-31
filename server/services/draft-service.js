import { createLogger } from '../lib/logger.js';
import { ValidationError, NotFoundError } from '../lib/errors.js';

const log = createLogger('draft-service');

const TELEGRAM_API = 'https://api.telegram.org';

export class DraftService {
  constructor(draftsRepo, telegramService = null, executor = null) {
    this.draftsRepo = draftsRepo;
    this.telegramService = telegramService;
    this.executor = executor || null;
  }

  setExecutor(fn) {
    this.executor = fn || null;
    return this;
  }

  async listDrafts(status = 'pending', { page = 1, limit = 50, userId = null } = {}) {
    if (userId) return this.draftsRepo.findByUser(userId, { status, page, limit });
    return this.draftsRepo.findAll({ status, page, limit });
  }

  async createDraft({ type, summary, details, proposedBy = 'ai', userId = null, campaignId = null, approvalRequestId = null }) {
    if (!type) throw new ValidationError('type is required');
    if (!summary) throw new ValidationError('summary is required');

    const draft = await this.draftsRepo.create({
      type,
      summary,
      details,
      proposedBy,
      userId,
      campaignId,
      approvalRequestId,
    });
    this._notify(draft, 'created').catch(err =>
      log.error('notification failed', { draftId: draft.id, error: err.message })
    );
    return draft;
  }

  async approveDraft(id, userId, executionResult = null) {
    const existing = await this.draftsRepo.findById(id);
    if (!existing) throw new NotFoundError('Draft not found');
    if (existing.status !== 'pending') throw new ValidationError(`Draft is already ${existing.status}`);

    // Externally-executed approval: just record the result.
    if (executionResult) {
      const draft = this.draftsRepo.approve(id, { reviewedBy: userId, executionResult });
      this._notify(draft, 'approved').catch(err =>
        log.error('notification failed', { draftId: id, error: err.message })
      );
      return draft;
    }

    // Replay the deferred mutation for replayable rule drafts ({action, campaign}),
    // then approve. On execution failure the draft stays pending and is retryable.
    const details = this._parseDetails(existing);
    if (this.executor && details && details.action && details.campaign) {
      try {
        const result = await this.executor(details.action, details.campaign);
        const draft = this.draftsRepo.approve(id, { reviewedBy: userId, executionResult: result });
        this._notify(draft, 'approved').catch(err =>
          log.error('notification failed', { draftId: id, error: err.message })
        );
        return draft;
      } catch (err) {
        log.error('Draft execution failed; draft left pending', { draftId: id, error: err.message });
        this._notify({ ...existing, summary: `Execution failed: ${existing.summary}` }, 'failed').catch(() => {});
        throw new ValidationError(`Execution failed: ${err.message}`);
      }
    }

    // Non-replayable draft (e.g. ai/optimizer suggestion): approve without live mutation.
    const draft = this.draftsRepo.approve(id, { reviewedBy: userId });
    this._notify(draft, 'approved').catch(err =>
      log.error('notification failed', { draftId: id, error: err.message })
    );
    return draft;
  }

  async rejectDraft(id, userId, rejectionReason = null) {
    const existing = await this.draftsRepo.findById(id);
    if (!existing) throw new NotFoundError('Draft not found');
    if (existing.status !== 'pending') throw new ValidationError(`Draft is already ${existing.status}`);

    const draft = this.draftsRepo.reject(id, { reviewedBy: userId, rejectionReason });
    this._notify(draft, 'rejected').catch(err =>
      log.error('notification failed', { draftId: id, error: err.message })
    );
    return draft;
  }

  /**
   * Guard for autonomous mutation paths (auto-optimizer, ai-agent).
   * When approval is required, the intended change is recorded as a draft instead
   * of being applied live. Returns the created draft when approval is required,
   * or false when the caller may proceed with the live mutation.
   */
  async guardAutonomousChange({ type, summary, details, proposedBy = 'ai', userId = null, campaignId = null }) {
    if (!this.draftsRepo.settingsRepo || !this.draftsRepo.settingsRepo.getApprovalRequired()) {
      return false;
    }
    const reqId = `apr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const draft = await this.createDraft({ type, summary, details, proposedBy, userId, campaignId, approvalRequestId: reqId });
    return draft;
  }

  async _notify(draft, action) {
    if (this.telegramService) {
      const emoji = action === 'approved' ? '✅' : action === 'rejected' ? '❌' : '📝';
      const msg = `${emoji} Draft ${action}: ${draft.summary} (${draft.type})`;
      try {
        await this.telegramService.sendMessage(msg);
        log.debug('telegram notification sent', { draftId: draft.id, action });
      } catch (err) {
        log.warn('telegram notify failed', { draftId: draft.id, error: err.message });
      }
      return;
    }
    await this._notifyDirect(draft, action);
  }

  // Self-contained outbound notify (mirrors BoostApprovalService._notify).
  // Reads token/chat from env (preferred) or settingsRepo. Outbound only.
  async _notifyDirect(draft, action) {
    const settings = this._settings && typeof this._settings === 'function' ? this._settings() : null;
    const getVal = settings && typeof settings.get === 'function' ? (k) => settings.get(k) : () => null;
    const token = process.env.TELEGRAM_BOT_TOKEN || getVal('telegram_token');
    const chatId = process.env.TELEGRAM_CHAT_ID || getVal('telegram_chat_id');
    if (!token || !chatId) return;

    const emoji = action === 'approved' ? '✅' : action === 'rejected' ? '❌' : '📝';
    const text = `${emoji} <b>Draft ${action}</b>\n${draft.summary}\n<code>${draft.type}</code>`;
    try {
      await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
      });
    } catch (err) {
      log.warn('telegram direct notify failed', { draftId: draft.id, error: err.message });
    }
  }

  _parseDetails(draft) {
    if (!draft) return null;
    if (typeof draft.details === 'object' && draft.details !== null) return draft.details;
    if (typeof draft.details_json === 'string') {
      try { return JSON.parse(draft.details_json); } catch { return null; }
    }
    return null;
  }

  _settings() {
    const repo = this.draftsRepo?.settingsRepo || this.draftsRepo || null;
    return repo && typeof repo.get === 'function' ? repo : null;
  }
}
