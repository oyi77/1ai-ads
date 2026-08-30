export default {
  key: 'google',
  name: 'Google Ads',
  description: 'Manage Google Ads campaigns (Search, Display, Video, Shopping)',
  authType: 'oauth2',
  className: 'GoogleAdsAPI',
  authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  scopes: [
    'https://www.googleapis.com/auth/adwords',
  ],
  fields: [
    { key: 'developer_token', label: 'Developer Token', type: 'string', required: true },
    { key: 'client_id', label: 'OAuth2 Client ID', type: 'string', required: true },
    { key: 'client_secret', label: 'OAuth2 Client Secret', type: 'string', required: true },
    { key: 'refresh_token', label: 'Refresh Token', type: 'string', required: true },
    { key: 'customer_id', label: 'Customer ID', type: 'string', required: true },
  ],
};
