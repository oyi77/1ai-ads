/**
 * Bot Scheduler job — token-health.
 *
 * Extracted verbatim from ../scheduler.js. Registered via setupTokenHealth(bot, deps).
 */
import cron from 'node-cron';
import { redactSecretsForLogs } from '../../../lib/platform-client.js';
import { esc, safeSend, log } from '../helpers.js';

/**
 * Register the token-health cron job.
 * @param { telegram: object } bot — Telegram bot instance
 * @param { repos: object, services: object } deps
 */
export function setupTokenHealth(bot, deps) {
  // ────────────────────────────────────────────────────────────
  // 4. Token Health Check — every 6 hours
  //    Verify Meta tokens via metaApi.getMe(). Alert on expiry.
  // ────────────────────────────────────────────────────────────
  cron.schedule('15 */6 * * *', async () => {
    log.info('Running token health check');
    try {
      const platformAccountsRepo = deps.repos?.platformAccountsRepo;
      const settingsRepo = deps.repos?.settingsRepo;
      const usersRepo = deps.repos?.usersRepo;
      if (!platformAccountsRepo || !settingsRepo) return;

      // Fan out per-user / per-platform using the OWNER's bound token
      // (SaaS isolation) — never read stored creds or a system metaApi.
      const { listPlatformKeys, getPlatform } = await import('../../../platforms/index.js');

      let checked = 0;
      let expired = 0;
      let notified = 0;
      const today = new Date().toISOString().slice(0, 10);

      for (const platform of listPlatformKeys()) {
        const accounts = platformAccountsRepo.getDistinctUserPlatforms
          ? platformAccountsRepo.getDistinctUserPlatforms(platform)
          : [];
        if (!accounts.length) continue;

        for (const row of accounts) {
          // That projection carries only user_id/platform — no id, no
          // account_name — so read the real rows. Without this the status
          // update targeted `id = undefined` and silently no-op'd, leaving
          // dead accounts flagged 'ok'.
          const owned = platformAccountsRepo.findAllActiveByUserAndPlatform
            ? platformAccountsRepo.findAllActiveByUserAndPlatform(row.user_id, platform)
            : [];

          for (const account of owned) {
            try {
              const token = account.access_token;
              if (!token || token.startsWith('demo-')) {
                log.debug('Placeholder token — skipping health check', { platform, accountId: account.id });
                continue;
              }
              // getPlatform (async) loads the platform map itself. The sync
              // variant throws until some unrelated request has warmed that
              // map, which made this cron fail on every account.
              const api = await getPlatform(platform, settingsRepo);
              api.setActiveAccount(null, token, true);

              // Feature-detect a token-verify method. Only Meta exposes getMe().
              // Platforms without one are skipped — never fabricate validity.
              const verify = api.getMe || api.verifyToken;
              if (typeof verify !== 'function') {
                log.debug('No token-verify method for platform — skipping', { platform });
                continue;
              }
              checked++;
              await verify.call(api);
              // Prove ADS access, not just token validity: a page-scoped token
              // passes getMe but 400s every ad call (proven live 2026-09-15:
              // page token flagged 'ok' while syncs failed). An empty list is
              // fine (valid token, no accounts yet) — only a thrown OAuth /
              // permission error demotes the account, via the catch below.
              if (platform === 'meta' && typeof api.getAdAccounts === 'function') {
                try {
                  await api.getAdAccounts();
                } catch (adsErr) {
                  // Token is valid (getMe passed) but cannot reach the ads
                  // API — typically a page-scoped token. Surface THAT, not a
                  // generic 400, so the reconnect prompt makes sense.
                  throw new Error(`token valid but no ad-account access: ${String(adsErr?.message || adsErr).slice(0, 120)}`);
                }
              }
              // Success — clear any stale flag so one transient blip doesn't
              // permanently mark the account dead, and re-arm the alert.
              if (account.health_status !== 'ok' || account.last_error) {
                try {
                  platformAccountsRepo.update(account.id, { health_status: 'ok', last_error: null });
                } catch { /* best-effort DB update */ }
              }
              const rearmKey = `token_expiry_alerted_${account.id}_${today}`;
              if (settingsRepo.get(rearmKey)) settingsRepo.delete(rearmKey);
            } catch (err) {
              const message = String(err?.message || err);
              const transient = /timeout|timedout|ETIMEDOUT|ECONNRESET|EAI_AGAIN|socket|429|too many|5\d\d|temporarily|unavailable/i.test(message);
              if (transient) {
                // Network/provider hiccup — NOT token expiry. Log, don't flag.
                log.warn('Token health check transient failure', { platform, accountId: account.id, error: redactSecretsForLogs(message) });
                continue;
              }
              // An internal fault tells us nothing about the token. Flagging it
              // here would mark every account expired and notify every owner.
              if (/platform map not loaded|unknown platform|not implemented|is not a function|validatePlatform/i.test(message)) {
                log.error('Token health check skipped — internal error', { platform, accountId: account.id, error: message });
                continue;
              }
              expired++;
              // Account labels are user-supplied and can themselves BE a pasted
              // token, so neither the log nor the message may use them raw.
              const rawLabel = String(account.account_name || '');
              const safeLabel = redactSecretsForLogs(rawLabel || account.id);
              log.warn('Token expired', { platform, accountId: account.id, account: safeLabel, error: redactSecretsForLogs(message) });

              // Notify the OWNER, max once per account per day. A dead token
              // only blocks its owner's campaigns — routing this to the admin
              // chat left the customer with a silent failure.
              const dedupKey = `token_expiry_alerted_${account.id}_${today}`;
              if (!settingsRepo.get(dedupKey)) {
                const telegramId = usersRepo?.getTelegramIdByUserId?.(row.user_id)
                  || usersRepo?.findById?.(row.user_id)?.telegram_id;
                if (telegramId) {
                  try {
                    await bot.telegram.sendMessage(
                      telegramId,
                      [
                        `🔴 <b>Token ${platform} kamu sudah tidak valid</b>`,
                        `Akun: ${esc(safeLabel)}`,
                        '',
                        'Campaign tidak bisa dijalankan atau diubah sampai token diperbarui.',
                        '👉 Hubungkan ulang via /status → ➕ Tambah Akun (token lama otomatis diganti).',
                      ].join('\n'),
                      { parse_mode: 'HTML' }
                    );
                    settingsRepo.set(dedupKey, new Date().toISOString());
                    notified++;
                  } catch (sendErr) {
                    log.warn('Token expiry notice failed', { accountId: account.id, error: sendErr.message });
                  }
                } else {
                  // Owner never linked Telegram — surface it to the admin chat
                  // so the failure is not invisible.
                  await safeSend(bot, `🔴 <b>Token expired</b> [${platform}] ${String(account.id).slice(0, 8)} — owner has no Telegram link`, { parse_mode: 'HTML' });
                  settingsRepo.set(dedupKey, new Date().toISOString());
                }
              }
              try {
                platformAccountsRepo.update(account.id, {
                  health_status: 'expired',
                  last_error: redactSecretsForLogs(message).slice(0, 200),
                });
              } catch { /* best-effort DB update */ }
            }
          }
        }
      }
      log.info('Token health check complete', { checked, expired, notified });
    } catch (err) {
      log.error('Token health check failed', { error: err.message });
    }
  });
}
