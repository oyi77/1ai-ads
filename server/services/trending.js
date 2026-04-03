/**
 * Trending Data Service
 * 
 * Provides internal trending metrics (campaign performance) and external market trends (mock data).
 * Used for the Trending Ads dashboard feature.
 */

export class TrendingService {
  constructor(campaignsRepo) {
    this.campaignsRepo = campaignsRepo;
  }

  /**
   * Get internal trending data - top campaigns by ROAS growth or CTR over last 7 days
   * @returns {Promise<Array>} Array of top performing campaigns
   */
  async getInternalTrends() {
    const { data: campaigns } = this.campaignsRepo.findAll();
    
    if (!campaigns || campaigns.length === 0) {
      return [];
    }

    // Sort by ROAS (descending) and take top 5
    const topByRoas = campaigns
      .filter(c => c.roas !== null && c.roas > 0)
      .sort((a, b) => (b.roas || 0) - (a.roas || 0))
      .slice(0, 5)
      .map(c => ({
        id: c.id,
        name: c.name,
        platform: c.platform,
        status: c.status,
        roas: c.roas,
        spend: c.spend,
        revenue: c.revenue,
        impressions: c.impressions,
        clicks: c.clicks,
        conversions: c.conversions,
        ctr: c.impressions > 0 ? ((c.clicks / c.impressions) * 100).toFixed(2) : 0,
        trend: 'up', // Mock trend indicator
      }));

    return topByRoas;
  }

  /**
   * Get external trending data - mock market themes
   * @returns {Promise<Array>} Array of market trend themes
   */
  async getExternalTrends() {
    // Mock external market trends for MVP
    // In production, this would integrate with a paid API
    return [
      {
        id: 'trend-1',
        theme: 'Minimalist Skincare',
        category: 'Beauty',
        growth: '+42%',
        platforms: ['Meta', 'TikTok'],
        ads_example: 'Clean beauty, fewer ingredients, maximum results',
        popularity: 89,
      },
      {
        id: 'trend-2',
        theme: 'High-Ticket Coaching',
        category: 'Education',
        growth: '+67%',
        platforms: ['LinkedIn', 'Google'],
        ads_example: 'Premium coaching programs for career advancement',
        popularity: 76,
      },
      {
        id: 'trend-3',
        theme: 'Sustainable Home Goods',
        category: 'E-commerce',
        growth: '+35%',
        platforms: ['Meta', 'Instagram'],
        ads_example: 'Eco-friendly alternatives for everyday items',
        popularity: 82,
      },
      {
        id: 'trend-4',
        theme: 'AI Productivity Tools',
        category: 'SaaS',
        growth: '+156%',
        platforms: ['Google', 'LinkedIn', 'TikTok'],
        ads_example: 'Automate your workflow with AI-powered solutions',
        popularity: 94,
      },
      {
        id: 'trend-5',
        theme: 'Pet Wellness & Nutrition',
        category: 'Pet Care',
        growth: '+28%',
        platforms: ['Meta', 'TikTok'],
        ads_example: 'Premium pet food and supplements for healthy pets',
        popularity: 71,
      },
      {
        id: 'trend-6',
        theme: 'Remote Work Essentials',
        category: 'Office',
        growth: '+18%',
        platforms: ['Google', 'Amazon'],
        ads_example: 'Home office setup essentials for remote workers',
        popularity: 65,
      },
    ];
  }
}