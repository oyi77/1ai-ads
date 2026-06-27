/**
 * Domain: Reporting — Analytics Aggregation + Daily Reports
 *
 * Pure business logic for:
 * - Campaign stats aggregation
 * - Daily report generation
 * - Cross-platform analytics
 */



/**
 * Calculate campaign statistics from a list of campaigns.
 * @param {object[]} campaigns
 * @returns {object} aggregated stats
 */
export function calculateCampaignStats(campaigns) {
  if (!campaigns || campaigns.length === 0) {
    return { totalCampaigns: 0, activeCampaigns: 0, pausedCampaigns: 0, totalSpend: 0, totalRevenue: 0, avgROAS: 0, campaigns: [] };
  }

  let totalSpend = 0, totalRevenue = 0, active = 0;
  const campaignStats = campaigns.map(c => {
    const stats = c.stats || {};
    const spend = stats.spend || c.spend || 0;
    const revenue = stats.revenue || c.revenue || 0;
    totalSpend += spend;
    totalRevenue += revenue;
    if (c.status === 'ACTIVE' || c.status === 'active') active++;

    return {
      id: c.id, name: c.name || c.id, status: c.status,
      spend, revenue, roas: spend > 0 ? revenue / spend : 0,
      impressions: stats.impressions || c.impressions || 0,
      clicks: stats.clicks || c.clicks || 0,
      conversions: stats.conversions || c.conversions || 0,
    };
  });

  return {
    totalCampaigns: campaigns.length,
    activeCampaigns: active,
    pausedCampaigns: campaigns.length - active,
    totalSpend, totalRevenue,
    avgROAS: totalSpend > 0 ? totalRevenue / totalSpend : 0,
    campaigns: campaignStats,
  };
}

/**
 * Generate a daily report text.
 * @param {object} stats — from calculateCampaignStats
 * @param {string} date — report date
 * @returns {string} formatted report
 */
export function formatDailyReport(stats, date = new Date().toISOString().split('T')[0]) {
  const lines = [
    `📊 *Daily Report — ${date}*`,
    '',
    `Campaigns: ${stats.activeCampaigns} active / ${stats.totalCampaigns} total`,
    `Spend: Rp ${stats.totalSpend.toLocaleString('id-ID')}`,
    `Revenue: Rp ${stats.totalRevenue.toLocaleString('id-ID')}`,
    `ROAS: ${stats.avgROAS.toFixed(2)}x`,
    '',
  ];

  // Top 5 by ROAS
  const top = [...stats.campaigns].sort((a, b) => b.roas - a.roas).slice(0, 5);
  if (top.length > 0) {
    lines.push('*Top Campaigns:*');
    top.forEach((c, i) => {
      lines.push(`${i + 1}. ${c.name} — ROAS ${c.roas.toFixed(2)}x (Rp ${c.spend.toLocaleString('id-ID')})`);
    });
  }

  return lines.join('\n');
}

/**
 * Aggregate metrics across platforms.
 * @param {Object<string, object>} platformData — { meta: {...}, google: {...}, ... }
 * @returns {object} unified metrics
 */
export function aggregatePlatformMetrics(platformData) {
  const platforms = Object.entries(platformData || {});
  let totalSpend = 0, totalRevenue = 0, totalImpressions = 0, totalClicks = 0;

  const byPlatform = platforms.map(([name, data]) => {
    const spend = data.spend || 0;
    const revenue = data.revenue || 0;
    totalSpend += spend;
    totalRevenue += revenue;
    totalImpressions += data.impressions || 0;
    totalClicks += data.clicks || 0;

    return {
      platform: name, spend, revenue,
      roas: spend > 0 ? revenue / spend : 0,
      impressions: data.impressions || 0,
      clicks: data.clicks || 0,
      ctr: data.impressions > 0 ? (data.clicks / data.impressions * 100) : 0,
    };
  });

  return {
    totalSpend, totalRevenue,
    totalROAS: totalSpend > 0 ? totalRevenue / totalSpend : 0,
    totalImpressions, totalClicks,
    totalCTR: totalImpressions > 0 ? (totalClicks / totalImpressions * 100) : 0,
    byPlatform,
  };
}
