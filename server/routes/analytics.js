import { Router } from 'express';
import db from '../../db/index.js';

const router = Router();

router.get('/dashboard', (req, res) => {
  const campaigns = db.prepare('SELECT * FROM campaigns').all();

  const total_spend = campaigns.reduce((sum, c) => sum + (c.spend || 0), 0);
  const total_revenue = total_spend * 3;
  const total_impressions = campaigns.reduce((sum, c) => sum + (c.impressions || 0), 0);
  const total_clicks = campaigns.reduce((sum, c) => sum + (c.clicks || 0), 0);
  const total_conversions = campaigns.reduce((sum, c) => sum + (c.conversions || 0), 0);

  res.json({
    success: true,
    data: {
      total_spend,
      total_revenue,
      total_impressions,
      total_clicks,
      total_conversions,
      avg_roas: total_spend > 0 ? total_revenue / total_spend : 0,
      avg_ctr: total_impressions > 0 ? (total_clicks / total_impressions) * 100 : 0,
      avg_cpc: total_clicks > 0 ? total_spend / total_clicks : 0,
      avg_cpa: total_conversions > 0 ? total_spend / total_conversions : 0
    }
  });
});

export default router;
