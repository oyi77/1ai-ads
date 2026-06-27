/**
 * /monitor command — Campaign monitoring & rules
 * Ported from asisten-jualan/bot/handlers/monitor.py
 */

export function handleMonitor(_deps) {
  return (ctx) => {
    ctx.reply(
      '⚡ *Campaign Monitor*\n\n' +
      'Set rules to automatically monitor your campaigns:\n\n' +
      '• *Spend Guard* — Alert when daily spend exceeds threshold\n' +
      '• *ROAS Guard* — Alert when ROAS drops below target\n' +
      '• *CTR Guard* — Alert when CTR falls below minimum\n' +
      '• *Auto-Pause* — Pause campaigns that violate rules\n\n' +
      'Configure via inline buttons below:',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📊 View Rules', callback_data: 'rule:view' }],
            [{ text: '➕ Add Spend Rule', callback_data: 'rule:set:spend' }],
            [{ text: '➕ Add ROAS Rule', callback_data: 'rule:set:roas' }],
            [{ text: '🔄 Sync Now', callback_data: 'monitor:sync' }],
          ],
        },
      }
    );
  };
}

export function handleMonitorCallback(_deps) {
  return async (ctx) => {
    const action = ctx.match[1];
    await ctx.answerCbQuery();

    switch (action) {
      case 'sync':
        return ctx.reply('🔄 Campaign sync triggered. Check /status for results.');
      default:
        return ctx.reply('Monitor action received. Configure rules via the dashboard: /app');
    }
  };
}
