/**
 * Navigation utilities for consistent UX across all bot menus
 */
import { listPlatforms, getPlatformConfig } from '../platforms/index.js';

// Standard navigation buttons
export const NAV = {
  menu: { text: '📋 Menu', callback_data: 'quick:menu' },
  back: (to = 'menu') => ({ text: '⬅️ Back', callback_data: `nav:back:${to}` }),
  cancel: (to = 'menu') => ({ text: '❌ Cancel', callback_data: `nav:cancel:${to}` }),
  close: () => ({ text: '✕ Close', callback_data: 'nav:close' }),
};

/**
 * Platform keyboard with all supported platforms
 * @param {Object} deps - Dependencies
 * @param {number} userId - User ID
 * @returns {Promise<Array<Array<Object>>>} Platform rows
 */
export async function buildPlatformKeyboard(deps, userId) {
  const platforms = listPlatforms();
  const connectedPlatforms = new Set(
    (deps.repos?.platformAccountsRepo?.findByUserId?.(userId) || []).map(a => a.platform)
  );

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

export default {
  NAV,
  buildPlatformKeyboard,
  buildPlatformAccountKeyboard,
};