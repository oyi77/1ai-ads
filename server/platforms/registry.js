/**
 * Platform Registry — single source of truth for all platform definitions.
 *
 * Adding a new platform:
 *   1. Add an entry here
 *   2. Create the service class in ../services/<name>-api.js
 *   That's it. Routes, config, and frontend all derive from this file.
 *
 * Fields:
 *   label       — human-readable name
 *   color       — brand hex color
 *   desc        — short description (used by frontend)
 *   service     — path to the API service module (relative to this file)
 *   className   — exported class name from the service module
 *   routePath   — URL prefix used by the router (e.g. 'google-ads')
 *   routeModule — (optional) path to a custom route module (relative to ../routes/)
 *   routeFactory — (optional) exported factory function name from routeModule
 */

export const PLATFORM_REGISTRY = {
  meta: {
    label: 'Meta (Facebook/Instagram)',
    color: '#1877F2',
    desc: 'Manage Facebook & Instagram ads, audiences, and insights.',
    service: '../services/meta-api.js',
    className: 'MetaAdsAPI',
    routePath: 'meta',
    routeModule: './meta-accounts.js',
    routeFactory: 'createMetaAccountsRouter',
  },
  google: {
    label: 'Google Ads',
    color: '#4285F4',
    desc: 'Search, Display, YouTube, and Shopping campaigns.',
    service: '../services/google-ads-api.js',
    className: 'GoogleAdsAPI',
    routePath: 'google-ads',
    routeModule: './google-ads.js',
    routeFactory: 'createGoogleAdsRouter',
  },
  tiktok: {
    label: 'TikTok Ads',
    color: '#000000',
    desc: 'TikTok For Business ad management.',
    service: '../services/tiktok-api.js',
    className: 'TikTokAdsAPI',
    routePath: 'tiktok-ads',
    routeModule: './tiktok-ads.js',
    routeFactory: 'createTikTokAdsRouter',
  },
  linkedin: {
    label: 'LinkedIn Ads',
    color: '#0A66C2',
    desc: 'B2B advertising on LinkedIn.',
    service: '../services/linkedin-ads-api.js',
    className: 'LinkedInAdsAPI',
    routePath: 'linkedin-ads',
    routeModule: './linkedin-ads.js',
    routeFactory: 'createLinkedInAdsRouter',
  },
  twitter: {
    label: 'Twitter/X Ads',
    color: '#1DA1F2',
    desc: 'Promoted tweets and campaigns on X.',
    service: '../services/twitter-ads-api.js',
    className: 'TwitterAdsAPI',
    routePath: 'twitter-ads',
    routeModule: './twitter-ads.js',
    routeFactory: 'createTwitterAdsRouter',
  },
  snapchat: {
    label: 'Snapchat Ads',
    color: '#FFFC00',
    desc: 'Snap Ads and Story Ads.',
    service: '../services/snapchat-ads-api.js',
    className: 'SnapchatAdsAPI',
    routePath: 'snapchat-ads',
    routeModule: './snapchat-ads.js',
    routeFactory: 'createSnapchatAdsRouter',
  },
  pinterest: {
    label: 'Pinterest Ads',
    color: '#E60023',
    desc: 'Promoted Pins and shopping ads.',
    service: '../services/pinterest-ads-api.js',
    className: 'PinterestAdsAPI',
    routePath: 'pinterest-ads',
    routeModule: './pinterest-ads.js',
    routeFactory: 'createPinterestAdsRouter',
  },
  microsoft: {
    label: 'Microsoft/Bing Ads',
    color: '#00A4EF',
    desc: 'Bing search and audience ads.',
    service: '../services/microsoft-ads-api.js',
    className: 'MicrosoftAdsAPI',
    routePath: 'microsoft-ads',
    routeModule: './microsoft-ads.js',
    routeFactory: 'createMicrosoftAdsRouter',
  },
  reddit: {
    label: 'Reddit Ads',
    color: '#FF4500',
    desc: 'Promoted posts and campaigns on Reddit.',
    service: '../services/reddit-ads-api.js',
    className: 'RedditAdsAPI',
    routePath: 'reddit-ads',
  },
  spotify: {
    label: 'Spotify Ads',
    color: '#1DB954',
    desc: 'Audio and display ads on Spotify.',
    service: '../services/spotify-ads-api.js',
    className: 'SpotifyAdsAPI',
    routePath: 'spotify-ads',
  },
  whatsapp: {
    label: 'WhatsApp Business Ads',
    color: '#25D366',
    desc: 'Click-to-WhatsApp and business messaging ads.',
    service: '../services/whatsapp-ads-api.js',
    className: 'WhatsAppAdsAPI',
    routePath: 'whatsapp-ads',
  },
  amazon: {
    label: 'Amazon Ads',
    color: '#FF9900',
    desc: 'Sponsored Products, Brands, and Display ads on Amazon.',
    service: '../services/amazon-ads-api.js',
    className: 'AmazonAdsAPI',
    routePath: 'amazon-ads',
  },
  apple: {
    label: 'Apple Search Ads',
    color: '#A2AAAD',
    desc: 'App Store search and display campaigns.',
    service: '../services/apple-ads-api.js',
    className: 'AppleAdsAPI',
    routePath: 'apple-ads',
  },
  criteo: {
    label: 'Criteo Ads',
    color: '#FF6600',
    desc: 'Commerce media and retargeting campaigns.',
    service: '../services/criteo-ads-api.js',
    className: 'CriteoAdsAPI',
    routePath: 'criteo-ads',
  },
  taboola: {
    label: 'Taboola Ads',
    color: '#0077B5',
    desc: 'Native advertising and content discovery.',
    service: '../services/taboola-ads-api.js',
    className: 'TaboolaAdsAPI',
    routePath: 'taboola-ads',
  },
  thetradedesk: {
    label: 'The Trade Desk',
    color: '#4688F1',
    desc: 'Programmatic advertising and demand-side platform.',
    service: '../services/thetradedesk-api.js',
    className: 'TheTradeDeskAPI',
    routePath: 'thetradedesk-ads',
  },
  yandex: {
    label: 'Yandex Direct',
    color: '#FF0000',
    desc: 'Search and display advertising on Yandex.',
    service: '../services/yandex-ads-api.js',
    className: 'YandexAdsAPI',
    routePath: 'yandex-ads',
  },
  baidu: {
    label: 'Baidu Ads',
    color: '#2319DC',
    desc: 'Search and display advertising on Baidu.',
    service: '../services/baidu-ads-api.js',
    className: 'BaiduAdsAPI',
    routePath: 'baidu-ads',
  },
  kakao: {
    label: 'KakaoTalk Ads',
    color: '#FEE500',
    desc: 'KakaoTalk messaging and display ads.',
    service: '../services/kakao-ads-api.js',
    className: 'KakaoAdsAPI',
    routePath: 'kakao-ads',
  },
  line: {
    label: 'LINE Ads',
    color: '#00B900',
    desc: 'LINE messaging and display advertising.',
    service: '../services/line-ads-api.js',
    className: 'LineAdsAPI',
    routePath: 'line-ads',
  },
};

/**
 * Get registry entry for a platform key.
 * @param {string} key
 * @returns {object|undefined}
 */
export function getPlatformConfig(key) {
  return PLATFORM_REGISTRY[key];
}

/**
 * List all registered platform keys.
 * @returns {string[]}
 */
export function listPlatformKeys() {
  return Object.keys(PLATFORM_REGISTRY);
}
