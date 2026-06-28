/**
 * Platform Registry — single entry point for all platform API clients.
 *
 * Usage:
 *   import { getPlatform, listPlatforms } from './platforms/index.js';
 *   const meta = getPlatform('meta', settingsRepo);
 *   const campaigns = await meta.getCampaigns();
 */

import { PLATFORM_REGISTRY } from './registry.js';

// Lazily-loaded map of platform key → class constructor.
// Populated on first access so top-level await doesn't block module evaluation.
let _PLATFORM_MAP = null;

async function loadPlatformMap() {
  if (_PLATFORM_MAP) return _PLATFORM_MAP;
  const map = {};
  const entries = Object.entries(PLATFORM_REGISTRY);
  const mods = await Promise.all(entries.map(([, cfg]) => import(cfg.service)));
  for (let i = 0; i < entries.length; i++) {
    map[entries[i][0]] = mods[i][entries[i][1].className];
  }
  _PLATFORM_MAP = map;
  return map;
}

/**
 * Get a platform API client instance.
 * @param {string} platform — platform name (meta, google, tiktok, etc.)
 * @param {object} settingsRepo — settings repository for credential resolution
 * @returns {Promise<BasePlatformApiClient>} platform client
 */
export async function getPlatform(platform, settingsRepo) {
  const map = await loadPlatformMap();
  const PlatformClass = map[platform];
  if (!PlatformClass) {
    throw new Error(`Unknown platform: ${platform}. Available: ${Object.keys(map).join(', ')}`);
  }
  return new PlatformClass(settingsRepo);
}

/**
 * Synchronous access after the map has been loaded.
 * Throws if called before loadPlatformMap() has resolved.
 */
export function getPlatformSync(platform, settingsRepo) {
  if (!_PLATFORM_MAP) {
    throw new Error('Platform map not loaded. Call getPlatform() or loadPlatforms() first.');
  }
  const PlatformClass = _PLATFORM_MAP[platform];
  if (!PlatformClass) {
    throw new Error(`Unknown platform: ${platform}. Available: ${Object.keys(_PLATFORM_MAP).join(', ')}`);
  }
  return new PlatformClass(settingsRepo);
}

/**
 * Pre-load all platform modules. Call once at startup.
 */
export async function loadPlatforms() {
  await loadPlatformMap();
}

/**
 * List all available platform names.
 * @returns {string[]}
 */
export function listPlatforms() {
  return Object.keys(PLATFORM_REGISTRY);
}

/**
 * Get all platform clients for a given settings repo.
 * @param {object} settingsRepo
 * @returns {Promise<Object<string, BasePlatformApiClient>>}
 */
export async function getAllPlatforms(settingsRepo) {
  const map = await loadPlatformMap();
  const result = {};
  for (const name of Object.keys(map)) {
    result[name] = new map[name](settingsRepo);
  }
  return result;
}

// Re-export registry for consumers that need config metadata
export { PLATFORM_REGISTRY, getPlatformConfig, listPlatformKeys } from './registry.js';

// Re-export individual classes for direct import (backward compatibility).
// These are static re-exports so bundlers and existing import sites keep working.
export { MetaAdsAPI } from '../services/meta/index.js';
export { GoogleAdsAPI } from '../services/google/index.js';
export { TikTokAdsAPI } from '../services/tiktok/index.js';
export { LinkedInAdsAPI } from '../services/linkedin/index.js';
export { TwitterAdsAPI } from '../services/twitter/index.js';
export { SnapchatAdsAPI } from '../services/snapchat/index.js';
export { MicrosoftAdsAPI } from '../services/microsoft/index.js';
export { PinterestAdsAPI } from '../services/pinterest/index.js';
export { RedditAdsAPI } from '../services/reddit/index.js';
export { SpotifyAdsAPI } from '../services/spotify/index.js';
export { WhatsAppAdsAPI } from '../services/whatsapp/index.js';
export { AmazonAdsAPI } from '../services/amazon/index.js';
export { AppleAdsAPI } from '../services/apple/index.js';
export { CriteoAdsAPI } from '../services/criteo/index.js';
export { TaboolaAdsAPI } from '../services/taboola/index.js';
export { TheTradeDeskAPI } from '../services/thetradedesk/index.js';
export { YandexAdsAPI } from '../services/yandex/index.js';
export { BaiduAdsAPI } from '../services/baidu/index.js';
export { KakaoAdsAPI } from '../services/kakao/index.js';
export { LineAdsAPI } from '../services/line/index.js';
