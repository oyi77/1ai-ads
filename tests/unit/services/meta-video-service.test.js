import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock config to prevent real env leakage
vi.mock('../../../server/config/index.js', () => ({
  default: {
    metaApiVersion: 'v22.0',
    fbSystemToken: '',
  },
}));

// Mock axios
vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
  },
}));

import { MetaVideoService } from '../../../server/services/meta-video-service.js';
import axios from 'axios';

describe('MetaVideoService', () => {
  const mockMetaApi = {
    _getToken: vi.fn(() => 'test-token'),
  };

  let service;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MetaVideoService(mockMetaApi);
  });

  describe('constructor', () => {
    it('should create instance with metaApi', () => {
      expect(service).toBeInstanceOf(MetaVideoService);
      expect(service.metaApi).toBe(mockMetaApi);
    });
  });

  describe('uploadVideo', () => {
    it('should fail if pageId missing', async () => {
      const result = await service.uploadVideo({ pageId: '', videoData: Buffer.from('test') });
      expect(result.success).toBe(false);
      expect(result.error).toBe('pageId is required');
    });

    it('should fail if token not configured', async () => {
      const noTokenService = new MetaVideoService({ _getToken: vi.fn(() => null) });
      const result = await noTokenService.uploadVideo({
        pageId: '123', videoData: Buffer.from('test'),
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Meta access token not configured');
    });

    it('should fail if videoData is invalid type', async () => {
      const result = await service.uploadVideo({
        pageId: '123', videoData: 'not-a-buffer-or-path',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('must be a Buffer');
    });

    it('should fail if isPath file not found', async () => {
      const result = await service.uploadVideo({
        pageId: '123', videoData: '/nonexistent/video.mp4', isPath: true,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should upload video successfully with buffer', async () => {
      axios.post.mockResolvedValue({
        data: { id: 'vid_456' },
      });

      const result = await service.uploadVideo({
        pageId: '123',
        videoData: Buffer.from('fake-video-data'),
        title: 'Test Video',
        description: 'Test desc',
      });

      expect(result.success).toBe(true);
      expect(result.videoId).toBe('vid_456');
      expect(result.permalinkUrl).toContain('facebook.com/123/videos/vid_456');
      expect(axios.post).toHaveBeenCalledTimes(1);
      // Should have called with formdata containing correct params
      const callArgs = axios.post.mock.calls[0];
      expect(callArgs[0]).toContain('/123/videos');
      expect(callArgs[1]).toBeInstanceOf(FormData);
    });

    it('should handle API error response', async () => {
      axios.post.mockRejectedValue({
        response: {
          data: { error: { message: 'Invalid token', code: 190 } },
          status: 401,
        },
      });

      const result = await service.uploadVideo({
        pageId: '123', videoData: Buffer.from('test'),
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid token');
    });

    it('should handle network error (no response)', async () => {
      axios.post.mockRejectedValue(new Error('Network timeout'));

      const result = await service.uploadVideo({
        pageId: '123', videoData: Buffer.from('test'),
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network timeout');
    });
  });

  describe('uploadVideoFromUrl', () => {
    it('should fail if pageId or videoUrl missing', async () => {
      const r1 = await service.uploadVideoFromUrl({ pageId: '', videoUrl: '' });
      expect(r1.success).toBe(false);
      expect(r1.error).toContain('pageId');

      const r2 = await service.uploadVideoFromUrl({ pageId: '123', videoUrl: '' });
      expect(r2.success).toBe(false);
    });

    it('should upload from URL successfully', async () => {
      axios.post.mockResolvedValue({
        data: { id: 'vid_url_789' },
      });

      const result = await service.uploadVideoFromUrl({
        pageId: '123',
        videoUrl: 'https://example.com/video.mp4',
        title: 'URL Video',
      });

      expect(result.success).toBe(true);
      expect(result.videoId).toBe('vid_url_789');
    });

    it('should handle error during URL upload', async () => {
      axios.post.mockRejectedValue({
        response: { data: { error: { message: 'Invalid video URL' } } },
      });

      const result = await service.uploadVideoFromUrl({
        pageId: '123', videoUrl: 'https://bad.url/video.mp4',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid video URL');
    });
  });

  describe('uploadThumbnail', () => {
    it('should fail if required params missing', async () => {
      const r1 = await service.uploadThumbnail({ pageId: '', videoId: 'v1', thumbData: Buffer.from('t') });
      expect(r1.success).toBe(false);

      const r2 = await service.uploadThumbnail({ pageId: 'p1', videoId: '', thumbData: Buffer.from('t') });
      expect(r2.success).toBe(false);

      const r3 = await service.uploadThumbnail({ pageId: 'p1', videoId: 'v1', thumbData: null });
      expect(r3.success).toBe(false);
    });

    it('should upload thumbnail successfully', async () => {
      axios.post.mockResolvedValue({ data: { success: true } });

      const result = await service.uploadThumbnail({
        pageId: '123',
        videoId: 'vid_456',
        thumbData: Buffer.from('fake-thumb'),
      });

      expect(result.success).toBe(true);
    });

    it('should handle thumbnail upload error', async () => {
      axios.post.mockRejectedValue({
        response: { data: { error: { message: 'Video not found' } } },
      });

      const result = await service.uploadThumbnail({
        pageId: '123',
        videoId: 'bad_vid',
        thumbData: Buffer.from('fake-thumb'),
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Video not found');
    });
  });

  describe('_resolveToken', () => {
    it('should return token from metaApi', () => {
      const token = service._resolveToken();
      expect(token).toBe('test-token');
    });

    it('should fall back to null if no token available', () => {
      const noTokenService = new MetaVideoService({ _getToken: vi.fn(() => { throw new Error('no token'); }) });
      expect(noTokenService._resolveToken()).toBeNull();
    });
  });
});
