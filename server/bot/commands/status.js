/**
 * /status command — Dashboard showing connected ad accounts + per-account reports
 */
import { MetaAdsAPI } from '../../services/meta/index.js';

function escHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmtRp(n) {
  return `Rp ${Number(n || 0).toLocaleString('id-ID')}`;
}

export function handleStatus(deps) {
  return async (ctx) => {
    try {
      const platformAccountsRepo = deps.repos?.platformAccountsRepo;
      const campaignsRepo = deps.repos?.campaignsRepo;

      // Get connected accounts
      const connected = platformAccountsRepo?.findByUserId?.(ctx.userId) || [];
      const activeAccounts = connected.filter(a => a.is_active);

      // Get campaigns
      const result = campaignsRepo?.findAll?.({ userId: ctx.userId }) || { data: [], total: 0 };
      const campaigns = result.data || [];
      const activeCampaigns = campaigns.filter(c => c.status === 'ACTIVE').length;
      const totalSpend = campaigns.reduce((s, c) => s + (c.spend || 0), 0);
      const totalRevenue = campaigns.reduce((s, c) => s + (c.revenue || 0), 0);
      const roas = totalSpend > 0 ? (totalRevenue / totalSpend).toFixed(2) : '0.00';

      let message = `📊 *Dashboard*\n\n`;
      message += `*Account Summary*\n`;
      message += `Campaigns: ${activeCampaigns} active / ${campaigns.length} total\n`;
      message += `Total Spend: ${fmtRp(totalSpend)}\n`;
      message += `Total Revenue: ${fmtRp(totalRevenue)}\n`;
      message += `ROAS: ${roas}x`;

      // Show connected ad accounts
      const keyboard = [];
      if (activeAccounts.length > 0) {
        message += `\n\n*Connected Ad Accounts*\n`;
        for (const acct of activeAccounts) {
          // Note: campaigns table has no account_id column, so show total user campaigns
          message += `• ${escHtml(acct.account_name || acct.platform)}\n`;
        }
        for (const acct of activeAccounts.slice(0, 6)) {
          keyboard.push([{
            text: `📊 ${acct.account_name || acct.platform}`,
            callback_data: `dash:account:${acct.id}`,
          }]);
        }
        keyboard.push([
          { text: '➕ Add Account', callback_data: 'dash:add' },
          { text: '➖ Remove Account', callback_data: 'dash:remove' },
        ]);
      } else {
        message += '\n\n📭 No ad accounts connected.\nConnect your ad account to start monitoring!';
        keyboard.push([{ text: '🔗 Connect Account', callback_data: 'menu:connect' }]);
      }

      keyboard.push([{ text: '📋 Menu', callback_data: 'quick:menu' }]);

      await ctx.reply(message, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: keyboard },
      });
    } catch (err) {
      console.error('Dashboard error:', err.message);
      await ctx.reply('⚠️ Failed to load dashboard.');
    }
  };
}

export function handleDashboardCallback(deps) {
  return async (ctx) => {
    const action = ctx.match[1];
    await ctx.answerCbQuery();

    if (action.startsWith('account:')) {
      const accountId = action.split(':')[1];
      return showAccountReport(ctx, deps, accountId);
    }

    if (action === 'add') {
      return ctx.reply(
        '🔗 *Add Ad Account*\n\nConnect a new ad account:',
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📘 Meta (FB/IG)', callback_data: 'connect:meta' }],
              [{ text: '🔗 Google Ads', callback_data: 'connect:google' }],
              [{ text: '🎵 TikTok', callback_data: 'connect:tiktok' }],
              [{ text: '💼 LinkedIn', callback_data: 'connect:linkedin' }],
              [{ text: '⬅️ Back', callback_data: 'quick:menu' }],
            ],
          },
        }
      );
    }

    if (action === 'remove') {
      const platformAccountsRepo = deps.repos?.platformAccountsRepo;
      const connected = platformAccountsRepo?.findByUserId?.(ctx.userId) || [];
      const activeAccounts = connected.filter(a => a.is_active);

      if (activeAccounts.length === 0) {
        return ctx.reply('📭 No accounts to remove.');
      }

      const keyboard = activeAccounts.map(a => [{
        text: `❌ ${a.account_name || a.platform}`,
        callback_data: `dash:remove:${a.id}`,
      }]);
      keyboard.push([{ text: '⬅️ Back', callback_data: 'quick:menu' }]);

      return ctx.reply(
        '➖ *Remove Account*\n\nSelect an account to remove:',
        { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } }
      );
    }

    if (action.startsWith('remove:')) {
      const removeId = action.split(':')[1];
      try {
        const row = deps.repos.platformAccountsRepo.findById(removeId);
        if (!row || row.user_id !== ctx.userId) {
          return ctx.reply('⚠️ Account not found.');
        }
        deps.repos.platformAccountsRepo.update(removeId, { is_active: 0 });
        return ctx.reply('✅ Account removed.', {
          reply_markup: { inline_keyboard: [[{ text: '📊 Dashboard', callback_data: 'menu:status' }]] },
        });
      } catch (err) {
        return ctx.reply(`❌ Failed: ${err.message}`);
      }
    }

    return ctx.reply('Unknown action.');
  };
}

async function showAccountReport(ctx, deps, accountId) {
  try {
    const platformAccountsRepo = deps.repos?.platformAccountsRepo;
    const campaignsRepo = deps.repos?.campaignsRepo;

    const account = platformAccountsRepo?.findById?.(accountId);
    if (!account) return ctx.reply('⚠️ Account not found.');

    // Get account insights via Meta API using the REAL ad account id (not internal UUID)
    let insights = null;
    const token = account.credentials?.access_token || account.access_token;
    let realAccountId = account.credentials?.ad_account_id;
    let tokenOk = false;
    if (token) {
      try {
        const api = MetaAdsAPI.withToken(token);
        if (!realAccountId) {
          const adAccounts = await api.getAdAccounts();
          if (adAccounts.length > 0) realAccountId = adAccounts[0].id;
        }
        if (realAccountId) {
          tokenOk = true;
          insights = await api.getAccountInsights(realAccountId, { datePreset: 'last_30d' });
        }
      } catch (e) {
        // Token expired or API error → tokenOk stays false
      }
    }

    let message = `📊 *Report: ${escHtml(account.account_name || account.platform)}*\n\n`;

    if (insights) {
      const roas = insights.spend > 0 ? (insights.revenue / insights.spend).toFixed(2) : '0.00';
      message += `*30-Day Performance*\n`;
      message += `💰 Spend: ${fmtRp(insights.spend)}\n`;
      message += `💵 Revenue: ${fmtRp(insights.revenue)}\n`;
      message += `📈 ROAS: ${roas}x\n`;
      message += `👆 Clicks: ${(insights.clicks || 0).toLocaleString('id-ID')}\n`;
      message += `👁 Impressions: ${(insights.impressions || 0).toLocaleString('id-ID')}`;
    } else if (!tokenOk) {
      message += `\n⚠️ Connect a valid token to see detailed insights.`;
    } else {
      message += `\n📭 No ad activity in the last 30 days.`;
    }

    await ctx.reply(message, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '📈 Full Report', callback_data: `ads:report:${account.platform}:${realAccountId || accountId}` }],
          [{ text: '📋 Menu', callback_data: 'quick:menu' }],
        ],
      },
    });
  } catch (err) {
    return ctx.reply(`⚠️ Failed to load report: ${err.message}`);
  }
}

export default { handleStatus, handleDashboardCallback };
