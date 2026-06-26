/**
 * /help command — Guide for all features
 * Ported from asisten-jualan/bot/handlers/panduan.py
 */

export function handleHelp() {
  return (ctx) => {
    ctx.reply(
      '❓ *AdForge Help Guide*\n\n' +
      '*Commands:*\n' +
      '/start — Welcome & onboarding\n' +
      '/menu — Main menu with all options\n' +
      '/status — Quick account status\n' +
      '/settings — Manage tokens & accounts\n' +
      '/pricing — View plans\n' +
      '/help — This message\n\n' +
      '*Features:*\n' +
      '📊 Campaign monitoring & analytics\n' +
      '🎯 AI-powered ad creation\n' +
      '⚡ Automation rules & spend guards\n' +
      '📈 ROAS tracking & optimization\n' +
      '🤖 Auto-scaling winning campaigns\n\n' +
      '*Dashboard:* Visit /app on the web for full control.',
      { parse_mode: 'Markdown' }
    );
  };
}
