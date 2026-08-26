/**
 * /pricing command — plan overview (extracted so both the command handler
 * and the inline menu can render the same content without circular imports).
 */

export function handlePricing() {
  return async (ctx) => {
    const plan = ctx.user?.plan || 'free';
    const planLabel = plan.charAt(0).toUpperCase() + plan.slice(1);
    // NOTE: underscore in the support handle must be escaped under Markdown,
    // or Telegram rejects the entity parse (400) — and a sync handler without
    // a `return` turns that rejection into an unhandledRejection crash.
    await ctx.reply(
      `💰 *AdForge Pricing*\n\n` +
      `Your plan: *${planLabel}*\n\n` +
      '🆓 *Free* — 3 campaigns, basic analytics\n' +
      '💎 *Pro* — Unlimited campaigns, AI optimization, priority support\n' +
      '🏢 *Enterprise* — Custom limits, dedicated support, white-label\n\n' +
      'Use /menu → Connect Account to add integrations. Contact @adforge\\_support for upgrades.',
      { parse_mode: 'Markdown' }
    );
  };
}
