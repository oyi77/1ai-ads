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
import { describeRuleCondition as describeRuleConditionID } from '../../lib/rule-words.js';

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
  // Kalimat Bahasa Indonesia via rule-words (satu sumber dengan layar bot).
  return describeRuleConditionID(condition);
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
 * Send an alert about a customer's campaign to that OWNER's Telegram.
 *
 * NEVER falls back to the admin chat. campaigns/rules are per-user, so a
 * fallback told one customer's story to whoever sits in the operations chat
 * (bos: "semua rule dan account masuk ke bot admin"). When the owner has no
 * linked Telegram the alert stays in-app (Mini App /drafts) and this returns
 * false — callers must not route it anywhere else.
 *
 * @returns {Promise<boolean>} true when the owner received the message
 */
async function ownerSend(bot, deps, ownerId, text, extra) {
  const usersRepo = deps.repos?.usersRepo;
  const telegramId = ownerId
    ? (usersRepo?.getTelegramIdByUserId?.(ownerId) || usersRepo?.findById?.(ownerId)?.telegram_id)
    : null;
  if (!telegramId || !bot?.telegram) {
    log.info('Owner unreachable — alert kept in-app, not forwarded to admin chat', { ownerId });
    return false;
  }
  try {
    await bot.telegram.sendMessage(telegramId, text, extra);
    return true;
  } catch (err) {
    log.warn('Owner alert failed — kept in-app', { ownerId, error: err.message });
    return false;
  }
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
 * True kalau rule jatuh tempo dievaluasi sekarang. Cron tick tiap 5 menit;
 * rule 1 jam dilewati sampai lastEvaluatedAt cukup tua. interval 0/null =
 * ikut pacing (tiap tick). Murni — bisa dites tanpa cron/DB.
 */
export function isRuleDue(rule, nowMs = Date.now()) {
  const intervalMin = Number(rule?.intervalMinutes ?? rule?.interval_minutes ?? 5);
  if (!(intervalMin > 0)) return true;
  const lastEval = rule?.lastEvaluatedAt || rule?.last_evaluated_at;
  if (!lastEval) return true;
  return nowMs - new Date(lastEval).getTime() >= intervalMin * 60000;
}

/**
 * Scope campaign ke akun rule. Banding toleran prefix act_. Baris legacy
 * ber-account_id NULL ikut semua (lebih baik false-positive minta setuju
 * daripada rule diam total). Murni — bisa dites tanpa cron/DB.
 */
/**
 * Adopsi campaign 'system' untuk owner yang bucket-nya kosong. Campaign lama
 * tersync dengan user_id='system'; tanpa ini rule user tersebut TIDAK PERNAH
 * dievaluasi. Cocokkan via account_id milik owner. Hasil di-relabel user_id
 * owner biar draft/notif jatuh ke orang yang benar. Murni — testable.
 */
export function adoptSystemCampaigns(systemCampaigns, ownerAccountIds, ownerId, rule) {
  const owned = new Set((ownerAccountIds || []).map(String).filter(Boolean));
  if (!owned.size) return [];
  const scoped = filterCampaignsForRule(systemCampaigns || [], rule)
    .filter(c => {
      const ca = String(c.account_id || '');
      if (!ca) return false;
      const bare = ca.replace(/^act_/, '');
      return [...owned].some(o => {
        const ob = String(o).replace(/^act_/, '');
        return ca === String(o) || bare === ob || ca === `act_${ob}`;
      });
    })
    .map(c => ({ ...c, user_id: ownerId }));
  return scoped;
}

export function filterCampaignsForRule(campaigns, rule) {
  const ruleAcct = String(rule?.accountId ?? rule?.account_id ?? '');
  if (!ruleAcct) return campaigns || [];
  const bare = ruleAcct.replace(/^act_/, '');
  const scoped = (campaigns || []).filter(c => {
    const ca = String(c.account_id ?? '');
    if (!ca) return true;
    return ca === ruleAcct || ca === bare || ca === `act_${bare}`;
  });
  return scoped;
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
