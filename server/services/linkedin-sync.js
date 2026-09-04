/**
 * LinkedIn Sync Service — syncs LinkedIn data to AdForge schema.
 */
import { createLogger } from '../lib/logger.js';

const log = createLogger('linkedin-sync');

function mapCampaignStatus(linkedinStatus) {
  const statusMap = {
    'ACTIVE': 'active',
    'PAUSED': 'paused',
    'DRAFT': 'draft',
    'ARCHIVED': 'removed',
    'CANCELED': 'removed',
  };
  return statusMap[linkedinStatus] || linkedinStatus?.toLowerCase() || 'unknown';
}

export async function syncLinkedInCampaigns(client, accountId, userId, campaignsRepo) {
  try {
    log.info('Starting LinkedIn campaign sync', { accountId, userId });
    
    const campaigns = await client.getCampaigns(accountId);
    let synced = 0;
    let errors = 0;
    
    for (const campaign of campaigns) {
      try {
        campaignsRepo.upsert({
          userId,
          platform: 'linkedin',
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
        log.error('Failed to sync LinkedIn campaign', { error: err.message, campaignId: campaign.id });
        errors++;
      }
    }
    
    log.info('LinkedIn campaign sync complete', { accountId, userId, synced, errors });
    
    return {
      platform: 'linkedin',
      accountId,
      synced,
      errors,
      total: campaigns.length,
    };
  } catch (err) {
    log.error('LinkedIn sync failed', { error: err.message, accountId, userId });
    throw err;
  }
}

export async function createLinkedInSync(client, userId, campaignsRepo) {
  try {
    const accounts = await client.getAdAccounts();
    const results = [];
    
    for (const account of accounts) {
      const campaignResult = await syncLinkedInCampaigns(client, account.id, userId, campaignsRepo);
      results.push({ account, campaigns: campaignResult });
    }
    
    return {
      platform: 'linkedin',
      accounts: accounts.length,
      results,
    };
  } catch (err) {
    log.error('LinkedIn full sync failed', { error: err.message, userId });
    throw err;
  }
}

export default { syncLinkedInCampaigns, createLinkedInSync };