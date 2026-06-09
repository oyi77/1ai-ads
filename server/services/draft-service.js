import { createLogger } from '../lib/logger.js';
import { ValidationError, NotFoundError } from '../lib/errors.js';

const log = createLogger('draft-service');

export class DraftService {
  constructor(draftsRepo, telegramService = null) {
    this.draftsRepo = draftsRepo;
    this.telegramService = telegramService;
  }

  async listDrafts(status = 'pending') {
    return this.draftsRepo.findAll(status);
  }

  async createDraft({ type, summary, details, proposedBy = 'ai' }) {
    if (!type) throw new ValidationError('type is required');
    if (!summary) throw new ValidationError('summary is required');

    const draft = this.draftsRepo.create({ type, summary, details, proposedBy });
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

  async _notify(draft, action) {
    if (!this.telegramService) return;
    const emoji = action === 'approved' ? '✅' : action === 'rejected' ? '❌' : '📝';
    const msg = `${emoji} Draft ${action}: ${draft.summary} (${draft.type})`;
    await this.telegramService.sendMessage(msg);
    log.debug('telegram notification sent', { draftId: draft.id, action });
  }
}
