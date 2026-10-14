import { createLogger } from '../lib/logger.js';
import { ValidationError, NotFoundError } from '../lib/errors.js';

const log = createLogger('draft-service');

// Drafts encode a decision made against campaign state at creation time. The
// longer they sit, the more that decision can drift from reality — approving a
// "pause" draft after ROAS recovered pauses a healthy campaign (live-proven:
// 3 pending ai_optimize pause drafts 4–43 days old pointing at currently
// ACTIVE campaigns). Cap the age at which a pending draft may still execute.
export const DRAFT_MAX_AGE_DAYS = 14;
// Non-replayable drafts (ai/optimizer suggestions) carry even less value: the
// metrics that produced them are long gone, so they expire sooner.
export const NON_REPLAYABLE_MAX_AGE_DAYS = 7;
const REPLAYABLE_TYPES = new Set(['rule_pause', 'rule_increase_budget', 'rule_decrease_budget']);

const TELEGRAM_API = 'https://api.telegram.org';

// Saran aksi Bahasa Indonesia berdasar pola pesan error Meta/executor.
// Biar user yang pencet ✅ tapi gagal tahu harus ngapain, bukan cuma "gagal".
export function hintForExecutionError(msg) {
  const m = String(msg || '').toLowerCase();
  if (/expired|invalid.*token|cannot parse access token|session has expired|190/.test(m)) {
    return 'Token Meta kedaluwarsa — hubungkan ulang via /status → ➕ Tambah Akun.';
  }
  if (/permission|permissions|803|10\)|not.*authorized|forbidden/.test(m)) {
    return 'Token kurang izin — hubungkan ulang dengan izin ads_management + ads_read.';
  }
  if (/does not exist|not found|803|missing|deleted/.test(m)) {
    return 'Campaign tidak ketemu di Meta — sync dulu via /monitor → 🔄 Sync Sekarang.';
  }
  if (/rate|limit|throttl|429/.test(m)) {
    return 'Kena rate-limit Meta — coba ✅ lagi 10 menit lagi.';
  }
  return 'Coba ✅ lagi nanti. Kalau masih gagal, hubungi admin.';
}

/**
 * Owner-or-admin gate for draft review. A draft belongs to the user whose
 * campaign produced it; anyone else gets NotFound (never 403 — a 403 would
 * confirm the id exists). Admin may review any draft: the HTTP review routes
 * are requireAdmin-gated admin ops, while the bot reviews same-owner drafts.
 */
function assertOwnerOrAdmin(draft, userId, isAdmin) {
  if (isAdmin) return;
  if (draft.user_id && userId && String(draft.user_id) !== String(userId)) {
    throw new NotFoundError('Draft not found');
  }
}

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

  async createDraft({ type, summary, details, proposedBy = 'ai', userId = null, campaignId = null, approvalRequestId = null, ruleId = null }) {
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
      ruleId,
    });
    this._notify(draft, 'created').catch(err =>
      log.error('notification failed', { draftId: draft.id, error: err.message })
    );
    return draft;
  }

  async approveDraft(id, userId, executionResult = null, { isAdmin = false } = {}) {
    const existing = await this.draftsRepo.findById(id);
    if (!existing) throw new NotFoundError('Draft not found');
    assertOwnerOrAdmin(existing, userId, isAdmin);
    if (existing.status !== 'pending') throw new ValidationError(`Draft is already ${existing.status}`);
    // ── Staleness guard ────────────────────────────────────────────
    // A pending draft is a snapshot of a decision. Approving it weeks later
    // executes that decision against TODAY'S campaign state, which can invert
    // the intent — pausing a campaign that has since recovered (live-proven:
    // 3 pending ai_optimize pause drafts 4–43 days old pointing at currently
    // ACTIVE campaigns). Expire instead of executing, and tell the owner why.
    const ageDays = (Date.now() - new Date(String(existing.created_at).replace(' ', 'T') + 'Z').getTime()) / 86400000;
    const maxAge = REPLAYABLE_TYPES.has(existing.type) ? DRAFT_MAX_AGE_DAYS : NON_REPLAYABLE_MAX_AGE_DAYS;
    if (Number.isFinite(ageDays) && ageDays > maxAge) {
      try {
        this.draftsRepo.reject(id, {
          reviewedBy: 'system:expiry',
          rejectionReason: `Kedaluwarsa — draft ${Math.floor(ageDays)} hari (batas ${maxAge}). Keadaan campaign kemungkinan sudah berubah; minta saran/aturan baru.`,
        });
      } catch (err) {
        log.error('Failed to persist draft expiry', { draftId: id, error: err.message });
      }
      log.warn('Draft expired on approval (stale decision)', {
        draftId: id, type: existing.type, ageDays: Math.floor(ageDays), maxAge,
      });
      throw new ValidationError(
        `Draft sudah ${Math.floor(ageDays)} hari (batas ${maxAge} hari) jadi saya batalkan otomatis. ` +
        `Keadaan campaign kemungkinan sudah berubah — minta saran baru biar keputusannya pakai data terkini.`
      );
    }

    // Externally-executed approval: record the caller's result verbatim.
    // A blank result proves nothing ran — reject it rather than stamping
    // an empty receipt as "approved".
    if (executionResult !== null && executionResult !== undefined) {
      if (typeof executionResult === 'string' && executionResult.trim() === '') {
        throw new ValidationError('executionResult kosong — kirim bukti eksekusi atau kosongkan untuk replay.');
      }
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
        const msg = String(err?.message || err || 'unknown error');
        log.error('Draft execution failed; draft left pending', { draftId: id, error: msg });
        // Visibilitas: tulis sebab gagal ke draft biar user yang cek /approvals
        // tahu kenapa, bukan cuma "pending selamanya". Draft tetap pending
        // (retryable) — status TIDAK diubah.
        try {
          this.draftsRepo.noteExecutionFailure?.(id, msg);
        } catch { /* kolom belum ada di DB lama — migrasi 050 yang vonis */ }
        this._notify({ ...existing, summary: `Execution failed: ${existing.summary}` }, 'failed').catch(err =>
          log.error('draft notification failed', { draftId: id, error: err.message }));
        throw new ValidationError(`Eksekusi gagal: ${msg}. ${hintForExecutionError(msg)}`);
      }
    }

    // Non-replayable draft (e.g. ai/optimizer suggestion): approve without live mutation.
    const draft = this.draftsRepo.approve(id, { reviewedBy: userId });
    this._notify(draft, 'approved').catch(err =>
      log.error('notification failed', { draftId: id, error: err.message })
    );
    return draft;
  }

  async rejectDraft(id, userId, rejectionReason = null, { isAdmin = false } = {}) {
    const existing = await this.draftsRepo.findById(id);
    if (!existing) throw new NotFoundError('Draft not found');
    assertOwnerOrAdmin(existing, userId, isAdmin);
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
  async guardAutonomousChange({ type, summary, details, proposedBy = 'ai', userId = null, campaignId = null, ruleId = null }) {
    if (!this.draftsRepo.settingsRepo || !this.draftsRepo.settingsRepo.getApprovalRequired()) {
      return false;
    }
    const reqId = `apr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const draft = await this.createDraft({ type, summary, details, proposedBy, userId, campaignId, approvalRequestId: reqId, ruleId });
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
