/**
 * Pinterest Sync Service — syncs Pinterest data to AdForge schema.
 */
import { createLogger } from '../lib/logger.js';

const log = createLogger('pinterest-sync');

function mapCampaignStatus(pinterestStatus) {
  const statusMap = {
    'ACTIVE': 'active',
    'PAUSED': 'paused',
    'DELETED': 'removed',
  };
  return statusMap[pinterestStatus] || pinterestStatus?.toLowerCase() || 'unknown';
}

export async function syncPinterestCampaigns(client, adAccountId, userId, campaignsRepo) {
  try {
    log.info('Starting Pinterest campaign sync', { adAccountId, userId });
    
    const campaigns = await client.getCampaigns(adAccountId);
    let synced = 0;
    let errors = 0;
    
    for (const campaign of campaigns) {
      try {
        campaignsRepo.upsert({
          userId,
          platform: 'pinterest',
          campaignId: campaign.id,
          name: campaign.name,
          status: mapCampaignStatus(campaign.status),
          budget: campaign.budget,
          spend: campaign.spend || 0,
          impressions: campaign.impressions || 0,
          clicks: campaign.clicks || 0,
          conversions: campaign.conversions || 0,
        });
        synced++;
      } catch (err) {
        log.error('Failed to sync Pinterest campaign', { error: err.message, campaignId: campaign.id });
        errors++;
      }
    }
    
    log.info('Pinterest campaign sync complete', { adAccountId, userId, synced, errors });
    
    return {
      platform: 'pinterest',
      adAccountId,
      synced,
      errors,
      total: campaigns.length,
    };
  } catch (err) {
    log.error('Pinterest sync failed', { error: err.message, adAccountId, userId });
    throw err;
  }
}