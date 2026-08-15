/**
 * /fbads command — List Meta (Facebook/Instagram) ad accounts
 * accessible to the configured system user (FB_SYSTEM_TOKEN).
 * Reuses server/services/facebook-system-user.js (already wired in
 * server/app/services.js as `facebookSystemUserService`).
 */
import { createLogger } from '../../lib/logger.js';

const log = createLogger('bot-fbads');

export function handleFbAds(deps) {
  return async (ctx) => {
    const svc = deps?.services?.facebookSystemUserService;
    if (!svc) {
      return ctx.reply('⚠️ Meta (Facebook) System User service is not configured.');
    }

    await ctx.reply('🔄 Fetching your Meta ad accounts…');
    try {
      const data = await svc.getAdAccounts();
      const accounts = (data.data || []).map(
        (a) => `• ${a.name || 'Untitled'} (act_${a.account_id}) — ${a.currency || '?'}`
      );
      if (!accounts.length) {
        return ctx.reply(
          'No ad accounts found for the configured System User.\n' +
          'Connect one via /settings, or check FB_SYSTEM_TOKEN.'
        );
      }
      return ctx.reply(
        `📣 *Meta Ad Accounts*\n\n${accounts.join('\n')}\n\n` +
        'Use the dashboard (/app) to create campaigns.',
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      log.error('fbads list failed', { error: err.message });
      return ctx.reply('⚠️ Failed to load Meta ad accounts. Check FB_SYSTEM_TOKEN / network.');
    }
  };
}
