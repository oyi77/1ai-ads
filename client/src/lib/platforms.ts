/**
 * Platform definitions — single source of truth for the frontend.
 *
 * Mirrors server/services/<platform>/manifest.js. Both platforms.tsx and
 * settings.tsx import from here so adding a new platform only requires a
 * manifest entry on the server side and a matching entry here.
 */

export interface PlatformDef {
  key: string;
  label: string;
  color: string;
  desc: string;
  icon: string;
  routePath: string;
  envPrefix: string;
  hasCustomRoutes: boolean;
}

export const PLATFORMS: PlatformDef[] = [
  { key: 'meta', label: 'Meta (Facebook/Instagram)', color: '#1877F2', desc: 'Facebook & Instagram ads, audiences, and insights.', icon: 'Facebook', routePath: 'meta', envPrefix: 'META', hasCustomRoutes: true },
  { key: 'google', label: 'Google Ads', color: '#4285F4', desc: 'Search, Display, YouTube, and Shopping campaigns.', icon: 'Chrome', routePath: 'google-ads', envPrefix: 'GOOGLE', hasCustomRoutes: true },
  { key: 'tiktok', label: 'TikTok Ads', color: '#000000', desc: 'TikTok For Business ad management.', icon: 'Music', routePath: 'tiktok-ads', envPrefix: 'TIKTOK', hasCustomRoutes: true },
  { key: 'linkedin', label: 'LinkedIn Ads', color: '#0A66C2', desc: 'B2B advertising on LinkedIn.', icon: 'Linkedin', routePath: 'linkedin-ads', envPrefix: 'LINKEDIN', hasCustomRoutes: true },
  { key: 'twitter', label: 'Twitter/X Ads', color: '#1DA1F2', desc: 'Promoted tweets and campaigns on X.', icon: 'Twitter', routePath: 'twitter-ads', envPrefix: 'TWITTER', hasCustomRoutes: true },
  { key: 'snapchat', label: 'Snapchat Ads', color: '#FFFC00', desc: 'Snap Ads and Story Ads.', icon: 'Ghost', routePath: 'snapchat-ads', envPrefix: 'SNAPCHAT', hasCustomRoutes: true },
  { key: 'pinterest', label: 'Pinterest Ads', color: '#E60023', desc: 'Promoted Pins and shopping ads.', icon: 'Pin', routePath: 'pinterest-ads', envPrefix: 'PINTEREST', hasCustomRoutes: true },
  { key: 'microsoft', label: 'Microsoft/Bing Ads', color: '#00A4EF', desc: 'Bing search and audience ads.', icon: 'Monitor', routePath: 'microsoft-ads', envPrefix: 'MICROSOFT', hasCustomRoutes: true },
  { key: 'reddit', label: 'Reddit Ads', color: '#FF4500', desc: 'Promoted posts and campaigns on Reddit.', icon: 'MessageSquare', routePath: 'reddit-ads', envPrefix: 'REDDIT', hasCustomRoutes: false },
  { key: 'spotify', label: 'Spotify Ads', color: '#1DB954', desc: 'Audio and display ads on Spotify.', icon: 'Music2', routePath: 'spotify-ads', envPrefix: 'SPOTIFY', hasCustomRoutes: false },
  { key: 'whatsapp', label: 'WhatsApp Business Ads', color: '#25D366', desc: 'Click-to-WhatsApp and business messaging ads.', icon: 'MessageCircle', routePath: 'whatsapp-ads', envPrefix: 'WHATSAPP', hasCustomRoutes: false },
  { key: 'amazon', label: 'Amazon Ads', color: '#FF9900', desc: 'Sponsored Products, Brands, and Display ads on Amazon.', icon: 'ShoppingCart', routePath: 'amazon-ads', envPrefix: 'AMAZON', hasCustomRoutes: false },
  { key: 'apple', label: 'Apple Search Ads', color: '#A2AAAD', desc: 'App Store search and display campaigns.', icon: 'Smartphone', routePath: 'apple-ads', envPrefix: 'APPLE', hasCustomRoutes: false },
  { key: 'criteo', label: 'Criteo Ads', color: '#FF6600', desc: 'Commerce media and retargeting campaigns.', icon: 'RotateCw', routePath: 'criteo-ads', envPrefix: 'CRITEO', hasCustomRoutes: false },
  { key: 'taboola', label: 'Taboola Ads', color: '#0077B5', desc: 'Native advertising and content discovery.', icon: 'LayoutGrid', routePath: 'taboola-ads', envPrefix: 'TABOOLA', hasCustomRoutes: false },
  { key: 'thetradedesk', label: 'The Trade Desk', color: '#4688F1', desc: 'Programmatic advertising and demand-side platform.', icon: 'BarChart3', routePath: 'thetradedesk-ads', envPrefix: 'THETRADEDESK', hasCustomRoutes: false },
  { key: 'yandex', label: 'Yandex Direct', color: '#FF0000', desc: 'Search and display advertising on Yandex.', icon: 'Search', routePath: 'yandex-ads', envPrefix: 'YANDEX', hasCustomRoutes: false },
  { key: 'baidu', label: 'Baidu Ads', color: '#2319DC', desc: 'Search and display advertising on Baidu.', icon: 'Globe', routePath: 'baidu-ads', envPrefix: 'BAIDU', hasCustomRoutes: false },
  { key: 'kakao', label: 'KakaoTalk Ads', color: '#FEE500', desc: 'KakaoTalk messaging and display ads.', icon: 'MessageSquare', routePath: 'kakao-ads', envPrefix: 'KAKAO', hasCustomRoutes: false },
  { key: 'line', label: 'LINE Ads', color: '#00B900', desc: 'LINE messaging and display advertising.', icon: 'MessageCircle', routePath: 'line-ads', envPrefix: 'LINE', hasCustomRoutes: false },
];
