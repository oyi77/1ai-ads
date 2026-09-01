export default {
  key: 'tiktok',
  name: 'TikTok Ads',
  description: 'Manage TikTok Ads campaigns (In-Feed, TopView, Spark Ads)',
  authType: 'oauth2',
  className: 'TikTokAdsAPI',
  authUrl: 'https://ads.tiktok.com/marketing_api/auth',
  tokenUrl: 'https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/',
  scopes: [],
  fields: [
    { key: 'app_id', label: 'App ID', type: 'string', required: true },
    { key: 'secret', label: 'App Secret', type: 'string', required: true },
    { key: 'access_token', label: 'Access Token', type: 'string', required: true },
    { key: 'advertiser_id', label: 'Advertiser ID', type: 'string', required: true },
  ],
  routePath: 'tiktok-ads',
};
