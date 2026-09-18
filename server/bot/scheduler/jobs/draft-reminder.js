/**
 * Bot Scheduler job — draft-reminder.
 *
 * Draft pending yang >60 menit belum di-approve/ditolak kemungkinan user
 * tidak sadar ada tombol ✅/❌ menunggu. Ingatkan max 1x/jam per draft
 * (kolom reminded_at, migrasi 050). Tanpa ini 290 draft menumpuk diam.
 */
import { scheduleJob, log, esc } from '../helpers.js';

function shortSummary(s, max = 60) {
  const t = String(s || 'Draft');
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export function pendingReminderText(count, samples) {
  const lines = samples.map((d, i) => `${i + 1}. ${esc(shortSummary(d.summary))}`);
  return `⏳ <b>${count} draft menunggu persetujuanmu</b>\n\n${lines.join('\n')}`
    + (count > samples.length ? `\n…dan ${count - samples.length} lainnya.` : '')
    + `\n\n<i>Pencet ✅ buat jalanin ke Facebook, ❌ buat batalin. Cek di bawah ya.</i>`;
}

export function setupDraftReminder(bot, deps) {
  // Tiap jam (menit 17, biar tidak tabrakan dengan rule-guard menit 0/5).
  scheduleJob('17 * * * *', 'draft-reminder', async () => {
    try {
      const draftsRepo = deps.repos?.draftsRepo;
      const usersRepo = deps.repos?.usersRepo;
      if (!draftsRepo?.findStalePending || !usersRepo) return;
      const stale = draftsRepo.findStalePending({ olderThanMinutes: 60, limit: 200 }) || [];
      if (!stale.length) return;
      // Kelompokkan per user biar 1 user = 1 pesan (bukan 1 pesan per draft).
      const byUser = new Map();
      for (const d of stale) {
        if (!d.user_id) continue;
        if (!byUser.has(d.user_id)) byUser.set(d.user_id, []);
        byUser.get(d.user_id).push(d);
      }
      let sent = 0;
      for (const [userId, rows] of byUser) {
        const telegramId = usersRepo.getTelegramIdByUserId?.(userId)
          || usersRepo.findById?.(userId)?.telegram_id;
        if (!telegramId) continue;
        try {
          await bot.telegram.sendMessage(
            telegramId,
            pendingReminderText(rows.length, rows.slice(0, 5)),
            {
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: [[{ text: '📋 Lihat Aturanku', callback_data: 'rule:view:all' }]],
              },
            }
          );
          for (const d of rows) {
            try { draftsRepo.markReminded?.(d.id); } catch { /* best-effort */ }
          }
          sent++;
        } catch (err) {
          log.warn('Draft reminder send failed', { userId, error: err.message });
        }
      }
      log.info('Draft reminder complete', { stale: stale.length, usersNotified: sent });
    } catch (err) {
      log.error('Draft reminder failed', { error: err.message });
    }
  });
}
