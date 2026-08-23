/**
 * /start command — Comprehensive onboarding flow
 * Guides new users through platform connection and setup
 */

import { createLogger } from '../../lib/logger.js';

const log = createLogger('bot:start');

export function handleStart() {
  return async (ctx) => {
    const name = ctx.from?.first_name || 'there';
    const userId = ctx.from?.id;

    log.info('User started bot', { userId, name });

    // MENU UTAMA — first node of the target product flowchart.
    // Quick Setup (connect picker) is offered as an action, not a gate.
    await ctx.reply(
      `👋 *Welcome to AdForge, ${name}!*\n\n` +
      '🤖 *AI-powered ad management.* Choose an option:',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📊 Dashboard', callback_data: 'menu:status' }, { text: '🎯 Buat Kampanye', callback_data: 'menu:create' }],
            [{ text: '📈 Monitor', callback_data: 'menu:monitor' }, { text: '🤖 AI Optimize', callback_data: 'menu:optimize' }],
            [{ text: '🔧 Setting', callback_data: 'menu:settings' }, { text: '📣 My Meta Ads', callback_data: 'menu:ads' }],
            [{ text: '🔗 Connect Account', callback_data: 'menu:connect' }],
          ],
        },
      }
    );
  };
}
