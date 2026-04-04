import fetch from 'node-fetch';

const BK_HUB_URL = process.env.BK_HUB_URL || 'http://localhost:9099';

export class LearningService {
  constructor(campaignsRepo, adsRepo, landingRepo) {
    this.campaignsRepo = campaignsRepo;
    this.adsRepo = adsRepo;
    this.landingRepo = landingRepo;
  }

  async syncInsightToKB(insight) {
    try {
      const response = await fetch(`${BK_HUB_URL}/kb/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(insight),
        timeout: 5000,
      });

      if (!response.ok) {
        const err = await response.text();
        console.warn(`[LearningService] Failed to sync to KB: ${err}`);
        return null;
      }

      const result = await response.json();
      console.log(`[LearningService] Synced insight: ${insight.title} -> ${result.id}`);
      return result;
    } catch (err) {
      console.warn(`[LearningService] KB sync failed: ${err.message}`);
      return null;
    }
  }

  async queryKB(query, topK = 5) {
    try {
      const response = await fetch(`${BK_HUB_URL}/kb/search?q=${encodeURIComponent(query)}&top_k=${topK}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000,
      });

      if (!response.ok) return [];
      const data = await response.json();
      return data || [];
    } catch (err) {
      console.warn(`[LearningService] KB query failed: ${err.message}`);
      return [];
    }
  }

  async recordCampaignPerformance(campaign) {
    const roas = campaign.roas || 0;
    const ctr = campaign.impressions > 0 ? ((campaign.clicks / campaign.impressions) * 100).toFixed(2) : 0;
    const cpa = campaign.conversions > 0 ? (campaign.spend / campaign.conversions).toFixed(2) : 0;

    let performanceLabel = 'average';
    if (roas > 3 && ctr > 2) performanceLabel = 'excellent';
    else if (roas > 2 && ctr > 1.5) performanceLabel = 'good';
    else if (roas < 1 || ctr < 0.5) performanceLabel = 'poor';

    const insight = {
      title: `Campaign: ${campaign.name} (${performanceLabel.toUpperCase()})`,
      content: this._buildCampaignInsight(campaign, { roas, ctr, cpa, performanceLabel }),
      tags: ['campaign', campaign.platform, performanceLabel, campaign.status],
    };

    return this.syncInsightToKB(insight);
  }

  async recordAdPerformance(ad) {
    if (!ad.hook || !ad.body) return null;

    const insight = {
      title: `Ad Creative: ${ad.hook.substring(0, 50)}`,
      content: this._buildAdInsight(ad),
      tags: ['ad-creative', ad.platform || 'meta', ad.objective || 'general'],
    };

    return this.syncInsightToKB(insight);
  }

  async recordLandingPerformance(lp) {
    if (!lp.html_output && !lp.template) return null;

    const insight = {
      title: `Landing Page: ${lp.name || 'Untitled'} (${lp.theme})`,
      content: this._buildLandingInsight(lp),
      tags: ['landing-page', lp.template || 'unknown', lp.theme || 'unknown', lp.is_published ? 'published' : 'draft'],
    };

    return this.syncInsightToKB(insight);
  }

  async syncAllToKB() {
    const campaigns = this.campaignsRepo.getAll();
    const ads = this.adsRepo.getAll();
    const landingPages = this.landingRepo.getAll();

    let synced = 0;

    for (const c of campaigns) {
      if (c.spend > 0 || c.impressions > 0) {
        await this.recordCampaignPerformance(c);
        synced++;
      }
    }

    for (const a of ads) {
      if (a.hook || a.body) {
        await this.recordAdPerformance(a);
        synced++;
      }
    }

    for (const lp of landingPages) {
      if (lp.is_published || lp.html_output) {
        await this.recordLandingPerformance(lp);
        synced++;
      }
    }

    return { synced, total: campaigns.length + ads.length + landingPages.length };
  }

  async getCreativeInspiration(product, target, industry) {
    const query = `${product} ${target} ${industry} ad creative hook copy`;
    const results = await this.queryKB(query, 5);
    return results.map(r => ({
      title: r.title,
      snippet: r.snippet,
      score: r.score,
      tags: r.tags,
    }));
  }

  async getLandingInspiration(template, theme, product) {
    const query = `${template} ${theme} ${product} landing page conversion`;
    const results = await this.queryKB(query, 5);
    return results.map(r => ({
      title: r.title,
      snippet: r.snippet,
      score: r.score,
      tags: r.tags,
    }));
  }

  _buildCampaignInsight(c, metrics) {
    return `Campaign Performance Report
========================
Name: ${c.name}
Platform: ${c.platform}
Status: ${c.status}
Objective: ${c.objective || 'N/A'}

METRICS:
- Spend: Rp ${c.spend?.toLocaleString('id-ID') || 0}
- Revenue: Rp ${c.revenue?.toLocaleString('id-ID') || 0}
- ROAS: ${metrics.roas.toFixed(2)}x
- CTR: ${metrics.ctr}%
- CPA: Rp ${metrics.cpa}
- Impressions: ${c.impressions?.toLocaleString('id-ID') || 0}
- Clicks: ${c.clicks?.toLocaleString('id-ID') || 0}
- Conversions: ${c.conversions || 0}
- Performance: ${metrics.performanceLabel.toUpperCase()}

This campaign ${metrics.performanceLabel === 'excellent' ? 'performed exceptionally well and should be scaled' : metrics.performanceLabel === 'good' ? 'performed well and can be optimized further' : metrics.performanceLabel === 'poor' ? 'underperformed and needs creative or targeting changes' : 'had average performance and needs optimization'}.`;
  }

  _buildAdInsight(ad) {
    return `Ad Creative Analysis
===================
Hook: ${ad.hook || 'N/A'}
Body: ${ad.body || 'N/A'}
CTA: ${ad.cta || 'N/A'}
Platform: ${ad.platform || 'meta'}
Objective: ${ad.objective || 'general'}
Model: ${ad.model_name || ad.model || 'unknown'}

This ad creative was generated by AI and ${ad.cta ? `uses "${ad.cta}" as the call-to-action` : 'does not have a defined CTA'}.`;
  }

  _buildLandingInsight(lp) {
    return `Landing Page Configuration
========================
Name: ${lp.name || 'Untitled'}
Template: ${lp.template || 'unknown'}
Theme: ${lp.theme || 'unknown'}
Status: ${lp.is_published ? 'Published' : 'Draft'}
Slug: ${lp.slug || 'N/A'}
Product: ${lp.product_name || 'N/A'}
Price: ${lp.price || 'N/A'}
Benefits: ${lp.benefits || 'N/A'}
Pain Points: ${lp.pain_points || 'N/A'}
CTA: ${lp.cta_primary || 'N/A'}

This landing page uses the ${lp.template} template with ${lp.theme} theme and is currently ${lp.is_published ? 'live' : 'in draft'}.`;
  }
}
