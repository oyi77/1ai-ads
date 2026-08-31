/**
 * /start command — Welcome + main hub.
 * Uses the SAME keyboard as /menu (single source of truth in menu.js) so a
 * first-time user immediately sees every feature the bot offers.
 */

import { createLogger } from '../../lib/logger.js';
function escMd(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[_*[\]()~`>#+\-|=.!{}]/g, '\\$&');
}
import { mainMenuKeyboard } from './menu.js';

const log = createLogger('bot:start');

export function handleStart() {
  return async (ctx) => {
    const name = ctx.from?.first_name || 'there';
    const userId = ctx.from?.id;

    log.info('User started bot', { userId, name });

    // Smart onboarding: check user state to personalize message
    // Use ctx.deps (set by bot middleware) — ctx.repos is never populated.
    const deps = ctx.deps || {};
    const hasMetaAccount = deps.repos?.platformAccountsRepo?.findByUserId?.(ctx.userId)?.some(a => a.platform === 'meta' && a.is_active);
    const campaignCount = deps.repos?.campaignsRepo?.findAll?.({ userId: ctx.userId })?.data?.length || 0;
    const ruleCount = deps.repos?.rulesRepo?.countEnabled?.(ctx.userId) || 0;

    let message;
    // For new users, add a prominent Connect Account button on top of the menu.
    const keyboard = mainMenuKeyboard();
    if (!hasMetaAccount && campaignCount === 0) {
      message = `👋 *Welcome to AdForge, ${escMd(name)}!*\n\n` +
        '🚀 *Getting started in 3 steps:*\n' +
        '1️⃣ Connect your Meta account\n' +
        '2️⃣ Sync or create campaigns\n' +
        '3️⃣ Set up automation rules\n\n' +
        'Tap *🔗 Connect Account* below to begin!';
      keyboard.inline_keyboard.unshift([
        { text: '🔗 Connect Account', callback_data: 'menu:connect' },
        { text: '🌐 Platforms', callback_data: 'menu:platforms' },
      ]);
    } else if (hasMetaAccount && campaignCount === 0) {
      message = `👋 *Welcome back, ${escMd(name)}!*\n\n` +
        '✅ Meta account connected\n' +
        '📭 No campaigns yet\n\n' +
        'Tap *🎯 Buat Kampanye* to create your first campaign, or *📣 My Meta Ads* to sync from Meta.';
      keyboard.inline_keyboard.unshift([
        { text: '🎯 Create Campaign', callback_data: 'menu:create' },
        { text: '📣 Ads Manager', callback_data: 'menu:ads' },
      ]);
    } else {
      message = `👋 *Welcome back, ${escMd(name)}!*\n\n` +
        `📊 ${campaignCount} campaign${campaignCount !== 1 ? 's' : ''} tracked\n` +
        `⚡ ${ruleCount} automation rule${ruleCount !== 1 ? 's' : ''} active\n\n` +
        'What would you like to do?';
    }

    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    });
  };
}
