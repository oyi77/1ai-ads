export default {
  key: 'google',
  label: 'Google Ads',
  color: '#4285F4',
  desc: 'Search, Display, YouTube, and Shopping campaigns.',
  className: 'GoogleAdsAPI',
  routePath: 'google-ads',
  icon: 'Chrome',
  envPrefix: 'GOOGLE',
  hasCustomRoutes: true,
  routeModule: './google-ads.js',
  routeFactory: 'createGoogleAdsRouter',
};
