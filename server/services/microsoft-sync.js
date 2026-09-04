/**
 * Microsoft Ads Sync Service — syncs Microsoft Ads data to AdForge schema.
 * Note: Microsoft Ads uses SOAP API, this is a scaffold.
 */
import { createLogger } from '../lib/logger.js';

const log = createLogger('microsoft-sync');

function mapCampaignStatus(msStatus) {
  const statusMap = {
    'Active': 'active',
    'Paused': 'paused',
    'Deleted': 'removed',
    'Expired': 'removed',
  };
  return statusMap[msStatus] || msStatus?.toLowerCase() || 'unknown';
}

export async function syncMicrosoftCampaigns(client, accountId, userId, campaignsRepo) {
  try {
    log.info('Starting Microsoft Ads campaign sync', { accountId, userId });
    
    const campaigns = await client.getCampaigns(accountId);
    let synced = 0;
    let errors = 0;
    
    for (const campaign of campaigns) {
      try {
        campaignsRepo.upsert({
          userId,
          platform: 'microsoft',
          campaignId: campaign.id,
          name: campaign.name,
          status: mapCampaignStatus(campaign.status),
          budget: campaign.budget || 0,
          spend: campaign.spend || 0,
          impressions: campaign.impressions || 0,
          clicks: campaign.clicks || 0,
          conversions: campaign.conversions || 0,
        });
        synced++;
      } catch (err) {
        log.error('Failed to sync Microsoft campaign', { error: err.message, campaignId: campaign.id });
        errors++;
      }
    }
    
    log.info('Microsoft Ads campaign sync complete', { accountId, userId, synced, errors });
    
    return {
      platform: 'microsoft',
      accountId,
      synced,
      errors,
      total: campaigns.length,
    };
  } catch (err) {
    log.error('Microsoft Ads sync failed', { error: err.message, accountId, userId });
    throw err;
  }
}

export async function createMicrosoftSync(client, userId, campaignsRepo) {
  try {
    const accounts = await client.getAdAccounts();
    const results = [];
    
    for (const account of accounts) {
      const campaignResult = await syncMicrosoftCampaigns(client, account.id, userId, campaignsRepo);
      results.push({ account, campaigns: campaignResult });
    }
    
    return {
      platform: 'microsoft',
      accounts: accounts.length,
      results,
    };
  } catch (err) {
    log.error('Microsoft Ads sync failed', { error: err.message, userId });
    throw err;
  }
}

export default { syncMicrosoftCampaigns, createMicrosoftSync };