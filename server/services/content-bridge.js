/**
 * Content Bridge — Connects 1ai-ads with 1ai-content for video generation
 *
 * When IKLAN_WORKFLOW Step 1 (research) finds a product, this bridge
 * requests video generation from 1ai-content's REST API.
 *
 * 1ai-content API: POST /api/content/video/create
 *   Body: { niche, duration, customPrompt, platform, enableVO, enableSubtitles, language }
 *   Auth: Bearer JWT or x-api-key header
 *
 * SOLID: Single Responsibility — only cross-project communication.
 */

import { createLogger } from '../lib/logger.js';

const log = createLogger('content-bridge');

export class ContentBridge {
  constructor(contentServiceUrl = 'http://localhost:3000', apiKey = '') {
    this.baseUrl = contentServiceUrl;
    this.apiKey = apiKey;
  }

  _headers() {
    const h = { 'Content-Type': 'application/json' };
    if (this.apiKey) h['x-api-key'] = this.apiKey;
    return h;
  }

  /**
   * Request video generation for an ad product.
   * @param {object} params
   * @param {string} params.niche - Product niche (fashion, fb, tech, health, travel, etc.)
   * @param {number} params.duration - Target duration in seconds (5-60)
   * @param {string} params.customPrompt - Custom prompt for video generation
   * @param {string} params.platform - Target platform (tiktok, instagram, facebook)
   * @returns {object} { jobId, status }
   */
  async requestVideoGeneration({ niche, duration = 15, customPrompt, platform = 'facebook' }) {
    log.info('Requesting video generation', { niche, duration, platform });

    try {
      const res = await fetch(`${this.baseUrl}/api/content/video/create`, {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify({
          niche,
          duration,
          customPrompt,
          platform,
          enableVO: true,
          enableSubtitles: true,
          language: 'id',
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Content service returned ${res.status}: ${body}`);
      }

      const data = await res.json();
      log.info('Video generation queued', { jobId: data.jobId });
      return { jobId: data.jobId, status: data.status || 'processing' };
    } catch (err) {
      log.error('Video generation request failed', { error: err.message });
      throw err;
    }
  }

  /**
   * List videos for the authenticated user.
   * @returns {object[]} List of videos
   */
  async listVideos() {
    try {
      const res = await fetch(`${this.baseUrl}/api/content/videos`, {
        headers: this._headers(),
      });
      if (!res.ok) throw new Error(`Content service returned ${res.status}`);
      const data = await res.json();
      return data.videos || [];
    } catch (err) {
      log.error('Video list failed', { error: err.message });
      throw err;
    }
  }

  /**
   * Check content service health.
   * @returns {object} Health status
   */
  async healthCheck() {
    try {
      const res = await fetch(`${this.baseUrl}/api/content/health`);
      return await res.json();
    } catch (err) {
      log.error('Content service health check failed', { error: err.message });
      return { status: 'unreachable', error: err.message };
    }
  }
}
