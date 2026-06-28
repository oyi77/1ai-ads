/**
 * /start command — Comprehensive onboarding flow
 * Guides new users through platform connection and setup
 */

import { createLogger } from '../../lib/logger.js';

const log = createLogger('bot:start');

export function handleStart() {
  return async (ctx) => {
    const name = ctx.from?.first_name || 'there';
    const userId = ctx.from?.id;

    log.info('User started bot', { userId, name });

    await ctx.reply(
      `👋 *Welcome to AdForge, ${name}!*\n\n` +
      'I\'m your AI-powered ad management assistant. ' +
      'Let me help you set up your ad empire.\n\n' +
      '*Quick Setup:*',
      { parse_mode: 'Markdown' }
    );

    await ctx.reply(
      '*Step 1: Connect Your Ad Platform*\n\n' +
      'Choose a platform to connect. You\'ll need an access token from your ad manager.\n\n' +
      '📘 *Meta* — Facebook & Instagram ads\n' +
      '🔍 *Google* — Search, Display, YouTube ads\n' +
      '🎵 *TikTok* — TikTok For Business ads\n' +
      '💼 *LinkedIn* — B2B advertising\n' +
      '🐦 *Twitter/X* — Promoted tweets\n\n' +
      'You can also connect via the web dashboard:\n' +
      '👉 https://adforge.aitradepulse.com/platforms',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📘 Meta', callback_data: 'connect:meta' },
              { text: '🔍 Google', callback_data: 'connect:google' },
            ],
            [
              { text: '🎵 TikTok', callback_data: 'connect:tiktok' },
              { text: '💼 LinkedIn', callback_data: 'connect:linkedin' },
            ],
            [{ text: '⏭️ Skip Setup', callback_data: 'quick:menu' }],
          ],
        },
      }
    );
  };
}

export function handleConnect() {
  return async (ctx) => {
    const platform = ctx.match?.[1] || 'meta';
    const platformNames = {
      meta: 'Meta (Facebook/Instagram)',
      google: 'Google Ads',
      tiktok: 'TikTok Ads',
      linkedin: 'LinkedIn Ads',
      twitter: 'Twitter/X Ads',
      snapchat: 'Snapchat Ads',
      pinterest: 'Pinterest Ads',
      microsoft: 'Microsoft/Bing Ads',
    };

    const pName = platformNames[platform] || platform;

    await ctx.reply(
      `*Connect ${pName}*\n\n` +
      'To connect, you need an access token from your ad platform.\n\n' +
      '*How to get your token:*\n' +
      `1. Go to your ${pName} developer portal\n` +
      '2. Create an app or use existing one\n' +
      '3. Generate an access token with ads permissions\n' +
      '4. Paste the token below\n\n' +
      'Or use the web dashboard for easier setup:\n' +
      '👉 https://adforge.aitradepulse.com/settings',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🌐 Open Web Dashboard', url: 'https://adforge.aitradepulse.com/settings' }],
            [{ text: '📋 Main Menu', callback_data: 'quick:menu' }],
          ],
        },
      }
    );
  };
}
