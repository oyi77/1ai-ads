/**
 * Platform definitions — single source of truth for the frontend.
 *
 * Mirrors server/platforms/registry.js. Both platforms.tsx and settings.tsx
 * import from here so adding a new platform only requires a registry entry.
 */

export interface PlatformDef {
  key: string;
  label: string;
  color: string;
  desc: string;
}

export const PLATFORMS: PlatformDef[] = [
  { key: 'meta', label: 'Meta (Facebook/Instagram)', color: '#1877F2', desc: 'Manage Facebook & Instagram ads, audiences, and insights.' },
  { key: 'google', label: 'Google Ads', color: '#4285F4', desc: 'Search, Display, YouTube, and Shopping campaigns.' },
  { key: 'tiktok', label: 'TikTok Ads', color: '#000000', desc: 'TikTok For Business ad management.' },
  { key: 'linkedin', label: 'LinkedIn Ads', color: '#0A66C2', desc: 'B2B advertising on LinkedIn.' },
  { key: 'twitter', label: 'Twitter/X Ads', color: '#1DA1F2', desc: 'Promoted tweets and campaigns on X.' },
  { key: 'snapchat', label: 'Snapchat Ads', color: '#FFFC00', desc: 'Snap Ads and Story Ads.' },
  { key: 'pinterest', label: 'Pinterest Ads', color: '#E60023', desc: 'Promoted Pins and shopping ads.' },
  { key: 'microsoft', label: 'Microsoft/Bing Ads', color: '#00A4EF', desc: 'Bing search and audience ads.' },
  { key: 'reddit', label: 'Reddit Ads', color: '#FF4500', desc: 'Promoted posts and campaigns on Reddit.' },
  { key: 'spotify', label: 'Spotify Ads', color: '#1DB954', desc: 'Audio and display ads on Spotify.' },
  { key: 'whatsapp', label: 'WhatsApp Business Ads', color: '#25D366', desc: 'Click-to-WhatsApp and business messaging ads.' },
  { key: 'amazon', label: 'Amazon Ads', color: '#FF9900', desc: 'Sponsored Products, Brands, and Display ads on Amazon.' },
  { key: 'apple', label: 'Apple Search Ads', color: '#A2AAAD', desc: 'App Store search and display campaigns.' },
  { key: 'criteo', label: 'Criteo Ads', color: '#FF6600', desc: 'Commerce media and retargeting campaigns.' },
  { key: 'taboola', label: 'Taboola Ads', color: '#0077B5', desc: 'Native advertising and content discovery.' },
  { key: 'thetradedesk', label: 'The Trade Desk', color: '#4688F1', desc: 'Programmatic advertising and demand-side platform.' },
  { key: 'yandex', label: 'Yandex Direct', color: '#FF0000', desc: 'Search and display advertising on Yandex.' },
  { key: 'baidu', label: 'Baidu Ads', color: '#2319DC', desc: 'Search and display advertising on Baidu.' },
  { key: 'kakao', label: 'KakaoTalk Ads', color: '#FEE500', desc: 'KakaoTalk messaging and display ads.' },
  { key: 'line', label: 'LINE Ads', color: '#00B900', desc: 'LINE messaging and display advertising.' },
];
