/**
 * Bot Scheduler — shared helpers.
 *
 * Extracted from ../scheduler.js: send/owner routing, formatting, rule-label,
 * and the noOverlap cron guard. No scheduling happens here.
 */
import cron from 'node-cron';
import { createLogger } from '../../lib/logger.js';
import config from '../../config/index.js';
import { evaluateCondition, MAX_CONDITION_DEPTH } from '../../lib/rule-condition.js';

const log = createLogger('bot:scheduler');

/** Resolve TELEGRAM_CHAT_ID once, warn when unset. */
function getChatId() {
  const id = config.telegramChatId;
  if (!id) log.warn('TELEGRAM_CHAT_ID not set — Telegram alerts disabled');
  return id;
}

/** Escape HTML special chars in dynamic bot content. */
function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function fmtRp(n) {
  return `Rp ${Number(n || 0).toLocaleString('id-ID')}`;
}
function fmtRoas2(v) {
  return v === null || v === undefined ? '—' : `${Number(v).toFixed(2)}x`;
}

/** Human label for a rule condition; covers every schema stored in the DB. */
function describeCondition(condition) {
  if (!condition || typeof condition !== 'object') return 'condition';
  if (condition.type === 'group') return condition.logic === 'or' ? 'any condition' : 'all conditions';
  if (Array.isArray(condition.all) || Array.isArray(condition.any)) return 'compound condition';
  const metric = condition.metric || condition.type || 'condition';
  const threshold = condition.value !== undefined ? condition.value : condition.threshold;
  return `${metric} ${condition.operator ?? ''} ${threshold ?? ''}`.trim();
}

/** Send a message to the admin chat; no-op when chatId missing. */
async function safeSend(bot, text, extra) {
  const chatId = getChatId();
  if (!chatId) return;
  try {
    await bot.telegram.sendMessage(chatId, text, extra);
  } catch (err) {
    log.error('Failed to send Telegram message', { error: err.message });
  }
}

/**
 * Send an alert about a customer's campaign to that OWNER's Telegram, falling
 * back to the admin chat only when the owner cannot be reached.
 *
 * `campaigns` is per-user, so routing a name-bearing alert straight to the
 * admin chat tells one customer's story to whoever sits in the operations
 * chat. The token-health, rule-guard, digest and anomaly jobs all resolve the
 * owner's Telegram first; the campaign monitor and the daily eval guard did
 * not, so every stop-loss/scale/underperformer alert went to the wrong place.
 *
 * @returns {Promise<boolean>} true when the owner received the message
 */
async function ownerSend(bot, deps, ownerId, text, extra, fallbackText = text) {
  const usersRepo = deps.repos?.usersRepo;
  const telegramId = ownerId
    ? (usersRepo?.getTelegramIdByUserId?.(ownerId) || usersRepo?.findById?.(ownerId)?.telegram_id)
    : null;
  if (telegramId) {
    try {
      await bot.telegram.sendMessage(telegramId, text, extra);
      return true;
    } catch (err) {
      log.warn('Owner alert failed', { ownerId, error: err.message });
    }
  }
  await safeSend(bot, fallbackText, extra);
  return false;
}

/**
 * Evaluate a rule against a raw campaigns-table row.
 *
 * Delegates to the shared evaluator so the rule-guard cron and RuleEvaluator
 * can never disagree about whether a rule matches. They previously handled
 * different condition shapes: this copy ignored the {all,any} compound schema
 * and the 'gt'/'lt' operator aliases that the rule UIs actually store.
 *
 * @param {{ condition: object }} rule - parsed rule from rulesRepo.findAll()
 * @param {object} campaign - raw campaigns row
 * @returns {boolean}
 */
export function evaluateRuleForCampaign(rule, campaign) {
  return evaluateCondition(rule?.condition, campaign, 0, MAX_CONDITION_DEPTH);
}

/**
 * Initialize all scheduled jobs.
 * @param {import('telegraf').Telegraf} bot — Telegram bot instance
 * @param {{ repos: object, services: object }} deps
 */
// Prevent overlapping runs: node-cron does NOT await async callbacks, so a slow
// job (Meta API, LLM, DB writes) can still be running when the next tick fires,
// double-processing rows. Wrap with a per-job in-flight lock; a second tick while
// one is running is logged and skipped.
const runningJobs = new Set();
function noOverlap(name, fn) {
  return async () => {
    if (runningJobs.has(name)) {
      log.warn('Scheduler job skipped — previous run still in flight', { job: name });
      return;
    }
    runningJobs.add(name);
    try {
      await fn();
    } finally {
      runningJobs.delete(name);
    }
  };
}
// Wrapper that delegates to cron.schedule with the noOverlap guard.
// The caller passes the same async arrow function; the closing \`});\` stays
// unchanged (arrow close + scheduleJob close = same as arrow + cron.schedule).
function scheduleJob(expr, name, fn) {
  cron.schedule(expr, noOverlap(name, fn));
}
export { log, getChatId, esc, fmtRp, fmtRoas2, describeCondition, safeSend, ownerSend, scheduleJob };
