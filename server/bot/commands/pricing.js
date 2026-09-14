/**
 * /pricing command — plan overview (extracted so both the command handler
 * and the inline menu can render the same content without circular imports).
 */

export function handlePricing() {
  return async (ctx) => {
    const plan = ctx.user?.plan || 'free';
    const planLabel = plan.charAt(0).toUpperCase() + plan.slice(1);
    // HTML: the support handle needs no escaping — the legacy Markdown
    // crash class this NOTE used to guard is gone by construction.
    await ctx.reply(
      `💰 <b>AdForge Pricing</b>\n\n` +
      `Your plan: <b>${planLabel}</b>\n\n` +
      '🆓 <b>Free</b> — 3 campaigns, basic analytics\n' +
      '💎 <b>Pro</b> — Unlimited campaigns, AI optimization, priority support\n' +
      '🏢 <b>Enterprise</b> — Custom limits, dedicated support, white-label\n\n' +
      'Use /menu → Platforms to add integrations. Contact @adforge_support for upgrades.',
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🌐 Platforms', callback_data: 'menu:platforms' }],
            [{ text: '📋 Menu', callback_data: 'quick:menu' }],
          ],
        },
      }
    );
  };
}
