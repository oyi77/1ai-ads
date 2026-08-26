/**
 * /start command — Welcome + main hub.
 * Uses the SAME keyboard as /menu (single source of truth in menu.js) so a
 * first-time user immediately sees every feature the bot offers.
 */

import { createLogger } from '../../lib/logger.js';
import { mainMenuKeyboard } from './menu.js';

const log = createLogger('bot:start');

export function handleStart() {
  return async (ctx) => {
    const name = ctx.from?.first_name || 'there';
    const userId = ctx.from?.id;

    log.info('User started bot', { userId, name });

    await ctx.reply(
      `👋 *Welcome to AdForge, ${name}!*\n\n` +
      '🤖 AI-powered ad management. Pilih fitur di bawah — ' +
      'ketik */menu* kapan saja untuk kembali ke sini.',
      {
        parse_mode: 'Markdown',
        reply_markup: mainMenuKeyboard(),
      }
    );
  };
}
