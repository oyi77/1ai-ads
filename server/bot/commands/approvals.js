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
import { escapeHtml as esc } from '../../lib/escape.js';
import { actionWord } from '../../lib/rule-words.js';

const log = createLogger('bot:approvals');

/** Resolve the draft + verify owner before any mutation. */
async function resolveOwnedDraft(deps, ctx, draftId) {
  const draft = await deps.services.draftService.draftsRepo.findById(draftId);
  if (!draft) return { error: 'Maaf bos, drafnya nggak ketemu 🙏 Mungkin sudah saya proses atau keburu kadaluarsa bos.' };
  if (draft.user_id !== ctx.userId) {
    return { error: 'Maaf bos, ini draf bos lain 🙏 Saya nggak berani utak-atik punya orang bos.' };
  }
  return { draft };
}

function safeJson(s) {
  try {
    return typeof s === 'string' ? JSON.parse(s) : (s || {});
  } catch { return {}; }
}

/** Kalimat hasil: nama campaign + aksi + sukses/gagal eksekusi. */
function resultLine(draft) {
  const details = safeJson(draft.details_json);
  const campaign = details.campaign?.name || details.campaign?.id || '';
  const act = actionWord(details.action?.type);
  const summary = draft.summary || '';
  const base = campaign ? `"${campaign}" → ${act}` : summary;
  if (draft.execution_result) {
    return `${base}\nHasil eksekusi: ${draft.execution_result}`;
  }
  return base;
}

export function handleApprovalApprove(deps) {
  return async (ctx, draftId) => {
    try {
      const { draft, error } = await resolveOwnedDraft(deps, ctx, draftId);
      if (!draft) return ctx.reply(error);
      const done = await deps.services.draftService.approveDraft(draftId, ctx.userId);
      return ctx.reply(
        `✅ <b>Siap bos, sudah saya jalanin!</b> ${esc(resultLine(done || draft))}
Bos tinggal pantau hasilnya ya bos 🙏`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📋 Lihat Aturanku', callback_data: 'rule:view:all' }],
              [{ text: '📋 Menu', callback_data: 'quick:menu' }],
            ],
          },
        }
      );
    } catch (err) {
      if (err instanceof ValidationError) return ctx.reply(err.message);
      log.error('approval approve failed', { userId: ctx.userId, draftId, error: err?.message });
      return ctx.reply('⚠️ Maaf bos, saya gagal jalanin 🙏 Saya coba lagi ya bos, atau bos ACC ulang sekali lagi.');
    }
  };
}

export function handleApprovalReject(deps) {
  return async (ctx, draftId) => {
    try {
      const { draft, error } = await resolveOwnedDraft(deps, ctx, draftId);
      if (!draft) return ctx.reply(error);
      await deps.services.draftService.rejectDraft(draftId, ctx.userId);
      return ctx.reply(
        `❌ <b>Siap bos, saya batalin.</b> ${esc(resultLine(draft))}\n<i>Nggak ada yang berubah di akun iklan bos, aman bos.</i>`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📋 Lihat Aturanku', callback_data: 'rule:view:all' }],
              [{ text: '📋 Menu', callback_data: 'quick:menu' }],
            ],
          },
        }
      );
    } catch (err) {
      if (err instanceof ValidationError) return ctx.reply(err.message);
      log.error('approval reject failed', { userId: ctx.userId, draftId, error: err?.message });
      return ctx.reply('⚠️ Maaf bos, gagal saya batalin 🙏 Saya coba lagi ya bos.');
    }
  };
}
