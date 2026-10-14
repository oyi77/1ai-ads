/**
 * Bot Scheduler job — draft-expiry.
 *
 * Pending approval drafts encode a decision made against campaign state at
 * creation time. Left forever, they become a hazard: approving a weeks-old
 * "pause" draft executes that intent against TODAY'S campaign state, which
 * can pause a campaign that has since recovered. Expiry keeps the approval
 * queue short and every decision fresh.
 *
 * Age caps live in draft-service.js (DRAFT_MAX_AGE_DAYS = 14 for replayable
 * rule drafts, 7 for non-replayable AI suggestions). This job uses the looser
 * (replayable) cap as the hard cleanup bound, so nothing survives beyond it.
 */
import { scheduleJob, log } from '../helpers.js';
import { DRAFT_MAX_AGE_DAYS } from '../../../services/draft-service.js';

export function setupDraftExpiry(_bot, deps) {
  scheduleJob('41 * * * *', 'draft-expiry', async () => {
    try {
      const draftsRepo = deps.repos?.draftsRepo;
      if (typeof draftsRepo?.expireStalePending !== 'function') return;
      const { expired } = draftsRepo.expireStalePending(DRAFT_MAX_AGE_DAYS);
      if (expired > 0) {
        log.info('Draft expiry complete', { expired, maxAgeDays: DRAFT_MAX_AGE_DAYS });
      }
    } catch (err) {
      log.error('Draft expiry failed', { error: err.message });
    }
  });
}
