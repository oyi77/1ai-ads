import { createLogger } from '../lib/logger.js';
import { ValidationError, NotFoundError } from '../lib/errors.js';

const log = createLogger('draft-service');

const TELEGRAM_API = 'https://api.telegram.org';

export class DraftService {
  constructor(draftsRepo, telegramService = null) {
    this.draftsRepo = draftsRepo;
    this.telegramService = telegramService;
  }

  async listDrafts(status = 'pending', { page = 1, limit = 50 } = {}) {
    return this.draftsRepo.findAll({ status, page, limit });
  }

  async createDraft({ type, summary, details, proposedBy = 'ai', campaignId = null, approvalRequestId = null }) {
    if (!type) throw new ValidationError('type is required');
    if (!summary) throw new ValidationError('summary is required');

    const draft = this.draftsRepo.create({
      type,
      summary,
      details,
      proposedBy,
      campaignId,
      approvalRequestId,
    });
    this._notify(draft, 'created').catch(err =>
      log.error('notification failed', { draftId: draft.id, error: err.message })
    );
    return draft;
  }

  async approveDraft(id, userId, executionResult = null) {
    const existing = this.draftsRepo.findById(id);
    if (!existing) throw new NotFoundError('Draft not found');
    if (existing.status !== 'pending') throw new ValidationError(`Draft is already ${existing.status}`);

    const draft = this.draftsRepo.approve(id, { reviewedBy: userId, executionResult });
    this._notify(draft, 'approved').catch(err =>
      log.error('notification failed', { draftId: id, error: err.message })
    );
    return draft;
  }

  async rejectDraft(id, userId, rejectionReason = null) {
    const existing = this.draftsRepo.findById(id);
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
   * of being applied live. Returns true when the caller should SKIP the live mutation.
   */
  async guardAutonomousChange({ type, summary, details, proposedBy = 'ai', campaignId = null }) {
    if (!this.draftsRepo.settingsRepo || !this.draftsRepo.settingsRepo.getApprovalRequired()) {
      return false;
    }
    const reqId = `apr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await this.createDraft({ type, summary, details, proposedBy, campaignId, approvalRequestId: reqId });
    return true;
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
    const token = process.env.TELEGRAM_BOT_TOKEN || (this._settings() && this._settings().get('telegram_token'));
    const chatId = process.env.TELEGRAM_CHAT_ID || (this._settings() && this._settings().get('telegram_chat_id'));
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

  _settings() {
    return this.draftsRepo?.settingsRepo || null;
  }
}
