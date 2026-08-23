// server/services/metrics-normalizer.js
/**
 * Cross-platform metrics normalizer (P5).
 *
 * Maps each platform's raw insight payload into a common shape:
 *   { spend, revenue, impressions, clicks, conversions }
 *
 * ROAS is intentionally NOT computed per row — it is derived at aggregation
 * time (revenue / spend) so partial rows do not skew the ratio.
 */

export const PLATFORM_KEYS = [
  'meta',
  'google',
  'tiktok',
  'linkedin',
  'twitter',
  'microsoft',
  'snapchat',
  'pinterest',
];

export class MetricsNormalizer {
  /**
   * All platform keys known to the system, in canonical order.
   * @returns {string[]}
   */
  platformKeys() {
    return [...PLATFORM_KEYS];
  }

  /**
   * Normalize a raw stats row for a given platform into the common shape.
   * @param {string} platform
   * @param {Object} [raw]
   * @returns {{ spend: number, revenue: number, impressions: number, clicks: number, conversions: number }}
   */
  normalizePlatformStats(platform, raw = {}) {
    switch (platform) {
      case 'meta':
        return {
          spend: parseFloat(raw.spend || 0),
          revenue: parseFloat(raw.revenue || 0),
          impressions: parseInt(raw.impressions || 0, 10),
          clicks: parseInt(raw.clicks || 0, 10),
          conversions: parseInt(raw.conversions || 0, 10),
        };
      case 'google':
        // Google Ads reports cost in micros (1/1,000,000 of a unit)
        return {
          spend: (raw.costMicros || 0) / 1_000_000,
          revenue: 0,
          impressions: raw.impressions || 0,
          clicks: raw.clicks || 0,
          conversions: raw.conversions || 0,
        };
      case 'tiktok':
        return {
          spend: parseFloat(raw.spend || raw.cost || 0),
          revenue: 0,
          impressions: parseInt(raw.impressions || 0, 10),
          clicks: parseInt(raw.clicks || 0, 10),
          conversions: parseInt(raw.conversions || 0, 10),
        };
      case 'linkedin':
        return {
          spend: parseFloat(raw.costInLocalCurrency || raw.spend || 0),
          revenue: 0,
          impressions: parseInt(raw.impressions || 0, 10),
          clicks: parseInt(raw.clicks || 0, 10),
          conversions: parseInt(raw.conversions || 0, 10),
        };
      default:
        return { spend: 0, revenue: 0, impressions: 0, clicks: 0, conversions: 0 };
    }
  }

  /**
   * Sum multiple normalized entries and derive ROAS.
   * @param {Array<Object>} entries - normalized { spend, revenue, impressions, clicks, conversions } rows
   * @returns {{ spend: number, revenue: number, impressions: number, clicks: number, conversions: number, roas: number }}
   */
  aggregate(entries = []) {
    const totals = { spend: 0, revenue: 0, impressions: 0, clicks: 0, conversions: 0 };
    for (const entry of entries) {
      totals.spend += entry.spend || 0;
      totals.revenue += entry.revenue || 0;
      totals.impressions += entry.impressions || 0;
      totals.clicks += entry.clicks || 0;
      totals.conversions += entry.conversions || 0;
    }
    totals.roas = totals.spend > 0 ? totals.revenue / totals.spend : 0;
    return totals;
  }
}
