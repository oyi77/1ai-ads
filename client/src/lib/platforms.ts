/**
 * Platform definitions — single source of truth for the frontend.
 *
 * The canonical list lives on the server (derived from manifest.js files).
 * PLATFORMS is the static fallback for SSR/offline; fetchPlatforms() pulls
 * the live list from /api/platforms at runtime.
 */

export interface PlatformDef {
  key: string;
  label: string;
  color: string;
  desc: string;
  icon: string;
  routePath: string;
}

// Static fallback — kept in sync with server manifest.js files.
// Used when the API is unreachable (SSR, offline, first paint).
export const PLATFORMS: PlatformDef[] = [
  { key: 'meta', label: 'Meta (Facebook/Instagram)', color: '#1877F2', desc: 'Facebook & Instagram ads, audiences, and insights.', icon: 'Facebook', routePath: 'meta' },
  { key: 'google', label: 'Google Ads', color: '#4285F4', desc: 'Search, Display, YouTube, and Shopping campaigns.', icon: 'Chrome', routePath: 'google-ads' },
  { key: 'tiktok', label: 'TikTok Ads', color: '#000000', desc: 'TikTok For Business ad management.', icon: 'Music', routePath: 'tiktok-ads' },
  { key: 'linkedin', label: 'LinkedIn Ads', color: '#0A66C2', desc: 'B2B advertising on LinkedIn.', icon: 'Linkedin', routePath: 'linkedin-ads' },
  { key: 'twitter', label: 'Twitter/X Ads', color: '#1DA1F2', desc: 'Promoted tweets and campaigns on X.', icon: 'Twitter', routePath: 'twitter-ads' },
  { key: 'snapchat', label: 'Snapchat Ads', color: '#FFFC00', desc: 'Snap Ads and Story Ads.', icon: 'Ghost', routePath: 'snapchat-ads' },
  { key: 'pinterest', label: 'Pinterest Ads', color: '#E60023', desc: 'Promoted Pins and shopping ads.', icon: 'Pin', routePath: 'pinterest-ads' },
  { key: 'microsoft', label: 'Microsoft/Bing Ads', color: '#00A4EF', desc: 'Bing search and audience ads.', icon: 'Monitor', routePath: 'microsoft-ads' },
  { key: 'reddit', label: 'Reddit Ads', color: '#FF4500', desc: 'Promoted posts and campaigns on Reddit.', icon: 'MessageSquare', routePath: 'reddit-ads' },
  { key: 'spotify', label: 'Spotify Ads', color: '#1DB954', desc: 'Audio and display ads on Spotify.', icon: 'Music2', routePath: 'spotify-ads' },
  { key: 'whatsapp', label: 'WhatsApp Business Ads', color: '#25D366', desc: 'Click-to-WhatsApp and business messaging ads.', icon: 'MessageCircle', routePath: 'whatsapp-ads' },
  { key: 'amazon', label: 'Amazon Ads', color: '#FF9900', desc: 'Sponsored Products, Brands, and Display ads on Amazon.', icon: 'ShoppingCart', routePath: 'amazon-ads' },
  { key: 'apple', label: 'Apple Search Ads', color: '#A2AAAD', desc: 'App Store search and display campaigns.', icon: 'Smartphone', routePath: 'apple-ads' },
  { key: 'criteo', label: 'Criteo Ads', color: '#FF6600', desc: 'Commerce media and retargeting campaigns.', icon: 'RotateCw', routePath: 'criteo-ads' },
  { key: 'taboola', label: 'Taboola Ads', color: '#0077B5', desc: 'Native advertising and content discovery.', icon: 'LayoutGrid', routePath: 'taboola-ads' },
  { key: 'thetradedesk', label: 'The Trade Desk', color: '#4688F1', desc: 'Programmatic advertising and demand-side platform.', icon: 'BarChart3', routePath: 'thetradedesk-ads' },
  { key: 'yandex', label: 'Yandex Direct', color: '#FF0000', desc: 'Search and display advertising on Yandex.', icon: 'Search', routePath: 'yandex-ads' },
  { key: 'baidu', label: 'Baidu Ads', color: '#2319DC', desc: 'Search and display advertising on Baidu.', icon: 'Globe', routePath: 'baidu-ads' },
  { key: 'kakao', label: 'KakaoTalk Ads', color: '#FEE500', desc: 'KakaoTalk messaging and display ads.', icon: 'MessageSquare', routePath: 'kakao-ads' },
  { key: 'line', label: 'LINE Ads', color: '#00B900', desc: 'LINE messaging and display advertising.', icon: 'MessageCircle', routePath: 'line-ads' },
];

/**
 * Fetch the live platform list from the server.
 * Falls back to the static PLATFORMS array on error.
 */
export async function fetchPlatforms(): Promise<PlatformDef[]> {
  try {
    const res = await fetch('/api/platforms');
    if (!res.ok) return PLATFORMS;
    const json = await res.json();
    return json.success && Array.isArray(json.data) ? json.data : PLATFORMS;
  } catch {
    return PLATFORMS;
  }
}
