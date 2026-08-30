export default {
  key: 'meta',
  name: 'Meta (Facebook/Instagram)',
  description: 'Manage Meta Ads campaigns (Facebook, Instagram, Messenger, Audience Network)',
  authType: 'oauth2',
  className: 'MetaAdsAPI',
  authUrl: 'https://www.facebook.com/v22.0/dialog/oauth',
  tokenUrl: 'https://graph.facebook.com/v22.0/oauth/access_token',
  scopes: [
    'ads_management',
    'ads_read',
    'business_management',
    'pages_read_engagement',
  ],
  fields: [
    { key: 'access_token', label: 'Access Token', type: 'string', required: true },
    { key: 'ad_account_id', label: 'Ad Account ID', type: 'string', required: true },
    { key: 'business_id', label: 'Business Manager ID', type: 'string', required: false },
  ],
};
