/**
 * Social Bridge — Connects 1ai-ads with 1ai-social for Fanpage posting
 *
 * When IKLAN_WORKFLOW Step 3 (post video) needs to post content,
 * this bridge sends requests to 1ai-social's Fanpage endpoint.
 *
 * 1ai-social API: POST /api/webhooks/fanpage-post
 *   Body: { profile_id, page_id, message, image_url }
 *   Auth: x-api-key header
 *
 * SOLID: Single Responsibility — only cross-project social communication.
 */

import { createLogger } from '../lib/logger.js';

const log = createLogger('social-bridge');

export class SocialBridge {
  constructor(socialServiceUrl = 'http://localhost:8200', apiKey = '') {
    this.baseUrl = socialServiceUrl;
    this.apiKey = apiKey;
  }

  _headers() {
    const h = { 'Content-Type': 'application/json' };
    if (this.apiKey) h['x-api-key'] = this.apiKey;
    return h;
  }

  /**
   * Post content to a Facebook Fanpage via GoLogin.
   * @param {object} params
   * @param {string} params.profileId - GoLogin profile ID
   * @param {string} params.pageId - Facebook page ID
   * @param {string} params.message - Post caption
   * @param {string} params.imageUrl - Optional image URL
   * @returns {object} { status, postId }
   */
  async postToFanpage({ profileId, pageId, message, imageUrl }) {
    log.info('Posting to Fanpage', { profileId, pageId });

    try {
      const res = await fetch(`${this.baseUrl}/api/webhooks/fanpage-post`, {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify({
          profile_id: profileId,
          page_id: pageId,
          message,
          image_url: imageUrl,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Social service returned ${res.status}: ${body}`);
      }

      const data = await res.json();
      log.info('Fanpage post queued', { status: data.status });
      return data;
    } catch (err) {
      log.error('Fanpage post failed', { error: err.message });
      throw err;
    }
  }

  /**
   * Check social service health.
   * @returns {object} Health status
   */
  async healthCheck() {
    try {
      const res = await fetch(`${this.baseUrl}/health`);
      return await res.json();
    } catch (err) {
      log.error('Social service health check failed', { error: err.message });
      return { status: 'unreachable', error: err.message };
    }
  }
}
