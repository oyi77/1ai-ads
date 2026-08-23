/**
 * Approval-draft inline callbacks — owner-scoped Approve/Reject for the
 * autonomous rule-guard drafts the scheduler creates (approval_drafts).
 *
 * Every action is scoped to ctx.userId (the internal multi-tenant UUID set by
 * the identify middleware). A draft whose user_id differs from the caller is
 * rejected outright — the owner (and only the owner) may act on it.
 *
 * Callback data: approval:approve:<draftId> / approval:reject:<draftId>
 */
import { createLogger } from '../../lib/logger.js';
import { ValidationError } from '../../lib/errors.js';

const log = createLogger('bot:approvals');

/** Resolve the draft + verify owner before any mutation. */
async function resolveOwnedDraft(deps, ctx, draftId) {
  const draft = await deps.services.draftService.draftsRepo.findById(draftId);
  if (!draft) return { error: 'Draft tidak ditemukan' };
  if (draft.user_id !== ctx.userId) {
    return { error: 'Ini bukan draft kamu' };
  }
  return { draft };
}

export function handleApprovalApprove(deps) {
  return async (ctx, draftId) => {
    try {
      const { draft, error } = await resolveOwnedDraft(deps, ctx, draftId);
      if (!draft) return ctx.reply(error);
      await deps.services.draftService.approveDraft(draftId, ctx.userId);
      return ctx.reply('✅ Approved');
    } catch (err) {
      if (err instanceof ValidationError) return ctx.reply(err.message);
      log.error('approval approve failed', { userId: ctx.userId, draftId, error: err?.message });
      return ctx.reply('⚠️ Gagal menyetujui draft.');
    }
  };
}

export function handleApprovalReject(deps) {
  return async (ctx, draftId) => {
    try {
      const { draft, error } = await resolveOwnedDraft(deps, ctx, draftId);
      if (!draft) return ctx.reply(error);
      await deps.services.draftService.rejectDraft(draftId, ctx.userId);
      return ctx.reply('❌ Rejected');
    } catch (err) {
      if (err instanceof ValidationError) return ctx.reply(err.message);
      log.error('approval reject failed', { userId: ctx.userId, draftId, error: err?.message });
      return ctx.reply('⚠️ Gagal menolak draft.');
    }
  };
}
