import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebhookProcessor } from '../../../server/services/webhook-processor.js';
import { WebhookEventsRepository } from '../../../server/repositories/webhook-events.js';
import { createDatabase } from '../../../db/index.js';

describe('WebhookProcessor', () => {
  let processor;
  let mockWebhookEventsRepo;
  let mockCampaignsRepo;

  beforeEach(() => {
    mockWebhookEventsRepo = {
      findUnprocessed: vi.fn(),
      markProcessed: vi.fn(),
    };
    mockCampaignsRepo = {
      updateStatus: vi.fn(),
    };
    processor = new WebhookProcessor(mockWebhookEventsRepo, mockCampaignsRepo);
  });

  describe('processBatch', () => {
    it('should return 0 when no unprocessed events', async () => {
      mockWebhookEventsRepo.findUnprocessed.mockReturnValue([]);
      const result = await processor.processBatch();
      expect(result).toBe(0);
    });

    it('should process events and mark as processed', async () => {
      const events = [
        { id: '1', event_type: 'lead', payload: '{"lead_id":"l1"}' },
        { id: '2', event_type: 'campaign_status_change', payload: '{"campaign_id":"c1","status":"ACTIVE"}' },
      ];
      mockWebhookEventsRepo.findUnprocessed.mockReturnValue(events);

      const result = await processor.processBatch();

      expect(result).toBe(2);
      expect(mockWebhookEventsRepo.markProcessed).toHaveBeenCalledWith('1');
      expect(mockWebhookEventsRepo.markProcessed).toHaveBeenCalledWith('2');
    });

    it('should handle invalid JSON payload gracefully', async () => {
      const events = [
        { id: '1', event_type: 'lead', payload: 'invalid-json' },
      ];
      mockWebhookEventsRepo.findUnprocessed.mockReturnValue(events);

      const result = await processor.processBatch();

      expect(result).toBe(1);
      expect(mockWebhookEventsRepo.markProcessed).toHaveBeenCalledWith('1');
    });

    it('should continue processing if one event fails', async () => {
      const events = [
        { id: '1', event_type: 'lead', payload: '{"lead_id":"l1"}' },
        { id: '2', event_type: 'unknown', payload: '{}' },
      ];
      mockWebhookEventsRepo.findUnprocessed.mockReturnValue(events);

      const result = await processor.processBatch();

      expect(result).toBe(2);
    });
  });

  describe('processEvent', () => {
    it('should handle lead events', async () => {
      const event = { id: '1', event_type: 'lead', payload: '{"lead_id":"l1","form_id":"f1"}' };
      await processor.processEvent(event);
    });

    it('should handle campaign_status_change events', async () => {
      const event = { id: '1', event_type: 'campaign_status_change', payload: '{"campaign_id":"c1","status":"PAUSED"}' };
      await processor.processEvent(event);
    });

    it('should handle ad_review events', async () => {
      const event = { id: '1', event_type: 'ad_review_approved', payload: '{"ad_id":"a1"}' };
      await processor.processEvent(event);
    });

    it('should handle unknown event types', async () => {
      const event = { id: '1', event_type: 'unknown_type', payload: '{}' };
      await processor.processEvent(event);
    });
  });

  describe('start/stop', () => {
    it('should start and stop interval', () => {
      vi.useFakeTimers();
      processor.start(1000);
      expect(processor._interval).not.toBeNull();
      processor.stop();
      expect(processor._interval).toBeNull();
      vi.useRealTimers();
    });
  });
});

describe('WebhookProcessor DLQ (DEF-08)', () => {
  let repo, processor;

  beforeEach(() => {
    const db = createDatabase(':memory:');
    repo = new WebhookEventsRepository(db);
    processor = new WebhookProcessor(repo);
    processor.maxRetries = 2;
  });

  it('processes events and marks them processed', async () => {
    const event = { source: 'meta', eventType: 'unknown', payload: {} };
    const created = repo.create(event);
    expect(await processor.processBatch(1)).toBe(1);
    expect(repo.findById(created.id).processed).toBe(1);
  });

  it('repository supports retry and dead-letter state', () => {
    const event = repo.create({ source: 'meta', eventType: 'unknown', payload: {} });
    expect(repo.incrementRetry(event.id)).toBe(1);
    expect(repo.incrementRetry(event.id)).toBe(2);
    repo.markDeadLetter(event.id, 'failure');
    const row = repo.findById(event.id);
    expect(row.processed).toBe(2);
    expect(row.retry_counter).toBe(2);
    expect(row.failed_at).not.toBeNull();
  });
});
