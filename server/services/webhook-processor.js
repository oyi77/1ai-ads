import { createLogger } from '../lib/logger.js';

const log = createLogger('webhook-processor');

export class WebhookProcessor {
  constructor(webhookEventsRepo, campaignsRepo) {
    this.webhookEventsRepo = webhookEventsRepo;
    this.campaignsRepo = campaignsRepo;
    this._interval = null;
  }

  start(intervalMs = 60 * 1000) {
    log.info(`WebhookProcessor started (check every ${intervalMs / 1000}s)`);
    this._interval = setInterval(() => {
      this.processBatch().catch(err =>
        log.error('Webhook batch processing failed', { error: err.message })
      );
    }, intervalMs);
  }

  stop() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }

  async processBatch(limit = 50) {
    const events = this.webhookEventsRepo.findUnprocessed(limit);
    if (events.length === 0) return 0;

    let processed = 0;
    for (const event of events) {
      try {
        await this.processEvent(event);
        this.webhookEventsRepo.markProcessed(event.id);
        processed++;
      } catch (err) {
        log.error('Webhook event processing failed', { eventId: event.id, error: err.message });
      }
    }

    if (processed > 0) {
      log.info('Webhook batch processed', { count: processed, total: events.length });
    }
    return processed;
  }

  async processEvent(event) {
    let payload;
    try {
      payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
    } catch {
      log.warn('Invalid webhook payload', { eventId: event.id });
      return;
    }

    switch (event.event_type) {
      case 'campaign_status_change':
        await this.handleCampaignStatusChange(payload);
        break;
      case 'lead':
        await this.handleLead(payload);
        break;
      case 'ad_review_approved':
      case 'ad_review_rejected':
        await this.handleAdReview(event.event_type, payload);
        break;
      default:
        break;
    }
  }

  async handleCampaignStatusChange(payload) {
    if (payload.campaign_id && payload.status) {
      log.info('Campaign status change', { campaignId: payload.campaign_id, status: payload.status });
    }
  }

  async handleLead(payload) {
    log.info('Lead received', { leadId: payload.lead_id, formId: payload.form_id });
  }

  async handleAdReview(eventType, payload) {
    log.info('Ad review event', { adId: payload.ad_id, status: eventType });
  }
}
