import { createLogger } from '../lib/logger.js';

const log = createLogger('utm-tagger');

export class UtmTaggerService {
  constructor(adUtmMapRepo) {
    this.repo = adUtmMapRepo;
  }

  tagUrl(url, adId, campaignId) {
    log.info('tagUrl', { url, adId, campaignId });
    const baseUrl = `https://adforge.aitradepulse.com/t/${adId}`;
    const utmParams = {
      source: 'meta',
      medium: 'paid',
      campaign: campaignId,
      content: adId,
    };
    this.repo.create({
      ad_id: adId,
      campaign_id: campaignId,
      destination_url: url,
      utm_params: utmParams,
    });
    const qs = new URLSearchParams({
      utm_source: utmParams.source,
      utm_medium: utmParams.medium,
      utm_campaign: utmParams.campaign,
      utm_content: utmParams.content,
    });
    return `${baseUrl}?${qs.toString()}`;
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
