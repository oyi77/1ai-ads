export default {
  key: 'linkedin',
  label: 'LinkedIn Ads',
  color: '#0A66C2',
  desc: 'B2B advertising on LinkedIn.',
  className: 'LinkedInAdsAPI',
  routePath: 'linkedin-ads',
  icon: 'Linkedin',
  envPrefix: 'LINKEDIN',
  hasCustomRoutes: true,
  routeModule: './linkedin-ads.js',
  routeFactory: 'createLinkedInAdsRouter',
};
