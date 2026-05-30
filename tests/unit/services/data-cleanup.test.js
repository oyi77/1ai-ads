import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DataCleanup } from '../../../server/services/data-cleanup.js';

describe('DataCleanup', () => {
  let cleanup;
  let mockDb;

  beforeEach(() => {
    mockDb = {
      prepare: vi.fn().mockReturnValue({
        run: vi.fn().mockReturnValue({ changes: 5 }),
      }),
    };
    cleanup = new DataCleanup(mockDb);
  });

  describe('run', () => {
    it('should clean webhook events', () => {
      cleanup.run();
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM webhook_events')
      );
    });

    it('should clean schedules', () => {
      cleanup.run();
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM schedules')
      );
    });

    it('should clean refresh tokens', () => {
      cleanup.run();
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM refresh_tokens')
      );
    });

    it('should return cleanup results', () => {
      const results = cleanup.run();
      expect(results).toBeDefined();
    });

    it('should handle database errors gracefully', () => {
      mockDb.prepare.mockImplementation(() => {
        throw new Error('DB error');
      });
      expect(() => cleanup.run()).not.toThrow();
    });
  });

  describe('start/stop', () => {
    it('should start and stop interval', () => {
      vi.useFakeTimers();
      cleanup.start(1000);
      expect(cleanup._interval).not.toBeNull();
      cleanup.stop();
      expect(cleanup._interval).toBeNull();
      vi.useRealTimers();
    });
  });
});
