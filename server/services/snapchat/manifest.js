export default {
  key: 'snapchat',
  label: 'Snapchat Ads',
  color: '#FFFC00',
  desc: 'Snap Ads and Story Ads.',
  className: 'SnapchatAdsAPI',
  routePath: 'snapchat-ads',
  icon: 'Ghost',
  envPrefix: 'SNAPCHAT',
  hasCustomRoutes: true,
  routeModule: './snapchat-ads.js',
  routeFactory: 'createSnapchatAdsRouter',
};
