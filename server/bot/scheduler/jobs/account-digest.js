/**
 * Bot Scheduler job — account-digest.
 *
 * Extracted verbatim from ../scheduler.js. Registered via setupAccountDigest(bot, deps).
 */
import cron from 'node-cron';
import { isAccountTokenUsable } from '../../../lib/token-health.js';
import { esc, fmtRp, fmtRoas2, log } from '../helpers.js';

/**
 * Register the account-digest cron job.
 * @param { telegram: object } bot — Telegram bot instance
 * @param { repos: object, services: object } deps
 */
export function setupAccountDigest(bot, deps) {
  // ────────────────────────────────────────────────────────────
  // 5b. Daily Per-Account AI Report Digest — 08:00 WIB (01:00 UTC)
  //     For each user with a connected Meta account, send a compact
  //     per-account performance report + AI recommendations. Includes a
  //     "since last digest" window and skips accounts with zero activity
  //     since the previous digest (no spam for dormant accounts).
  // ────────────────────────────────────────────────────────────
  cron.schedule('0 1 * * *', async () => {
    log.info('Running daily account report digest');
    try {
      const repo = deps.repos?.platformAccountsRepo;
      const settingsRepo = deps.repos?.settingsRepo;
      const usersRepo = deps.repos?.usersRepo;
      if (!repo || !usersRepo) return;

      const { listPlatformKeys, getPlatform } = await import('../../../platforms/index.js');
      const { resolveOwnerPlatformToken } = await import('../../../lib/resolve-owner-platform.js');
      const { AccountReportService } = await import('../../../services/account-report-service.js');
      const svc = new AccountReportService({ llmClient: deps.services?.llmClient });

      const platformKeys = listPlatformKeys();
      let sent = 0;

      for (const platform of platformKeys) {
        const accounts = repo.getDistinctUserPlatforms
          ? repo.getDistinctUserPlatforms(platform)
          : [];
        if (!accounts.length) continue;

        for (const row of accounts) {
          try {
            const userAccounts = repo.findAllActiveByUserAndPlatform(row.user_id, platform);
            if (!userAccounts.length) continue;
            const user = usersRepo.findById(row.user_id);
            if (!user?.telegram_id) continue;

            for (const pa of userAccounts) {
              if (!pa?.access_token || !isAccountTokenUsable(pa)) continue;

              const token = resolveOwnerPlatformToken(platform, row.user_id, {
                platformAccountsRepo: repo,
                settingsRepo,
              });
              if (!token || token.startsWith('demo-') || token.startsWith('demo-meta-token')) continue;

              const api = await getPlatform(platform, settingsRepo);
              api.setActiveAccount(null, token, true);

              // Feature-detect account enumeration. Meta has getAdAccounts,
              // others may have getAccounts or neither.
              const getAccounts = api.getAdAccounts || api.getAccounts;
              if (typeof getAccounts !== 'function') {
                log.debug('Platform lacks account enumeration', { platform, user: row.user_id });
                continue;
              }

              const lastAt = settingsRepo?.get(`last_report_at_${row.user_id}_${platform}`);
              const sinceDate = lastAt ? new Date(lastAt).toISOString().slice(0, 10) : null;

              const owned = await getAccounts.call(api);
              for (const acc of owned.slice(0, 5)) {
                const report = await svc.buildReport(api, acc.id, acc.name, { sinceDate, platform });
                // Skip unsupported platforms (no getAccountInsights) and dormant accounts
                if (!report.supported) continue;
                const s = report.summary;
                const sl = report.sinceLastReport;
                if (sinceDate && s.spend === 0 && (!sl || sl.spend === 0)) continue;

                const lines = [
                  `📊 <b>Digest Harian — ${esc(acc.name)} (${platform})</b>`,
                  `💰 Belanja: ${fmtRp(s.spend)} · ROAS ${fmtRoas2(s.roas)} · Purchase ${s.purchases}`,
                ];
                if (sl && sinceDate) {
                  lines.push(`↩️ Sejak digest lalu (${sinceDate}): ${fmtRp(sl.spend)} · ROAS ${fmtRoas2(sl.roas)} · Purchase ${sl.purchases}`);
                }
                if (report.ai?.actions) lines.push(`🔧 ${esc(report.ai.actions)}`);
                if (report.anomalies?.length) lines.push(...report.anomalies.map(a => `🚨 ${esc(a)}`));
                await bot.telegram.sendMessage(user.telegram_id, lines.join('\n'), { parse_mode: 'HTML' });
                sent++;
              }
            }
            settingsRepo?.set(`last_report_at_${row.user_id}_${platform}`, new Date().toISOString());
          } catch (err) {
            log.warn('Digest failed for user', { platform, userId: row.user_id, error: err.message });
          }
        }
      }
      log.info('Daily account report digest complete', { messagesSent: sent });
    } catch (err) {
      log.error('Daily account report digest failed', { error: err.message });
    }
  });
}
