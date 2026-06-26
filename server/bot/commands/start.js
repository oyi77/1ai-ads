/**
 * /start command — Onboarding flow
 * Ported from asisten-jualan/bot/handlers/start.py
 */

export function handleStart() {
  return (ctx) => {
    const name = ctx.from?.first_name || 'there';
    ctx.reply(
      `👋 *Welcome to AdForge, ${name}!*\n\n` +
      'I\'m your AI-powered ad management assistant.\n\n' +
      '*What I can do:*\n' +
      '📊 Monitor campaign performance\n' +
      '🎯 Create & optimize ads\n' +
      '📈 Track ROAS & spend\n' +
      '🤖 AI-powered recommendations\n' +
      '⚡ Auto-scaling winning campaigns\n\n' +
      'Tap *Menu* to get started!',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📋 Open Menu', callback_data: 'quick:menu' }],
            [{ text: '❓ Help', callback_data: 'menu:help' }],
          ],
        },
      }
    );
  };
}
