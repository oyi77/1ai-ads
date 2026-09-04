/**
 * Google Ads Sync Service — syncs Google Ads data to AdForge schema.
 */
import { createLogger } from '../lib/logger.js';

const log = createLogger('google-ads-sync');

/**
 * Map Google Ads campaign status to AdForge status.
 */
function mapCampaignStatus(googleStatus) {
  const statusMap = {
    'ENABLED': 'active',
    'PAUSED': 'paused',
    'REMOVED': 'removed',
  };
  return statusMap[googleStatus] || googleStatus?.toLowerCase() || 'unknown';
}

/**
 * Sync Google Ads campaigns to AdForge campaigns table.
 * @param {GoogleAdsAPI} client - Google Ads API client
 * @param {string} customerId - Google Ads customer ID
 * @param {string} userId - AdForge user ID
 * @param {object} campaignsRepo - Campaigns repository
 * @returns {Promise<object>} - Sync result
 */
export async function syncGoogleAdsCampaigns(client, customerId, userId, campaignsRepo) {
  try {
    log.info('Starting Google Ads campaign sync', { customerId, userId });
    
    const campaigns = await client.getCampaigns(customerId, { limit: 1000 });
    let synced = 0;
    let errors = 0;
    
    for (const campaign of campaigns) {
      try {
        campaignsRepo.upsert({
          userId,
          platform: 'google',
          campaignId: campaign.id,
          name: campaign.name,
          status: mapCampaignStatus(campaign.status),
          budget: campaign.budget,
          spend: campaign.cost,
          impressions: campaign.impressions,
          clicks: campaign.clicks,
          conversions: campaign.conversions,
          roas: campaign.cost > 0 && campaign.conversions > 0 ? (campaign.conversions * 100) / campaign.cost : 0,
          channelType: campaign.channelType,
          startDate: campaign.startDate,
          endDate: campaign.endDate,
        });
        synced++;
      } catch (err) {
        log.error('Failed to sync Google Ads campaign', { error: err.message, campaignId: campaign.id });
        errors++;
      }
    }
    
    log.info('Google Ads campaign sync complete', { customerId, userId, synced, errors });
    
    return {
      platform: 'google',
      customerId,
      synced,
      errors,
      total: campaigns.length,
    };
  } catch (err) {
    log.error('Google Ads sync failed', { error: err.message, customerId, userId });
    throw err;
  }
}

/**
 * Sync Google Ads insights to AdForge campaigns table.
 * @param {GoogleAdsAPI} client - Google Ads API client
 * @param {string} customerId - Google Ads customer ID
 * @param {Array<string>} campaignIds - Array of campaign IDs
 * @param {string} userId - AdForge user ID
 * @param {object} campaignsRepo - Campaigns repository
 * @param {object} options - Query options
 * @returns {Promise<object>} - Sync result
 */
export async function syncGoogleAdsInsights(client, customerId, campaignIds, userId, campaignsRepo, { datePreset = 'last_30d' } = {}) {
  try {
    log.info('Starting Google Ads insights sync', { customerId, userId, campaignCount: campaignIds.length });
    
    const insights = await client.getMultiCampaignInsights(customerId, campaignIds, { datePreset });
    let synced = 0;
    let errors = 0;
    
    for (const [campaignId, insight] of Object.entries(insights)) {
      try {
        campaignsRepo.upsert({
          userId,
          platform: 'google',
          campaignId,
          name: insight.campaignName,
          impressions: insight.impressions,
          clicks: insight.clicks,
          spend: insight.cost,
          conversions: insight.conversions,
          roas: insight.cost > 0 && insight.conversions > 0 ? (insight.conversions * 100) / insight.cost : 0,
        });
        synced++;
      } catch (err) {
        log.error('Failed to sync Google Ads insights', { error: err.message, campaignId });
        errors++;
      }
    }
    
    log.info('Google Ads insights sync complete', { customerId, userId, synced, errors });
    
    return {
      platform: 'google',
      customerId,
      synced,
      errors,
      total: Object.keys(insights).length,
    };
  } catch (err) {
    log.error('Google Ads insights sync failed', { error: err.message, customerId, userId });
    throw err;
  }
}

/**
 * Full sync: accounts + campaigns + insights.
 * @param {GoogleAdsAPI} client - Google Ads API client
 * @param {string} userId - AdForge user ID
 * @param {object} campaignsRepo - Campaigns repository
 * @returns {Promise<object>} - Full sync result
 */
export async function fullGoogleAdsSync(client, userId, campaignsRepo) {
  try {
    log.info('Starting full Google Ads sync', { userId });
    
    const accounts = await client.getAdAccounts();
    const results = [];
    
    for (const account of accounts) {
      // Sync campaigns
      const campaignResult = await syncGoogleAdsCampaigns(client, account.id, userId, campaignsRepo);
      
      // Sync insights for all campaigns
      const campaignIds = (await client.getCampaigns(account.id, { limit: 1000 })).map(c => c.id);
      let insightResult = null;
      if (campaignIds.length > 0) {
        insightResult = await syncGoogleAdsInsights(client, account.id, campaignIds, userId, campaignsRepo);
      }
      
      results.push({
        account,
        campaigns: campaignResult,
        insights: insightResult,
      });
    }
    
    log.info('Full Google Ads sync complete', { userId, accounts: accounts.length });
    
    return {
      platform: 'google',
      accounts: accounts.length,
      results,
    };
  } catch (err) {
    log.error('Full Google Ads sync failed', { error: err.message, userId });
    throw err;
  }
}
