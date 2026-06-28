import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { WebhookHandler } from '../../../server/services/webhook-handler.js';
import crypto from 'crypto';

describe('WebhookHandler', () => {
  let handler;

  beforeEach(() => {
    handler = new WebhookHandler();
  });

  it('should create instance with empty subscriptions', () => {
    expect(handler.subscriptions).toBeInstanceOf(Map);
    expect(handler.subscriptions.size).toBe(0);
  });

  describe('verifySignature', () => {
    it('should return true for valid signature', () => {
      const secret = 'my_secret';
      const payload = '{"event":"test"}';
      const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');

      const result = handler.verifySignature(secret, payload, `sha256=${sig}`);
      expect(result).toBe(true);
    });

    it('should return false for invalid signature', () => {
      const result = handler.verifySignature('secret', '{"test":1}', 'sha256=invalid');
      expect(result).toBe(false);
    });

    it('should return false when secret is missing', () => {
      expect(handler.verifySignature(null, '{}', 'sha256=abc')).toBe(false);
      expect(handler.verifySignature('', '{}', 'sha256=abc')).toBe(false);
    });

    it('should return false when signature is missing', () => {
      expect(handler.verifySignature('secret', '{}', '')).toBe(false);
      expect(handler.verifySignature('secret', '{}', null)).toBe(false);
    });
  });

  describe('handleVerification', () => {
    it('should return true for valid subscribe verification', () => {
      const result = handler.handleVerification('subscribe', 'verify_token_123', 'verify_token_123');
      expect(result).toBe(true);
    });

    it('should return false when mode is not subscribe', () => {
      const result = handler.handleVerification('other', 'token', 'token');
      expect(result).toBe(false);
    });

    it('should return false when token does not match', () => {
      const result = handler.handleVerification('subscribe', 'wrong_token', 'correct_token');
      expect(result).toBe(false);
    });
  });

  describe('processEvent', () => {
    it('should return empty array for null body', () => {
      expect(handler.processEvent(null)).toEqual([]);
    });

    it('should return empty array for body without entry', () => {
      expect(handler.processEvent({})).toEqual([]);
    });

    it('should extract events from entries and changes', () => {
      const body = {
        entry: [
          {
            id: 'entry_1',
            time: 1000,
            changes: [
              { field: 'campaigns', value: { id: 'c1', status: 'PAUSED' } },
              { field: 'ads', value: { id: 'a1', status: 'ACTIVE' } },
            ],
          },
        ],
      };

      const events = handler.processEvent(body);
      expect(events).toHaveLength(2);
      expect(events[0]).toEqual({
        field: 'campaigns',
        value: { id: 'c1', status: 'PAUSED' },
        entryId: 'entry_1',
        time: 1000,
      });
    });

    it('should handle entries without changes', () => {
      const body = {
        entry: [{ id: 'e1', time: 100 }],
      };

      const events = handler.processEvent(body);
      expect(events).toEqual([]);
    });

    it('should handle multiple entries', () => {
      const body = {
        entry: [
          { id: 'e1', time: 1, changes: [{ field: 'f1', value: 'v1' }] },
          { id: 'e2', time: 2, changes: [{ field: 'f2', value: 'v2' }] },
        ],
      };

      const events = handler.processEvent(body);
      expect(events).toHaveLength(2);
      expect(events[0].entryId).toBe('e1');
      expect(events[1].entryId).toBe('e2');
    });
  });
});
