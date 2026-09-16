/**
 * Bot Scheduler job — rule-guard.
 *
 * Extracted verbatim from ../scheduler.js. Registered via setupRuleGuard(bot, deps).
 */
import { safeSend, evaluateRuleForCampaign, scheduleJob, log, esc } from '../helpers.js';
import { describeRuleCondition as describeID, actionWord as actionWordID } from '../../../lib/rule-words.js';

/**
 * Register the rule-guard cron job.
 * @param { telegram: object } bot — Telegram bot instance
 * @param { repos: object, services: object } deps
 */
export function setupRuleGuard(bot, deps) {
  // ────────────────────────────────────────────────────────────
  // 5. Rule Guard — every 5 minutes
  //    Evaluate automation rules against campaigns. On match, record an
  //    owner-scoped approval draft and prompt the owner with an
  //    Approve/Reject inline keyboard.
  //    Dedup: skip if pending draft already exists for this rule+campaign.
  // ────────────────────────────────────────────────────────────
  scheduleJob('*/5 * * * *', 'rule-guard', async () => {
    try {
      const rules = deps.repos?.rulesRepo?.findAll?.() || [];
      const activeRules = rules.filter(r => r.enabled);
      if (activeRules.length === 0) return;

      const { data: allCampaigns = [] } = deps.repos?.campaignsRepo?.findAll?.() || { data: [] };
      const campaignsByUser = {};
      for (const c of allCampaigns) {
        const uid = c.user_id || 'system';
        if (!campaignsByUser[uid]) campaignsByUser[uid] = [];
        campaignsByUser[uid].push(c);
      }

      for (const rule of activeRules) {
        const action = rule.action || {};
        // `findAll()` hydrates camelCase (`userId`). Reading `rule.user_id` always
        // yielded undefined, so the owner fell back to 'system' and every user's
        // rule was evaluated against system-owned campaigns. That cross-tenant
        // leak produced ~93 spurious matches on every 5-minute run.
        const ownerId = rule.userId || rule.user_id || 'system';
        const campaigns = campaignsByUser[ownerId] || [];
        if (campaigns.length === 0) continue;

        for (const campaign of campaigns) {
          if (!evaluateRuleForCampaign(rule, campaign)) continue;

          // Dedup: skip if a pending draft already exists for this rule+campaign.
          // Only effective while campaigns.id is stable - see CampaignsRepository.upsert.
          const existingDraft = deps.repos?.draftsRepo?.findPendingForRuleCampaign?.(rule.name, campaign.id, rule.id);
          if (existingDraft) continue;

          const condText = describeID(rule.condition);
          const actText = actionWordID(action.type);
          const draft = await deps.services?.draftService?.guardAutonomousChange?.({
            type: `rule_${action.type}`,
            summary: `Aturan "${rule.name}": ${condText} → ${actText} di ${campaign.name}`,
            details: { action: rule.action, campaign },
            proposedBy: 'ai',
            campaignId: campaign.id,
            userId: ownerId,
            ruleId: rule.id,
          });
          if (!draft) continue;

          const telegramId = deps.repos?.usersRepo?.getTelegramIdByUserId?.(ownerId)
            || deps.repos?.usersRepo?.findById?.(ownerId)?.telegram_id;
          if (!telegramId) {
            await safeSend(bot, `⚠️ <b>${esc(campaign.name)}</b> kena aturan <b>${esc(rule.name)}</b> — nunggu persetujuan di /menu → Mini App`, { parse_mode: 'HTML' });
            continue;
          }
          const text = `⚠️ <b>${esc(campaign.name)}</b> kena aturan "${esc(rule.name)}"\n${esc(condText)} → <b>${esc(actText)}</b>\n\n<i>Aturan bot (bukan aturan Facebook). Pencet ✅ buat jalanin, ❌ buat batalin:</i>`;
          try {
            await bot.telegram.sendMessage(telegramId, text, {
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: [[
                  { text: '✅ Approve', callback_data: `approval:approve:${draft.id}` },
                  { text: '❌ Reject', callback_data: `approval:reject:${draft.id}` },
                ]],
              },
            });
          } catch (err) {
            log.error('Failed to send approval prompt to owner', { telegramId, error: err.message });
            await safeSend(bot, `⚠️ <b>${esc(campaign.name)}</b> matched rule <b>${esc(rule.name)}</b> — draft awaiting approval in /menu → Mini App`, { parse_mode: 'HTML' });
          }
        }
      }
    } catch (err) {
      log.error('Spend guard failed', { error: err.message });
    }
  });
}
