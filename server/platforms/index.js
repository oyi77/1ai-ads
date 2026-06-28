/**
 * Platform Registry — single entry point for all platform API clients.
 *
 * Usage:
 *   import { getPlatform, listPlatforms } from './platforms/index.js';
 *   const meta = getPlatform('meta', settingsRepo);
 *   const campaigns = await meta.getCampaigns();
 */

import { MetaAdsAPI } from '../services/meta-api.js';
import { GoogleAdsAPI } from '../services/google-ads-api.js';
import { TikTokAdsAPI } from '../services/tiktok-api.js';
import { LinkedInAdsAPI } from '../services/linkedin-ads-api.js';
import { TwitterAdsAPI } from '../services/twitter-ads-api.js';
import { SnapchatAdsAPI } from '../services/snapchat-ads-api.js';
import { MicrosoftAdsAPI } from '../services/microsoft-ads-api.js';
import { PinterestAdsAPI } from '../services/pinterest-ads-api.js';
import { RedditAdsAPI } from '../services/reddit-ads-api.js';
import { SpotifyAdsAPI } from '../services/spotify-ads-api.js';
import { WhatsAppAdsAPI } from '../services/whatsapp-ads-api.js';
import { AmazonAdsAPI } from '../services/amazon-ads-api.js';
import { AppleAdsAPI } from '../services/apple-ads-api.js';
import { CriteoAdsAPI } from '../services/criteo-ads-api.js';
import { TaboolaAdsAPI } from '../services/taboola-ads-api.js';
import { TheTradeDeskAPI } from '../services/thetradedesk-api.js';
import { YandexAdsAPI } from '../services/yandex-ads-api.js';
import { BaiduAdsAPI } from '../services/baidu-ads-api.js';
import { KakaoAdsAPI } from '../services/kakao-ads-api.js';
import { LineAdsAPI } from '../services/line-ads-api.js';

const PLATFORM_MAP = {
  meta: MetaAdsAPI,
  google: GoogleAdsAPI,
  tiktok: TikTokAdsAPI,
  linkedin: LinkedInAdsAPI,
  twitter: TwitterAdsAPI,
  snapchat: SnapchatAdsAPI,
  microsoft: MicrosoftAdsAPI,
  pinterest: PinterestAdsAPI,
  reddit: RedditAdsAPI,
  spotify: SpotifyAdsAPI,
  whatsapp: WhatsAppAdsAPI,
  amazon: AmazonAdsAPI,
  apple: AppleAdsAPI,
  criteo: CriteoAdsAPI,
  taboola: TaboolaAdsAPI,
  thetradedesk: TheTradeDeskAPI,
  yandex: YandexAdsAPI,
  baidu: BaiduAdsAPI,
  kakao: KakaoAdsAPI,
  line: LineAdsAPI,
};

/**
 * Get a platform API client instance.
 * @param {string} platform — platform name (meta, google, tiktok, etc.)
 * @param {object} settingsRepo — settings repository for credential resolution
 * @returns {BasePlatformApiClient} platform client
 */
export function getPlatform(platform, settingsRepo) {
  const PlatformClass = PLATFORM_MAP[platform];
  if (!PlatformClass) {
    throw new Error(`Unknown platform: ${platform}. Available: ${Object.keys(PLATFORM_MAP).join(', ')}`);
  }
  return new PlatformClass(settingsRepo);
}

/**
 * List all available platform names.
 * @returns {string[]}
 */
export function listPlatforms() {
  return Object.keys(PLATFORM_MAP);
}

/**
 * Get all platform clients for a given settings repo.
 * @param {object} settingsRepo
 * @returns {Object<string, BasePlatformApiClient>}
 */
export function getAllPlatforms(settingsRepo) {
  const result = {};
  for (const name of listPlatforms()) {
    result[name] = new PLATFORM_MAP[name](settingsRepo);
  }
  return result;
}

// Re-export individual classes for direct import
export { MetaAdsAPI } from '../services/meta-api.js';
export { GoogleAdsAPI } from '../services/google-ads-api.js';
export { TikTokAdsAPI } from '../services/tiktok-api.js';
export { LinkedInAdsAPI } from '../services/linkedin-ads-api.js';
export { TwitterAdsAPI } from '../services/twitter-ads-api.js';
export { SnapchatAdsAPI } from '../services/snapchat-ads-api.js';
export { MicrosoftAdsAPI } from '../services/microsoft-ads-api.js';
export { PinterestAdsAPI } from '../services/pinterest-ads-api.js';
export { RedditAdsAPI } from '../services/reddit-ads-api.js';
export { SpotifyAdsAPI } from '../services/spotify-ads-api.js';
export { WhatsAppAdsAPI } from '../services/whatsapp-ads-api.js';
export { AmazonAdsAPI } from '../services/amazon-ads-api.js';
export { AppleAdsAPI } from '../services/apple-ads-api.js';
export { CriteoAdsAPI } from '../services/criteo-ads-api.js';
export { TaboolaAdsAPI } from '../services/taboola-ads-api.js';
export { TheTradeDeskAPI } from '../services/thetradedesk-api.js';
export { YandexAdsAPI } from '../services/yandex-ads-api.js';
export { BaiduAdsAPI } from '../services/baidu-ads-api.js';
export { KakaoAdsAPI } from '../services/kakao-ads-api.js';
export { LineAdsAPI } from '../services/line-ads-api.js';
