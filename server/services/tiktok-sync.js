import { createLogger } from '../lib/logger.js';

const log = createLogger('tiktok-sync');

function mapCampaignStatus(tiktokStatus) {
  const statusMap = {
    'ENABLE': 'active',
    'DISABLE': 'paused',
    'DELETE': 'removed',
  };
  return statusMap[tiktokStatus] || tiktokStatus?.toLowerCase() || 'unknown';
}

export async function syncTikTokCampaigns(client, advertiserId, userId, campaignsRepo) {
  try {
    log.info('Starting TikTok campaign sync', { advertiserId, userId });
    
    const campaigns = await client.getCampaigns(advertiserId);
    let synced = 0;
    let errors = 0;
    
    for (const campaign of campaigns) {
      try {
        campaignsRepo.upsert({
          userId,
          platform: 'tiktok',
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
        log.error('Failed to sync TikTok campaign', { error: err.message, campaignId: campaign.id });
        errors++;
      }
    }
    
    log.info('TikTok campaign sync complete', { advertiserId, userId, synced, errors });
    
    return { platform: 'tiktok', advertiserId, synced, errors, total: campaigns.length };
  } catch (err) {
    log.error('TikTok sync failed', { error: err.message });
    throw err;
  }
}

export async function createTikTokSync(client, userId, campaignsRepo) {
  try {
    const accounts = await client.getAdAccounts();
    const results = [];
    
    for (const account of accounts) {
      const campaignResult = await syncTikTokCampaigns(client, account.id, userId, campaignsRepo);
      results.push({ account, campaigns: campaignResult });
    }
    
    return { platform: 'tiktok', accounts: accounts.length, results };
  } catch (err) {
    log.error('TikTok full sync failed', { error: err.message });
    throw err;
  }
}
