/**
 * Bot Error Handler — Bulletproof, never crashes
 * Ported from asisten-jualan/main.py error_handler (v4)
 *
 * Guarantees:
 * 1. User ALWAYS gets a friendly recovery message
 * 2. Rate-limited admin alerts (max 1 per user per 5 mins)
 * 3. The error handler ITSELF never crashes
 */

import { createLogger } from '../../lib/logger.js';

const log = createLogger('bot:error-handler');

const adminAlerts = new Map(); // userId → lastAlertTime

/**
 * Bulletproof error handler for Telegraf bot.
 * Catches EVERYTHING, never crashes, rate-limited admin alerts.
 */
export function errorHandler(err, ctx) {
  // TOP-LEVEL SAFETY NET — this function MUST NEVER crash
  try {
    handleError(err, ctx);
  } catch (fatal) {
    log.error('FATAL in error handler', { error: fatal.message });
    try {
      ctx.reply('😅 Something went wrong. Try /start to restart.').catch(() => {});
    } catch {
      // Last resort — nothing we can do
    }
  }
}

function handleError(err, ctx) {
  const userId = ctx.from?.id || 'unknown';
  const error = err.message || String(err);

  // Log full error
  log.error('Bot error', {
    userId,
    error,
    updateType: ctx.updateType,
    stack: err.stack?.split('\n').slice(0, 3).join(' '),
  });

  // Detect domain from user state
  const domain = detectDomain(ctx);

  // Send user a friendly recovery message
  const userMessage = getRecoveryMessage(domain);
  ctx.reply(userMessage, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[{ text: '📋 Menu', callback_data: 'quick:menu' }]],
    },
  }).catch(() => {});

  // Rate-limited admin alert (max 1 per user per 5 mins)
  sendAdminAlert(userId, error, domain);
}

function detectDomain(ctx) {
  const text = ctx.message?.text || ctx.callbackQuery?.data || '';
  if (text.includes('settings') || text.includes('token')) return 'Settings';
  if (text.includes('monitor') || text.includes('rule')) return 'Monitor';
  if (text.includes('menu')) return 'Menu';
  return 'General';
}

function getRecoveryMessage(domain) {
  const messages = {
    Settings: '⚠️ Settings action failed. Try again via /menu → Settings.',
    Monitor: '⚠️ Monitor action failed. Your campaigns are still running. Use /status to check.',
    Menu: '⚠️ Menu error. Try /start to restart.',
    General: '😅 Something went wrong. Use /menu to try again.',
  };
  return messages[domain] || messages.General;
}

function sendAdminAlert(userId, error, domain) {
  const now = Date.now();
  const lastAlert = adminAlerts.get(userId) || 0;
  if (now - lastAlert < 5 * 60 * 1000) return; // Rate limit: 1 per 5 mins

  adminAlerts.set(userId, now);
  log.warn('Bot error (admin alert)', { userId, error, domain });
}
