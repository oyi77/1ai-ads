export default {
  key: 'meta',
  label: 'Meta (Facebook/Instagram)',
  color: '#1877F2',
  desc: 'Facebook & Instagram ads, audiences, and insights.',
  className: 'MetaAdsAPI',
  routePath: 'meta',
  icon: 'Facebook',
  envPrefix: 'META',
  hasCustomRoutes: true,
  routeModule: './meta-accounts.js',
  routeFactory: 'createMetaAccountsRouter',
};
