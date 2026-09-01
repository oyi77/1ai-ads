export default {
  key: 'linkedin',
  name: 'LinkedIn Ads',
  description: 'Manage LinkedIn Ads campaigns (Sponsored Content, Message Ads, Dynamic Ads)',
  authType: 'oauth2',
  className: 'LinkedInAdsAPI',
  authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
  tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
  scopes: [
    'r_ads',
    'r_ads_reporting',
    'r_organization_social',
  ],
  fields: [
    { key: 'client_id', label: 'OAuth2 Client ID', type: 'string', required: true },
    { key: 'client_secret', label: 'OAuth2 Client Secret', type: 'string', required: true },
    { key: 'access_token', label: 'Access Token', type: 'string', required: true },
    { key: 'ad_account_id', label: 'Ad Account ID', type: 'string', required: true },
  ],
  routePath: 'linkedin-ads',
};
