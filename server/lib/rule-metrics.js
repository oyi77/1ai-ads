/**
 * Metric Definitions — all supported rule metrics
 */

export const METRIC_CATEGORIES = {
  delivery: 'Delivery Metrics',
  conversion: 'Conversion Metrics',
  efficiency: 'Efficiency Metrics',
  cost: 'Cost Metrics',
  time: 'Time Metrics',
};

export const METRICS = {
  // Time-based
  hour_of_day: {
    id: 'hour_of_day',
    name: 'Hour of Day',
    category: 'time',
    description: 'Current hour (0-23) for dayparting rules',
    unit: 'hour',
    resolve: () => new Date().getHours(),
  },
  day_of_week: {
    id: 'day_of_week',
    name: 'Day of Week',
    category: 'time',
    description: 'Current day (0=Sun, 6=Sat) for dayparting rules',
    unit: 'day',
    resolve: () => new Date().getDay(),
  },

  // Delivery
  impressions: {
    id: 'impressions',
    name: 'Impressions',
    category: 'delivery',
    description: 'Total ad impressions',
    unit: 'count',
    // Source columns that must be present (non-null) on the campaign row.
    // A never-synced row has NULLs; without this guard `spend < 100` matches
    // missing data and floods approval_drafts (proven 2026-09-26: 595/705
    // campaigns had NULL spend).
    requires: ['impressions'],
    resolve: (campaign, insights) => parseInt(insights?.impressions || campaign.impressions || 0),
  },
  clicks: {
    id: 'clicks',
    name: 'Clicks',
    category: 'delivery',
    description: 'Total ad clicks',
    unit: 'count',
    requires: ['clicks'],
    resolve: (campaign, insights) => parseInt(insights?.clicks || campaign.clicks || 0),
  },
  reach: {
    id: 'reach',
    name: 'Reach',
    category: 'delivery',
    description: 'Unique users reached',
    unit: 'count',
    // No `requires`: reach is insights-only, never a campaigns column.
    // Guarding on it would brick every reach rule on DB rows; reach rules
    // were already vacuous there, and insights plumbing is a separate job.
    resolve: (campaign, insights) => parseInt(insights?.reach || campaign.reach || 0),
  },
  frequency: {
    id: 'frequency',
    name: 'Frequency',
    category: 'delivery',
    description: 'Average impressions per user',
    unit: 'x',
    requires: ['impressions'],
    resolve: (campaign, insights) => {
      const impr = parseInt(insights?.impressions || campaign.impressions || 0);
      const reach = parseInt(insights?.reach || campaign.reach || 1);
      return reach > 0 ? parseFloat((impr / reach).toFixed(2)) : 0;
    },
  },

  // Conversion
  conversions: {
    id: 'conversions',
    name: 'Conversions',
    category: 'conversion',
    description: 'Total conversions (purchases, leads, etc)',
    unit: 'count',
    requires: ['conversions'],
    resolve: (campaign, insights) => parseInt(insights?.conversions || campaign.conversions || 0),
  },
  cvr: {
    id: 'cvr',
    name: 'CVR (Conversion Rate)',
    category: 'conversion',
    description: 'Conversions / Clicks * 100',
    unit: '%',
    requires: ['clicks', 'conversions'],
    resolve: (campaign, insights) => {
      const clicks = parseInt(insights?.clicks || campaign.clicks || 0);
      const conv = parseInt(insights?.conversions || campaign.conversions || 0);
      return clicks > 0 ? parseFloat(((conv / clicks) * 100).toFixed(2)) : 0;
    },
  },
  ctr: {
    id: 'ctr',
    name: 'CTR (Click-Through Rate)',
    category: 'conversion',
    description: 'Clicks / Impressions * 100',
    unit: '%',
    requires: ['impressions', 'clicks'],
    resolve: (campaign, insights) => {
      const impr = parseInt(insights?.impressions || campaign.impressions || 0);
      const clicks = parseInt(insights?.clicks || campaign.clicks || 0);
      return impr > 0 ? parseFloat(((clicks / impr) * 100).toFixed(2)) : 0;
    },
  },
  spend: {
    id: 'spend',
    name: 'Spend',
    category: 'cost',
    description: 'Total amount spent',
    unit: 'currency',
    requires: ['spend'],
    resolve: (campaign, insights) => parseFloat(insights?.spend || campaign.spend || 0),
  },
  cpc: {
    id: 'cpc',
    name: 'CPC (Cost Per Click)',
    category: 'cost',
    description: 'Spend / Clicks',
    unit: 'currency',
    requires: ['spend', 'clicks'],
    resolve: (campaign, insights) => {
      const spend = parseFloat(insights?.spend || campaign.spend || 0);
      const clicks = parseInt(insights?.clicks || campaign.clicks || 0);
      return clicks > 0 ? parseFloat((spend / clicks).toFixed(2)) : 0;
    },
  },
  cpm: {
    id: 'cpm',
    name: 'CPM (Cost Per 1000 Impressions)',
    category: 'cost',
    description: 'Spend / Impressions * 1000',
    unit: 'currency',
    requires: ['spend', 'impressions'],
    resolve: (campaign, insights) => {
      const spend = parseFloat(insights?.spend || campaign.spend || 0);
      const impr = parseInt(insights?.impressions || campaign.impressions || 0);
      return impr > 0 ? parseFloat(((spend / impr) * 1000).toFixed(2)) : 0;
    },
  },
  cpa: {
    id: 'cpa',
    name: 'CPA (Cost Per Acquisition)',
    category: 'cost',
    description: 'Spend / Conversions',
    unit: 'currency',
    requires: ['spend', 'conversions'],
    resolve: (campaign, insights) => {
      const spend = parseFloat(insights?.spend || campaign.spend || 0);
      const conv = parseInt(insights?.conversions || campaign.conversions || 0);
      return conv > 0 ? parseFloat((spend / conv).toFixed(2)) : 0;
    },
  },
  ocpc: {
    id: 'ocpc',
    name: 'oCPC (Optimized CPC)',
    category: 'cost',
    description: 'Cost per optimized conversion event',
    unit: 'currency',
    // No `requires`: insights-only like `reach` — never a campaigns column.
    resolve: (campaign, insights) => parseFloat(insights?.ocpc || campaign.ocpc || 0),
  },

  // Efficiency
  roas: {
    id: 'roas',
    name: 'ROAS',
    category: 'efficiency',
    description: 'Revenue / Spend',
    unit: 'x',
    requires: ['spend', 'revenue'],
    resolve: (campaign, insights) => {
      const spend = parseFloat(insights?.spend || campaign.spend || 0);
      const revenue = parseFloat(insights?.revenue || campaign.revenue || 0);
      return spend > 0 ? parseFloat((revenue / spend).toFixed(2)) : 0;
    },
  },
  roi: {
    id: 'roi',
    name: 'ROI',
    category: 'efficiency',
    description: '(Revenue - Spend) / Spend * 100',
    unit: '%',
    requires: ['spend', 'revenue'],
    resolve: (campaign, insights) => {
      const spend = parseFloat(insights?.spend || campaign.spend || 0);
      const revenue = parseFloat(insights?.revenue || campaign.revenue || 0);
      return spend > 0 ? parseFloat((((revenue - spend) / spend) * 100).toFixed(2)) : 0;
    },
  },
};

export default METRICS;
