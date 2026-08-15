/**
 * /menu command — Main menu with inline buttons
 * Ported from asisten-jualan/bot/handlers/quick_start.py
 */
import { PLATFORM_NAMES } from '../scenes/connect-account.js';

export function handleMenu() {
  return (ctx) => {
    ctx.reply(
      '📋 *AdForge Menu*\n\nChoose an option:',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📊 Campaign Status', callback_data: 'menu:status' }, { text: '📈 Reports', callback_data: 'menu:reports' }],
            [{ text: '🎯 Create Campaign', callback_data: 'menu:create' }, { text: '🤖 AI Optimize', callback_data: 'menu:optimize' }],
            [{ text: '⚡ Monitor Rules', callback_data: 'menu:monitor' }, { text: '🔧 Settings', callback_data: 'menu:settings' }],
            [{ text: '🔗 Connect Account', callback_data: 'menu:connect' }],
          ],
        },
      }
    );
  };
}

export function handleMenuButton(deps) {
  return async (ctx) => {
    const action = ctx.match[1];
    await ctx.answerCbQuery();

    switch (action) {
      case 'status':
        return handleStatusAction(ctx, deps);
      case 'reports':
        return handleReportsAction(ctx, deps);
      case 'create':
        return handleCreateAction(ctx);
      case 'connect':
        return sendPlatformChoice(ctx);
      case 'optimize':
        return handleOptimizeAction(ctx, deps);
      case 'monitor':
        return ctx.reply('⚡ Monitor rules: /settings to configure spend guards and alerts.');
      case 'settings':
        return ctx.reply('🔧 Settings: Use /settings command to manage your account.');
      case 'pricing':
        return ctx.reply('💰 See /pricing for plan details.');
      case 'help':
        return ctx.reply('❓ Use /help for guidance on all features.');
      default:
        return ctx.reply('Unknown option. Use /menu to see available options.');
    }
  };
}

async function sendPlatformChoice(ctx) {
  const entries = Object.entries(PLATFORM_NAMES);
  const inline_keyboard = [];
  for (let i = 0; i < entries.length; i += 2) {
    const row = entries.slice(i, i + 2).map(([key, label]) => ({
      text: label,
      callback_data: `connect:${key}`,
    }));
    inline_keyboard.push(row);
  }
  await ctx.reply(
    '🔗 *Connect an Ad Account*\n\nChoose a platform to connect:',
    {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard },
    }
  );
}
async function handleStatusAction(ctx, deps) {
  try {
    const result = deps.repos?.campaignsRepo?.findAll?.({ userId: ctx.userId }) || { data: [], total: 0 };
    const campaigns = result.data || [];
    const active = campaigns.filter(c => c.status === 'ACTIVE').length;
    const totalSpend = campaigns.reduce((s, c) => s + (c.spend || 0), 0);
    const totalRevenue = campaigns.reduce((s, c) => s + (c.revenue || 0), 0);
    const roas = totalSpend > 0 ? (totalRevenue / totalSpend).toFixed(2) : '0.00';

    ctx.reply(
      `📊 *Quick Status*\n\n` +
      `Campaigns: ${active} active / ${campaigns.length} total\n` +
      `Spend: Rp ${totalSpend.toLocaleString('id-ID')}\n` +
      `Revenue: Rp ${totalRevenue.toLocaleString('id-ID')}\n` +
      `ROAS: ${roas}x`,
      { parse_mode: 'Markdown' }
    );
  } catch {
    ctx.reply('⚠️ Failed to load status. Try again later.');
  }
}

async function handleReportsAction(ctx, _deps) {
  ctx.reply('📈 Reports feature — use the dashboard at /app for detailed analytics.');
}

async function handleCreateAction(ctx) {
  ctx.reply(
    '🎯 *Create Campaign*\n\n' +
    'Use the web dashboard for full campaign creation:\n' +
    '👉 /app → Campaigns → New Campaign\n\n' +
    'Or connect your Meta account first via /settings.',
    { parse_mode: 'Markdown' }
  );
}

async function handleOptimizeAction(ctx, _deps) {
  ctx.reply(
    '🤖 *AI Optimization*\n\n' +
    'The AI agent analyzes your campaigns and suggests:\n' +
    '• Budget adjustments\n' +
    '• Audience targeting changes\n' +
    '• Creative refreshes\n' +
    '• Bid optimization\n\n' +
    'Use the dashboard for detailed AI insights: /app',
    { parse_mode: 'Markdown' }
  );
}
