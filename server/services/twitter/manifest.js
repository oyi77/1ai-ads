export default {
  key: 'twitter',
  label: 'Twitter/X Ads',
  color: '#1DA1F2',
  desc: 'Promoted tweets and campaigns on X.',
  className: 'TwitterAdsAPI',
  routePath: 'twitter-ads',
  icon: 'Twitter',
  envPrefix: 'TWITTER',
  hasCustomRoutes: true,
  routeModule: './twitter-ads.js',
  routeFactory: 'createTwitterAdsRouter',
};
