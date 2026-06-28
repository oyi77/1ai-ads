export default {
  key: 'microsoft',
  label: 'Microsoft/Bing Ads',
  color: '#00A4EF',
  desc: 'Bing search and audience ads.',
  className: 'MicrosoftAdsAPI',
  routePath: 'microsoft-ads',
  icon: 'Monitor',
  envPrefix: 'MICROSOFT',
  hasCustomRoutes: true,
  routeModule: './microsoft-ads.js',
  routeFactory: 'createMicrosoftAdsRouter',
};
