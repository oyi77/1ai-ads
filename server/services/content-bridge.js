/**
 * Content Bridge — Connects 1ai-ads with 1ai-content for video generation
 *
 * When IKLAN_WORKFLOW Step 1 (research) finds a product, this bridge
 * requests video generation from 1ai-content's BullMQ pipeline.
 *
 * SOLID: Single Responsibility — only cross-project communication.
 */

import { createLogger } from '../lib/logger.js';

const log = createLogger('content-bridge');

export class ContentBridge {
  constructor(contentServiceUrl = 'http://localhost:3001') {
    this.baseUrl = contentServiceUrl;
  }

  /**
   * Request video generation for an ad product.
   * @param {object} params
   * @param {string} params.productName - Product to create video for
   * @param {string} params.description - Product description
   * @param {string} params.niche - Product niche (beauty, electronics, etc.)
   * @param {string} params.style - Video style (review, unboxing, demo)
   * @param {number} params.duration - Target duration in seconds (15-60)
   * @returns {object} { jobId, status }
   */
  async requestVideoGeneration({ productName, description, niche, style = 'review', duration = 30 }) {
    log.info('Requesting video generation', { productName, niche, style });

    try {
      const res = await fetch(`${this.baseUrl}/api/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'video_generation',
          params: {
            productName,
            description,
            niche,
            style,
            duration,
            platform: 'facebook', // Target platform for aspect ratio
          },
        }),
      });

      if (!res.ok) {
        throw new Error(`Content service returned ${res.status}`);
      }

      const data = await res.json();
      log.info('Video generation queued', { jobId: data.jobId });
      return { jobId: data.jobId, status: 'queued' };
    } catch (err) {
      log.error('Video generation request failed', { error: err.message });
      throw err;
    }
  }

  /**
   * Check video generation job status.
   * @param {string} jobId
   * @returns {object} { jobId, status, videoUrl }
   */
  async checkJobStatus(jobId) {
    try {
      const res = await fetch(`${this.baseUrl}/api/jobs/${jobId}`);
      if (!res.ok) throw new Error(`Content service returned ${res.status}`);
      return await res.json();
    } catch (err) {
      log.error('Job status check failed', { jobId, error: err.message });
      throw err;
    }
  }
}
