/**
 * Bot Scheduler job — hourly-anomaly.
 *
 * Extracted verbatim from ../scheduler.js. Registered via setupHourlyAnomaly(bot, deps).
 */
import { isAccountTokenUsable } from '../../../lib/token-health.js';
import { esc, fmtRp, fmtRoas2, scheduleJob, log } from '../helpers.js';

/**
 * Register the hourly-anomaly cron job.
 * @param { telegram: object } bot — Telegram bot instance
 * @param { repos: object, services: object } deps
 */
export function setupHourlyAnomaly(bot, deps) {
  // ────────────────────────────────────────────────────────────
  // 5c. Hourly Anomaly Push — top of every hour
  //     Per active account on ANY platform: build compact report,
  //     detect anomalies, push to the owner's Telegram.
  //     Dedup: max 1 alert per account/day.
  // ────────────────────────────────────────────────────────────
  scheduleJob('0 * * * *', 'hourly-anomaly', async () => {
    try {
      const repo = deps.repos?.platformAccountsRepo;
      const settingsRepo = deps.repos?.settingsRepo;
      const usersRepo = deps.repos?.usersRepo;
      if (!repo || !settingsRepo || !usersRepo) return;

      const { listPlatformKeys, getPlatform } = await import('../../../platforms/index.js');
      const { resolveOwnerPlatformToken } = await import('../../../lib/resolve-owner-platform.js');
      const { AccountReportService } = await import('../../../services/account-report-service.js');
      const svc = new AccountReportService({ llmClient: deps.services?.llmClient });
      const today = new Date().toISOString().slice(0, 10);
      let pushed = 0;

      const platformKeys = listPlatformKeys();

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

              // dedup per account per day (account id = pa.id)
              const dedupKey = `anomaly_alerted_${pa.id}_${today}`;
              if (settingsRepo.get(dedupKey)) continue;

              const token = resolveOwnerPlatformToken(platform, row.user_id, {
                platformAccountsRepo: repo,
                settingsRepo,
              });
              if (!token || token.startsWith('demo-') || token.startsWith('demo-meta-token')) continue;

              const api = await getPlatform(platform, settingsRepo);
              api.setActiveAccount(null, token, true);

              // Feature-detect account enumeration
              const getAccounts = api.getAdAccounts || api.getAccounts;
              if (typeof getAccounts !== 'function') continue;

              const ownedAccounts = await getAccounts.call(api);
              if (!ownedAccounts.length) continue;
              const acc0 = ownedAccounts[0];
              const report = await svc.buildReport(api, acc0.id, acc0.name, { platform });
              // Unsupported platform → no anomalies, skip silently
              if (!report.supported || !report.anomalies?.length) continue;

              const lines = [
                `🚨 <b>Anomali Terdeteksi — ${esc(report.accountName)} (${platform})</b>`,
                `💰 Spend hari ini: ${fmtRp(report.summary.spend)} · ROAS ${fmtRoas2(report.summary.roas)}`,
                ...report.anomalies.map(a => `⚠️ ${esc(a)}`),
                '',
                `<i>Cek /reports di Mini App untuk detail.</i>`,
              ];
              await bot.telegram.sendMessage(user.telegram_id, lines.join('\n'), { parse_mode: 'HTML' });
              settingsRepo.set(dedupKey, new Date().toISOString());
              pushed++;
            }
          } catch (err) {
            log.warn('Anomaly push failed', { platform, userId: row.user_id, error: err.message });
          }
        }
      }
      if (pushed) log.info('Anomaly push complete', { alertsSent: pushed });
    } catch (err) {
      log.error('Hourly anomaly check failed', { error: err.message });
    }
  });
}
