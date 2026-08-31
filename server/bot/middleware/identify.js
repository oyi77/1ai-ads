import { createLogger } from '../../lib/logger.js';

const log = createLogger('bot:identify');

// Resolves the incoming Telegram user to a multi-tenant user record.
// Auto-creates a telegram-managed customer record on first contact so every
// downstream command can scope its data via ctx.userId without a manual link step.
export function identify(deps) {
  return async (ctx, next) => {
    const from = ctx?.from;
    const tgId = from?.id;

    if (!tgId) {
      // Updates without a sender (e.g. chat_member) cannot be bound.
      ctx.user = null;
      ctx.userId = null;
      return next();
    }

    try {
      const usersRepo = deps?.repos?.usersRepo;
      if (!usersRepo) {
        ctx.user = null;
        ctx.userId = null;
        return next();
      }

      let user = usersRepo.findByTelegramId(String(tgId));
      if (!user) {
        const username = `tg_${tgId}`;
        const email = `tg_${tgId}@telegram.local`;
        const id = usersRepo.create({
          username,
          email,
          password_hash: 'telegram-managed',
          confirmed: 1,
          telegram_id: String(tgId),
        });
        user = usersRepo.findById(id);
        log.info({ telegramId: tgId, username }, 'auto-created telegram customer');
      }

      ctx.user = user;
      ctx.userId = user.id;
    } catch (err) {
      log.error({ err: err?.message, telegramId: tgId }, 'identify failed, continuing unbound');
      ctx.user = null;
      ctx.userId = null;
    }

    return next();
  };
}
