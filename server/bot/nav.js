/**
 * Navigation utilities for consistent UX across all bot menus
 */
import { createLogger } from '../lib/logger.js';
import { listPlatforms, getPlatformConfig } from '../platforms/index.js';

const log = createLogger('bot:nav');

// Standard navigation buttons
export const NAV = {
  menu: { text: '📋 Menu', callback_data: 'quick:menu' },
  back: (to = 'menu') => ({ text: '⬅️ Back', callback_data: `nav:back:${to}` }),
  cancel: (to = 'menu') => ({ text: '❌ Cancel', callback_data: `nav:cancel:${to}` }),
  close: () => ({ text: '✕ Close', callback_data: 'nav:close' }),
};

/**
 * Build a standard footer with navigation buttons
 * @param {Object} options
 * @param {boolean} options.back - Include back button
 * @param {string} options.backTo - Where back goes (default 'menu')
 * @param {boolean} options.cancel - Include cancel button
 * @param {string} options.cancelTo - Where cancel goes (default 'menu')
 * @param {boolean} options.menu - Always include menu button
 * @returns {Array<Array<Object>>} Inline keyboard rows
 */
export function buildNavFooter({ back = true, backTo = 'menu', cancel = false, cancelTo = 'menu', menu = true } = {}) {
  const rows = [];
  if (back) rows.push([NAV.back(backTo)]);
  if (cancel) rows.push([NAV.cancel(cancelTo)]);
  if (menu) rows.push([NAV.menu]);
  return rows;
}

/**
 * Build a keyboard with custom rows + standard navigation footer
 * @param {Array<Array<Object>>} contentRows - Custom content rows
 * @param {Object} options - Navigation options
 * @returns {Object} Full inline keyboard
 */
export function buildKeyboard(contentRows, options = {}) {
  return {
    inline_keyboard: [...contentRows, ...buildNavFooter(options)],
  };
}

/**
 * Platform keyboard with all supported platforms
 * @param {Object} deps - Dependencies
 * @param {number} userId - User ID
 * @returns {Promise<Array<Array<Object>>>} Platform rows
 */
export async function buildPlatformKeyboard(deps, userId) {
  const platformAccountsRepo = deps.repos?.platformAccountsRepo;
  const connectedAccounts = await (platformAccountsRepo?.findByUserId?.(userId) || Promise.resolve([]));
  const connectedPlatforms = new Set(connectedAccounts.map(a => a.platform));

  const platforms = listPlatforms();
  const rows = [];

  for (const key of platforms) {
    const config = getPlatformConfig(key);
    if (!config) continue;

    const isConnected = connectedPlatforms.has(key);
    const icon = isConnected ? '✅' : '➕';
    const label = config.name || key;

    rows.push([{
      text: `${icon} ${label}`,
      callback_data: `platform:${key}:${isConnected ? 'manage' : 'connect'}`,
    }]);
  }

  return rows;
}

/**
 * Platform account keyboard
 * @param {Object} deps - Dependencies
 * @param {number} userId - User ID
 * @param {string} platform - Platform key
 * @returns {Promise<Array<Array<Object>>>} Account rows
 */
export async function buildPlatformAccountKeyboard(deps, userId, platform) {
  const platformAccountsRepo = deps.repos?.platformAccountsRepo;
  if (!platformAccountsRepo) return [];

  const accounts = platformAccountsRepo.findByUserId(userId)?.filter(a => a.platform === platform) || [];
  const rows = [];

  for (const acc of accounts) {
    const status = acc.is_active ? '✅' : '⏸';
    rows.push([{
      text: `${status} ${acc.account_name} (${platform})`,
      callback_data: `platform:account:${platform}:${acc.id}`,
    }]);
  }

  if (rows.length === 0) {
    rows.push([{
      text: `➕ Connect ${platform}`,
      callback_data: `platform:${platform}:connect`,
    }]);
  }

  return rows;
}

/**
 * Campaign keyboard for a platform account
 * @param {Object} api - Platform API instance
 * @param {string} accountId - Account ID
 * @param {string} platform - Platform key
 * @param {number} page - Page number
 * @returns {Promise<Object>} Keyboard with campaigns
 */
export async function buildCampaignKeyboard(api, accountId, platform, page = 1) {
  const rows = [];
  try {
    const campaigns = await api.getCampaigns(accountId);
    const { slice, pages, p } = pageSlice(campaigns, page, 8);
    for (const c of slice) {
      const status = c.status === 'active' ? '✅' : c.status === 'paused' ? '⏸' : '❓';
      rows.push([{
        text: `${status} ${c.name}`,
        callback_data: `campaign:${platform}:${accountId}:${c.id}:view`,
      }]);
    }
    if (pages > 1) {
      rows.push([
        { text: '◀️ Prev', callback_data: `campaigns:${platform}:${accountId}:${Math.max(1, p - 1)}` },
        { text: `Page ${p}/${pages}`, callback_data: 'nop' },
        { text: 'Next ▶️', callback_data: `campaigns:${platform}:${accountId}:${Math.min(pages, p + 1)}` },
      ]);
    }
    rows.push([
      { text: '➕ Create Campaign', callback_data: `campaign:${platform}:${accountId}:create` },
      { text: '📊 Report', callback_data: `report:${platform}:${accountId}` },
    ]);
  } catch (err) {
    log.warn('buildCampaignKeyboard failed', { platform, accountId, error: err?.message });
    rows.push([{ text: '⚠️ Failed to load campaigns', callback_data: 'nop' }]);
  }
  return { rows, pages: 1, p: 1 };
}

// Helper
function pageSlice(items, page, perPage) {
  const pages = Math.max(1, Math.ceil(items.length / perPage));
  const p = Math.min(Math.max(1, page), pages);
  return { slice: items.slice((p - 1) * perPage, p * perPage), pages, p };
}

/**
 * Standard header for consistent messages
 */
export function makeHeader(title, subtitle = '') {
  return `${title}\n${subtitle ? `\n${subtitle}` : ''}`;
}

/**
 * Standard empty state message
 */
export function makeEmptyState(message, actionText, actionCallback) {
  return {
    msg: `📭 ${message}\n\nWhat would you like to do?`,
    keyboard: [
      [{ text: actionText, callback_data: actionCallback }],
      [{ text: '📋 Menu', callback_data: 'quick:menu' }],
    ],
  };
}

/**
 * Standard success message
 */
export function makeSuccess(message, nextActions = []) {
  const keyboard = [
    ...nextActions.map(a => [{ text: a.text, callback_data: a.callback }]),
    [{ text: '📋 Menu', callback_data: 'quick:menu' }],
  ];
  return { msg: `✅ ${message}`, keyboard };
}

/**
 * Standard error message
 */
export function makeError(message, retryCallback = null) {
  const keyboard = [
    ...(retryCallback ? [[{ text: '🔄 Retry', callback_data: retryCallback }]] : []),
    [{ text: '📋 Menu', callback_data: 'quick:menu' }],
  ];
  return { msg: `⚠️ ${message}`, keyboard };
}

export default {
  NAV,
  buildNavFooter,
  buildKeyboard,
  buildPlatformKeyboard,
  buildPlatformAccountKeyboard,
  buildCampaignKeyboard,
  makeHeader,
  makeEmptyState,
  makeSuccess,
  makeError,
};
