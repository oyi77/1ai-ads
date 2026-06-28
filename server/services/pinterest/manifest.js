export default {
  key: 'pinterest',
  label: 'Pinterest Ads',
  color: '#E60023',
  desc: 'Promoted Pins and shopping ads.',
  className: 'PinterestAdsAPI',
  routePath: 'pinterest-ads',
  icon: 'Pin',
  envPrefix: 'PINTEREST',
  hasCustomRoutes: true,
  routeModule: './pinterest-ads.js',
  routeFactory: 'createPinterestAdsRouter',
};
