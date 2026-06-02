import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ContentSchedulerQueueRepository } from '../../../server/repositories/content-scheduler-queue.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(__dirname, '../../../db/schema.sql');
const TEST_VIDEO_PATH = '/tmp/__test_video_for_scheduler.mp4';

// Ensure test video file exists before running tests
try { writeFileSync(TEST_VIDEO_PATH, Buffer.from('fake-video-data')); } catch {}

afterAll(() => {
  try { unlinkSync(TEST_VIDEO_PATH); } catch {}
});

// Mock uuid for deterministic IDs
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-queue-id-001'),
}));

import { ContentScheduler } from '../../../server/services/content-scheduler.js';

describe('ContentScheduler', () => {
  let db;
  let queueRepo;
  let videoService;
  let llmClient;
  let scheduler;

  function createTestDb() {
    const testDb = new Database(':memory:');
    const schema = readFileSync(schemaPath, 'utf-8');
    testDb.exec(schema);
    return testDb;
  }

  beforeEach(() => {
    db = createTestDb();
    queueRepo = new ContentSchedulerQueueRepository(db);
    videoService = {
      uploadVideo: vi.fn(),
    };
    llmClient = {
      call: vi.fn(),
    };
    scheduler = new ContentScheduler({ videoService, llmClient, queueRepo });
  });

  describe('constructor', () => {
    it('should create instance with dependencies', () => {
      expect(scheduler).toBeInstanceOf(ContentScheduler);
      expect(scheduler.videoService).toBe(videoService);
      expect(scheduler.llmClient).toBe(llmClient);
      expect(scheduler.queueRepo).toBe(queueRepo);
      expect(scheduler._processing).toBe(false);
    });
  });

  describe('queueContent', () => {
    it('should queue content with required fields', () => {
      const result = scheduler.queueContent({
        pageId: 'page_123',
        filePath: '/videos/test.mp4',
      });

      expect(result.success).toBe(true);
      expect(result.queueId).toBe('test-queue-id-001');

      const row = db.prepare('SELECT * FROM content_queue WHERE id = ?').get('test-queue-id-001');
      expect(row.page_id).toBe('page_123');
      expect(row.file_path).toBe('/videos/test.mp4');
      expect(row.status).toBe('pending');
      expect(row.platform).toBe('facebook');
    });

    it('should fail if pageId or filePath missing', () => {
      const r1 = scheduler.queueContent({ pageId: '', filePath: 'x' });
      expect(r1.success).toBe(false);

      const r2 = scheduler.queueContent({ pageId: 'p1', filePath: '' });
      expect(r2.success).toBe(false);
    });

    it('should store all optional fields', () => {
      scheduler.queueContent({
        pageId: 'page_123',
        filePath: '/videos/test.mp4',
        caption: 'My caption',
        hashtags: ['#test', '#viral'],
        hook: 'Attention!',
        cta: 'Click here',
        category: 'fashion',
        style: 'modern',
        productDesc: 'Cool shoes',
        scheduleAt: 9999999999,
      });

      const row = db.prepare('SELECT * FROM content_queue WHERE id = ?').get('test-queue-id-001');
      expect(row.caption).toBe('My caption');
      expect(row.hashtags).toBe('["#test","#viral"]');
      expect(row.hook).toBe('Attention!');
      expect(row.cta).toBe('Click here');
      expect(row.category).toBe('fashion');
      expect(row.style).toBe('modern');
      expect(row.product_desc).toBe('Cool shoes');
      expect(row.scheduled_at).toBe(9999999999);
    });
  });

  describe('getQueue', () => {
    it('should return empty queue initially', () => {
      const items = scheduler.getQueue();
      expect(items).toHaveLength(0);
    });

    it('should return queued items', () => {
      scheduler.queueContent({ pageId: 'p1', filePath: '/v1.mp4' });
      db.prepare(
        'INSERT INTO content_queue (id, page_id, file_path, scheduled_at, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run('id-2', 'p1', '/v2.mp4', 1000, 500);

      const items = scheduler.getQueue();
      expect(items).toHaveLength(2);
    });

    it('should filter by status', () => {
      scheduler.queueContent({ pageId: 'p1', filePath: '/v1.mp4' });
      db.prepare("UPDATE content_queue SET status = 'completed' WHERE id = 'test-queue-id-001'").run();
      db.prepare(
        "INSERT INTO content_queue (id, page_id, file_path, status, scheduled_at, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).run('id-2', 'p1', '/v2.mp4', 'pending', 1000, 500);

      const pending = scheduler.getQueue('pending');
      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe('id-2');

      const completed = scheduler.getQueue('completed');
      expect(completed).toHaveLength(1);
      expect(completed[0].id).toBe('test-queue-id-001');
    });
  });

  describe('getQueueStatus', () => {
    it('should return all zeros for empty queue', () => {
      const status = scheduler.getQueueStatus();
      expect(status).toEqual({ total: 0, pending: 0, generating: 0, uploading: 0, completed: 0, failed: 0 });
    });

    it('should count statuses correctly', () => {
      scheduler.queueContent({ pageId: 'p1', filePath: '/v1.mp4' });
      db.prepare("UPDATE content_queue SET status = 'completed' WHERE id = 'test-queue-id-001'").run();
      db.prepare(
        "INSERT INTO content_queue (id, page_id, file_path, status, scheduled_at, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).run('id-2', 'p1', '/v2.mp4', 'failed', 1000, 500);
      db.prepare(
        "INSERT INTO content_queue (id, page_id, file_path, status, scheduled_at, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).run('id-3', 'p1', '/v3.mp4', 'generating_caption', 1000, 500);

      const status = scheduler.getQueueStatus();
      expect(status.total).toBe(3);
      expect(status.completed).toBe(1);
      expect(status.failed).toBe(1);
      expect(status.generating).toBe(1);
    });
  });

  describe('cancelSchedule', () => {
    it('should cancel a pending item', () => {
      scheduler.queueContent({ pageId: 'p1', filePath: '/v1.mp4' });

      const result = scheduler.cancelSchedule('test-queue-id-001');
      expect(result.success).toBe(true);

      const row = db.prepare('SELECT * FROM content_queue WHERE id = ?').get('test-queue-id-001');
      expect(row.status).toBe('cancelled');
    });

    it('should fail if item not found', () => {
      const result = scheduler.cancelSchedule('nonexistent');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Queue item not found');
    });

    it('should fail if item not pending', () => {
      scheduler.queueContent({ pageId: 'p1', filePath: '/v1.mp4' });
      db.prepare("UPDATE content_queue SET status = 'completed' WHERE id = 'test-queue-id-001'").run();

      const result = scheduler.cancelSchedule('test-queue-id-001');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot cancel');
    });
  });

  describe('processQueue', () => {
    it('should not process if already processing', async () => {
      scheduler._processing = true;
      const results = await scheduler.processQueue();
      expect(results).toEqual([]);
    });

    it('should skip empty queue', async () => {
      const results = await scheduler.processQueue();
      expect(results).toEqual([]);
    });

    it('should process item with existing caption (no LLM call needed)', async () => {
      scheduler.queueContent({
        pageId: 'p1',
        filePath: TEST_VIDEO_PATH,
        caption: 'Already have a caption',
      });

      videoService.uploadVideo.mockResolvedValue({
        success: true,
        videoId: 'vid_001',
        permalinkUrl: 'https://facebook.com/p1/videos/vid_001',
      });

      const results = await scheduler.processQueue();

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      expect(results[0].videoId).toBe('vid_001');
      expect(llmClient.call).not.toHaveBeenCalled();

      const row = db.prepare('SELECT * FROM content_queue WHERE id = ?').get('test-queue-id-001');
      expect(row.status).toBe('completed');
      expect(row.caption).toBe('Already have a caption');
    });

    it('should process item with LLM caption generation', async () => {
      scheduler.queueContent({
        pageId: 'p1',
        filePath: TEST_VIDEO_PATH,
        category: 'fashion',
        productDesc: 'Cool shoes',
        hashtags: [],
      });

      llmClient.call.mockResolvedValue(JSON.stringify({
        caption: 'Sepatu keren banget!',
        hashtags: ['#fashion', '#shoes'],
        hook: 'Cobain sepatu ini!',
        cta: 'Klik sekarang',
      }));

      videoService.uploadVideo.mockResolvedValue({
        success: true,
        videoId: 'vid_002',
        permalinkUrl: 'https://facebook.com/p1/videos/vid_002',
      });

      const results = await scheduler.processQueue();

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      expect(llmClient.call).toHaveBeenCalledTimes(1);

      const row = db.prepare('SELECT * FROM content_queue WHERE id = ?').get('test-queue-id-001');
      expect(row.status).toBe('completed');
      expect(row.caption).toBe('Sepatu keren banget!');
      expect(row.video_id).toBe('vid_002');
    });

    it('should fall back to default caption when LLM fails', async () => {
      scheduler.queueContent({
        pageId: 'p1',
        filePath: TEST_VIDEO_PATH,
        category: 'fashion',
        productDesc: 'Cool shoes',
      });

      llmClient.call.mockRejectedValue(new Error('LLM timeout'));
      videoService.uploadVideo.mockResolvedValue({
        success: true,
        videoId: 'vid_003',
      });

      const results = await scheduler.processQueue();

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      const row = db.prepare('SELECT * FROM content_queue WHERE id = ?').get('test-queue-id-001');
      expect(row.caption).toContain('Cool shoes');
      expect(row.status).toBe('completed');
    });

    it('should mark as failed if video upload fails', async () => {
      scheduler.queueContent({
        pageId: 'p1',
        filePath: TEST_VIDEO_PATH,
        caption: 'Test caption',
      });

      videoService.uploadVideo.mockResolvedValue({
        success: false,
        error: 'Invalid token',
      });

      const results = await scheduler.processQueue();

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].error).toBe('Invalid token');

      const row = db.prepare('SELECT * FROM content_queue WHERE id = ?').get('test-queue-id-001');
      expect(row.status).toBe('failed');
      expect(row.error).toBe('Invalid token');
    });
  });

  describe('_generateCaption', () => {
    it('should parse LLM response correctly', async () => {
      llmClient.call.mockResolvedValue(JSON.stringify({
        caption: 'Test caption',
        hashtags: ['#test'],
        hook: 'Test hook',
        cta: 'Test CTA',
      }));

      const result = await scheduler._generateCaption({
        category: 'tech',
        style: 'modern',
        productDesc: 'Gadget',
        platform: 'facebook',
      });

      expect(result.caption).toBe('Test caption');
      expect(result.hashtags).toEqual(['#test']);
      expect(result.hook).toBe('Test hook');
      expect(result.cta).toBe('Test CTA');
    });

    it('should handle markdown-wrapped JSON', async () => {
      llmClient.call.mockResolvedValue('```json\n{"caption": "Markdown caption", "hashtags": []}\n```');

      const result = await scheduler._generateCaption({ platform: 'facebook' });

      expect(result.caption).toBe('Markdown caption');
    });

    it('should handle LLM failure with fallback', async () => {
      llmClient.call.mockRejectedValue(new Error('API error'));

      const result = await scheduler._generateCaption({
        productDesc: 'Keren',
        category: 'fashion',
        platform: 'facebook',
      });

      expect(result.caption).toContain('Keren');
      expect(result.hashtags.length).toBeGreaterThan(0);
    });
  });
});
