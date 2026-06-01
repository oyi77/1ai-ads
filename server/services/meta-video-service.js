/**
 * Meta Video Upload Service
 *
 * Port of content-generator/scripts/platforms/facebook.py to Node.js
 * Handles Facebook Page video uploads via Graph API multipart/form-data
 *
 * Dependencies: axios (already in package.json)
 * Integrates with: meta-api.js for token/account management
 */

import axios from 'axios';
import { createLogger } from '../lib/logger.js';
import config from '../config/index.js';
import { PlatformError } from '../lib/errors.js';

const log = createLogger('meta-video');
const BASE = `https://graph.facebook.com/${config.metaApiVersion}`;

export class MetaVideoService {
  /**
   * @param {import('./meta-api.js').MetaAdsAPI} metaApi - Existing Meta API client for token management
   */
  constructor(metaApi) {
    this.metaApi = metaApi;
  }

  /**
   * Upload a video to a Facebook Page
   *
   * @param {object} options
   * @param {string} options.pageId - Facebook Page ID
   * @param {Buffer|string} options.videoData - Video file buffer or path to video file
   * @param {boolean} [options.isPath] - If true, videoData is a file path (reads it)
   * @param {string} [options.title] - Video title
   * @param {string} [options.description] - Video description
   * @param {boolean} [options.published=true] - Whether to publish immediately
   * @param {Buffer} [options.thumbData] - Optional thumbnail image buffer
   * @param {string} [options.accessToken] - Override access token (falls back to metaApi)
   * @returns {Promise<{success: boolean, videoId: string|null, permalinkUrl?: string, error?: string}>}
   */
  async uploadVideo({ pageId, videoData, isPath = false, title = '', description = '', published = true, thumbData, accessToken }) {
    if (!pageId) {
      return { success: false, videoId: null, error: 'pageId is required' };
    }

    // Resolve token
    const token = accessToken || this._resolveToken();
    if (!token) {
      return { success: false, videoId: null, error: 'Meta access token not configured' };
    }

    // Read file if path provided
    let videoBuffer;
    if (isPath && typeof videoData === 'string') {
      const fs = await import('fs');
      if (!fs.existsSync(videoData)) {
        return { success: false, videoId: null, error: `Video file not found: ${videoData}` };
      }
      videoBuffer = fs.readFileSync(videoData);
    } else if (Buffer.isBuffer(videoData)) {
      videoBuffer = videoData;
    } else {
      return { success: false, videoId: null, error: 'videoData must be a Buffer or a file path (with isPath=true)' };
    }

    const url = `${BASE}/${pageId}/videos`;

    try {
      // Build multipart form data
      const formData = new FormData();
      const blob = new Blob([videoBuffer], { type: 'video/mp4' });
      formData.append('file', blob, 'video.mp4');
      formData.append('title', title);
      formData.append('description', description);
      formData.append('published', String(published));
      formData.append('access_token', token);

      // Optional thumbnail
      if (thumbData) {
        const thumbBlob = new Blob([thumbData], { type: 'image/jpeg' });
        formData.append('thumb', thumbBlob, 'thumb.jpg');
      }

      log.info('Uploading video to Facebook Page', { pageId, title: title || '(no title)', published });

      const response = await axios.post(url, formData, {
        headers: {
          ...formData.getHeaders?.() || {},
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 120000, // 2 minutes for video upload
      });

      const result = response.data;

      if (result.id) {
        log.info('Video uploaded successfully', { videoId: result.id });
        return {
          success: true,
          videoId: result.id,
          permalinkUrl: `https://www.facebook.com/${pageId}/videos/${result.id}`,
        };
      }

      log.error('Facebook video upload failed (no id in response)', { result });
      return { success: false, videoId: null, error: 'Upload failed: no video ID returned' };
    } catch (err) {
      const errorMsg = err.response?.data?.error?.message || err.message;
      const errorCode = err.response?.data?.error?.code || err.response?.status || 0;
      log.error('Facebook video upload error', { code: errorCode, message: errorMsg });
      return { success: false, videoId: null, error: `[${errorCode}] ${errorMsg}` };
    }
  }

  /**
   * Upload video from a URL (Facebook will fetch it)
   *
   * @param {object} options
   * @param {string} options.pageId - Facebook Page ID
   * @param {string} options.videoUrl - Publicly accessible video URL
   * @param {string} [options.title] - Video title
   * @param {string} [options.description] - Video description
   * @param {boolean} [options.published=true] - Whether to publish immediately
   * @param {string} [options.accessToken] - Override access token
   * @returns {Promise<{success: boolean, videoId: string|null, permalinkUrl?: string, error?: string}>}
   */
  async uploadVideoFromUrl({ pageId, videoUrl, title = '', description = '', published = true, accessToken }) {
    if (!pageId || !videoUrl) {
      return { success: false, videoId: null, error: 'pageId and videoUrl are required' };
    }

    const token = accessToken || this._resolveToken();
    if (!token) {
      return { success: false, videoId: null, error: 'Meta access token not configured' };
    }

    const url = `${BASE}/${pageId}/videos`;

    try {
      const response = await axios.post(url, null, {
        params: {
          file_url: videoUrl,
          title,
          description,
          published,
          access_token: token,
        },
        timeout: 60000,
      });

      const result = response.data;

      if (result.id) {
        log.info('Video uploaded from URL successfully', { videoId: result.id });
        return {
          success: true,
          videoId: result.id,
          permalinkUrl: `https://www.facebook.com/${pageId}/videos/${result.id}`,
        };
      }

      return { success: false, videoId: null, error: 'Upload failed: no video ID returned' };
    } catch (err) {
      const errorMsg = err.response?.data?.error?.message || err.message;
      log.error('Facebook video upload from URL error', { message: errorMsg });
      return { success: false, videoId: null, error: errorMsg };
    }
  }

  /**
   * Upload a thumbnail for an existing video
   *
   * @param {object} options
   * @param {string} options.pageId - Facebook Page ID
   * @param {string} options.videoId - Existing video ID
   * @param {Buffer} options.thumbData - Thumbnail image buffer
   * @param {string} [options.accessToken] - Override access token
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async uploadThumbnail({ pageId, videoId, thumbData, accessToken }) {
    if (!pageId || !videoId || !thumbData) {
      return { success: false, error: 'pageId, videoId, and thumbData are required' };
    }

    const token = accessToken || this._resolveToken();
    if (!token) {
      return { success: false, error: 'Meta access token not configured' };
    }

    const url = `${BASE}/${videoId}`;

    try {
      const formData = new FormData();
      const blob = new Blob([thumbData], { type: 'image/jpeg' });
      formData.append('thumb', blob, 'thumb.jpg');
      formData.append('access_token', token);

      await axios.post(url, formData, {
        headers: formData.getHeaders?.() || {},
        timeout: 30000,
      });

      log.info('Thumbnail uploaded successfully', { videoId });
      return { success: true };
    } catch (err) {
      const errorMsg = err.response?.data?.error?.message || err.message;
      log.error('Thumbnail upload error', { videoId, message: errorMsg });
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Resolve access token from the metaApi instance
   */
  _resolveToken() {
    try {
      // Try to get via metaApi's internal token resolution
      if (this.metaApi) {
        // metaApi._getToken() might throw if not configured
        return this.metaApi._getToken();
      }
    } catch (err) {
      log.debug('Token fallback triggered', { error: err.message });
    }

    // Fallback to config
    if (config.fbSystemToken) {
      return config.fbSystemToken;
    }

    return null;
  }
}
