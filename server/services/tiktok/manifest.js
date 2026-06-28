export default {
  key: 'tiktok',
  label: 'TikTok Ads',
  color: '#000000',
  desc: 'TikTok For Business ad management.',
  className: 'TikTokAdsAPI',
  routePath: 'tiktok-ads',
  icon: 'Music',
  envPrefix: 'TIKTOK',
  hasCustomRoutes: true,
  routeModule: './tiktok-ads.js',
  routeFactory: 'createTikTokAdsRouter',
};
