/**
 * Domain: Attribution — Attribution Tracking + UTM Tagging
 *
 * Pure business logic for:
 * - UTM parameter generation
 * - Attribution matching (ad → conversion)
 * - Click tracking
 */



/**
 * Generate a tagged URL with UTM parameters.
 * @param {object} params
 * @param {string} params.url — original URL
 * @param {string} params.campaign — campaign name/ID
 * @param {string} params.adset — adset name/ID
 * @param {string} params.ad — ad name/ID
 * @param {string} params.source — utm_source (default: 'adforge')
 * @returns {object} { originalUrl, taggedUrl, utmParams }
 */
export function tagUrl({ url, campaign, adset, ad, source = 'adforge' }) {
  const sep = url.includes('?') ? '&' : '?';
  const params = new URLSearchParams({
    utm_source: source,
    utm_medium: 'paid',
    utm_campaign: campaign || '',
    utm_content: adset || ad || '',
  });
  const taggedUrl = `${url}${sep}${params.toString()}`;
  return { originalUrl: url, taggedUrl, utmParams: Object.fromEntries(params) };
}

/**
 * Match a conversion to an ad based on attribution data.
 * @param {object} conversion — { order_id, revenue, utm_campaign, utm_content, click_id }
 * @param {object[]} ads — list of ads to match against
 * @returns {object|null} matched ad or null
 */
export function matchConversion(conversion, ads) {
  if (!conversion || !ads) return null;

  // Match by click_id (most accurate)
  if (conversion.click_id) {
    const match = ads.find(a => a.click_id === conversion.click_id);
    if (match) return { ad: match, method: 'click_id', confidence: 'high' };
  }

  // Match by utm_campaign + utm_content
  if (conversion.utm_campaign) {
    const match = ads.find(a =>
      a.campaign_id === conversion.utm_campaign &&
      (!conversion.utm_content || a.ad_id === conversion.utm_content)
    );
    if (match) return { ad: match, method: 'utm_params', confidence: 'medium' };
  }

  // Match by time window (last-click within 7 days)
  if (conversion.timestamp) {
    const windowMs = 7 * 24 * 60 * 60 * 1000;
    const match = ads.find(a =>
      a.last_click_at &&
      (new Date(conversion.timestamp) - new Date(a.last_click_at)) < windowMs
    );
    if (match) return { ad: match, method: 'time_window', confidence: 'low' };
  }

  return null;
}

/**
 * Calculate attribution summary.
 * @param {object[]} attributions — matched attributions
 * @returns {object} summary stats
 */
export function summarizeAttributions(attributions) {
  if (!attributions || attributions.length === 0) {
    return { total: 0, totalRevenue: 0, byMethod: {}, byCampaign: {} };
  }

  const byMethod = {};
  const byCampaign = {};
  let totalRevenue = 0;

  for (const attr of attributions) {
    const revenue = attr.revenue || 0;
    totalRevenue += revenue;

    const method = attr.method || 'unknown';
    byMethod[method] = (byMethod[method] || { count: 0, revenue: 0 });
    byMethod[method].count++;
    byMethod[method].revenue += revenue;

    const campaign = attr.campaign_id || 'unknown';
    byCampaign[campaign] = (byCampaign[campaign] || { count: 0, revenue: 0 });
    byCampaign[campaign].count++;
    byCampaign[campaign].revenue += revenue;
  }

  return { total: attributions.length, totalRevenue, byMethod, byCampaign };
}
