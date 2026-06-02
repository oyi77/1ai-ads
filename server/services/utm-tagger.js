import { createLogger } from '../lib/logger.js';

const log = createLogger('utm-tagger');

export class UtmTaggerService {
  constructor(adUtmMapRepo) {
    this.repo = adUtmMapRepo;
  }

  tagUrl(url, adId, campaignId) {
    log.info('tagUrl', { url, adId, campaignId });
    this.repo.create({
      ad_id: adId,
      campaign_id: campaignId,
      destination_url: url,
      utm_params: {
        source: 'meta',
        medium: 'paid',
        campaign: campaignId,
        content: adId,
      },
    });
    return `${this._buildBaseUrl(adId)}?${this._buildUtmQueryString(campaignId, adId)}`;
  }

  _buildBaseUrl(adId) {
    return `https://adforge.aitradepulse.com/t/${adId}`;
  }

  _buildUtmQueryString(campaignId, adId) {
    return new URLSearchParams({
      utm_source: 'meta',
      utm_medium: 'paid',
      utm_campaign: campaignId,
      utm_content: adId,
    }).toString();
  }

  buildRedirectUrl(record) {
    const qs = new URLSearchParams({
      utm_source: record.utm_source,
      utm_medium: record.utm_medium,
      utm_campaign: record.utm_campaign,
      utm_content: record.utm_content,
    });
    const separator = record.destination_url.includes('?') ? '&' : '?';
    return `${record.destination_url}${separator}${qs.toString()}`;
  }
}
