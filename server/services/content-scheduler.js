/**
 * Content Scheduler Service
 *
 * Port of content-generator/scripts/auto_poster.py to Node.js
 * Handles: content queue management, AI caption generation via OmniRoute,
 *          scheduled posting, and status tracking
 *
 * Integrates with:
 *   - meta-video-service.js for actual video uploads
 *   - llm-client.js for AI caption generation (via OmniRoute)
 *   - ContentSchedulerQueueRepository for DB persistence (DIP)
 */

import fs from 'fs';
import { createLogger } from '../lib/logger.js';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

const log = createLogger('content-scheduler');

const PLATFORM_CAPTION_TIPS = {
  tiktok: 'TikTok — max 2200 chars, 3-5 hashtags, hook di baris pertama, casual & relatable',
  instagram: 'Instagram — max 2200 chars, 5-10 hashtags, storytelling, emojis natural',
  facebook: 'Facebook — conversational, longer form ok, 1-2 hashtags only',
};

const CAPTION_SYSTEM_PROMPT = 'Kamu adalah copywriter viral Indonesia untuk konten produk. Selalu respond dengan JSON valid tanpa markdown.';

/**
 * @typedef {'pending'|'generating_caption'|'uploading'|'completed'|'failed'} ContentStatus
 */

/**
 * @typedef {object} QueueItem
 * @property {string} id
 * @property {string} pageId
 * @property {string} platform
 * @property {string} filePath
 * @property {string} caption
 * @property {string[]} hashtags
 * @property {string} hook
 * @property {string} cta
 * @property {ContentStatus} status
 * @property {number} scheduledAt - Unix timestamp
 * @property {number} createdAt
 * @property {number|null} postedAt
 * @property {string|null} error
 * @property {string|null} videoId - Result from Meta API
 * @property {string|null} permalinkUrl
 */

export class ContentScheduler {
  /**
   * @param {object} deps
   * @param {import('./meta-video-service.js').MetaVideoService} deps.videoService
   * @param {import('./llm-client.js').LLMClient} deps.llmClient
   * @param {import('../repositories/content-scheduler-queue.js').ContentSchedulerQueueRepository} deps.queueRepo
   */
  constructor({ videoService, llmClient, queueRepo }) {
    this.videoService = videoService;
    this.llmClient = llmClient;
    this.queueRepo = queueRepo;
    this._processing = false;
    this._interval = null;
  }

  _safeParseHashtags(value) {
    if (!value) return [];
    try { return JSON.parse(value); } catch { return []; }
  }

  start(intervalMs = 60 * 1000) {
    log.info(`ContentScheduler started (check every ${intervalMs / 1000}s)`);
    this._interval = setInterval(() => {
      this.processQueue().catch(err =>
        log.error('Queue processing failed', { error: err.message })
      );
    }, intervalMs);
  }

  stop() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }

  /**
   * Add content to the posting queue
   */
  queueContent({ pageId, filePath, caption, hashtags, hook, cta, scheduleAt, category, style, productDesc, userId }) {
    if (!pageId || !filePath) {
      return { success: false, queueId: null, error: 'pageId and filePath are required' };
    }
    // Validate filePath: must be inside a controlled uploads directory (no
    // path traversal to arbitrary server files). Reject absolute paths and
    // parent-dir traversal, then allow only common media extensions.
    const resolved = path.resolve(filePath);
    const allowed = path.resolve(process.env.UPLOADS_DIR || 'uploads/');
    const validExts = /\.(mp4|mov|avi|jpg|jpeg|png|gif|mp3|pdf)$/i;
    if (!resolved.startsWith(allowed) || !validExts.test(filePath)) {
      return { success: false, queueId: null, error: 'filePath must be a valid media file inside the uploads directory' };
    }

    const id = uuidv4();
    const now = Math.floor(Date.now() / 1000);
    const needsCaption = !caption && (category || productDesc);

    this.queueRepo.insert({
      id, userId, pageId, platform: 'facebook', filePath,
      caption: caption || '',
      hashtags: hashtags || [],
      hook: hook || '',
      cta: cta || '',
      status: needsCaption ? 'pending' : 'pending',
      scheduledAt: scheduleAt || now,
      createdAt: now,
      category: category || '',
      style: style || '',
      productDesc: productDesc || '',
    });

    log.info('Content queued', { queueId: id, pageId, needsCaption });
    return { success: true, queueId: id };
  }

  /**
   * Process the queue — uploads pending items that are due
   */
  async processQueue({ pageId, userId } = {}) {
    if (this._processing) {
      log.warn('Queue processing already in progress, skipping');
      return [];
    }

    this._processing = true;
    const results = [];

    try {
      const now = Math.floor(Date.now() / 1000);
      const rows = pageId
        ? this.queueRepo.findPendingByPage(pageId, now, userId)
        : userId
          ? this.queueRepo.findByStatus('pending', 500, userId)
          : this.queueRepo.findPendingAll(now);

      for (const row of rows) {
        const result = await this._processItem(row);
        results.push(result);
      }
    } catch (err) {
      log.error('Queue processing error', { error: err.message });
    } finally {
      this._processing = false;
    }

    return results;
  }

  async _resolveCaption(row, logCtx) {
    let caption = row.caption;
    let hashtags = this._safeParseHashtags(row.hashtags);

    if (!caption && (row.category || row.product_desc)) {
      log.info('Generating caption via LLM', logCtx);
      this._updateStatus(row.id, 'generating_caption');
      const result = await this._generateCaption({
        category: row.category, style: row.style,
        productDesc: row.product_desc, platform: 'facebook',
      });
      caption = result.caption || caption;
      hashtags = result.hashtags || hashtags;
    }

    return { caption: caption || 'New video post', hashtags };
  }

  _prepareVideoUploadPayload(row, caption, hashtags) {
    return {
      pageId: row.page_id, videoData: fs.readFileSync(row.file_path),
      title: caption.substring(0, 100),
      description: `${caption}\n\n${hashtags.join(' ')}`,
      published: true,
    };
  }

  async _uploadAndComplete(id, row, caption, hashtags, logCtx) {
    log.info('Uploading video', logCtx);
    this._updateStatus(id, 'uploading');

    const uploadResult = await this.videoService.uploadVideo(
      this._prepareVideoUploadPayload(row, caption, hashtags),
    );

    if (!uploadResult.success) throw new Error(uploadResult.error || 'Upload failed');

    this.queueRepo.updateCompleted(id, {
      caption, hashtags, videoId: uploadResult.videoId,
      permalinkUrl: uploadResult.permalinkUrl,
      postedAt: Math.floor(Date.now() / 1000),
    });
    log.info('Content posted successfully', { ...logCtx, videoId: uploadResult.videoId });
    return { id, success: true, videoId: uploadResult.videoId, permalinkUrl: uploadResult.permalinkUrl };
  }

  async _processItem(row) {
    const id = row.id;
    const logCtx = { queueId: id, pageId: row.page_id };

    try {
      const { caption, hashtags } = await this._resolveCaption(row, logCtx);
      return await this._uploadAndComplete(id, row, caption, hashtags, logCtx);
    } catch (err) {
      const errorMsg = err.message || 'Unknown error';
      this.queueRepo.updateFailed(id, errorMsg, Math.floor(Date.now() / 1000));
      log.error('Content processing failed', { ...logCtx, error: errorMsg });
      return { id, success: false, error: errorMsg };
    }
  }

  _buildCaptionPrompt({ category, style, productDesc, platform = 'facebook' }) {
    const userPrompt = `Buat caption untuk platform ${platform}:
- Produk: ${productDesc || '(produk tidak disebutkan)'}
- Kategori: ${category || 'general'}
- Visual style: ${style || 'natural'}
- Tips platform: ${PLATFORM_CAPTION_TIPS[platform] || ''}

Respond ONLY JSON:
{
  "caption": "caption text disini (Bahasa Indonesia, natural, engaging)",
  "hashtags": ["#tag1", "#tag2", "#tag3"],
  "hook": "kalimat pembuka yang menarik perhatian dalam 3 detik",
  "cta": "call-to-action yang subtle, tidak jualan banget"
}`;

    return { system: CAPTION_SYSTEM_PROMPT, user: userPrompt };
  }

  _parseCaptionResponse(content) {
    const cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      caption: parsed.caption || '', hashtags: parsed.hashtags || [],
      hook: parsed.hook || '', cta: parsed.cta || '',
    };
  }

  _getCaptionFallback({ category, productDesc }) {
    return {
      caption: productDesc ? `Produk ${productDesc} yang kamu cari! 🔥` : 'Cek produk terbaru kami! 🔥',
      hashtags: [`#${category || 'produk'}`, '#viral'],
      hook: productDesc ? `Cobain ${productDesc} ini!` : 'Jangan sampai ketinggalan!',
      cta: 'Klik untuk info lebih lanjut',
    };
  }

  /**
   * Generate caption using LLM (via OmniRoute)
   */
  async _generateCaption(opts) {
    const prompt = this._buildCaptionPrompt(opts);

    try {
      const content = await this.llmClient.call(prompt.system, prompt.user, {
        temperature: 0.8, max_tokens: 500,
      });
      return this._parseCaptionResponse(content);
    } catch (err) {
      log.warn('Caption generation failed, using fallback', { error: err.message });
      return this._getCaptionFallback(opts);
    }
  }

  /** Get queue status summary */
  getQueueStatus(userId) {
    return userId ? this.queueRepo.getStatusCounts(userId) : this.queueRepo.getStatusCounts();
  }

  /** Get items by status */
  getQueue(status, limit = 50, userId) {
    return this.queueRepo.findByStatus(status, limit, userId);
  }

  /** Cancel a pending queue item */
  cancelSchedule(queueId, userId) {
    const item = this.queueRepo.findById(queueId, userId);
    if (!item) return { success: false, error: 'Queue item not found' };
    if (item.status !== 'pending') return { success: false, error: `Cannot cancel item with status: ${item.status}` };

    this.queueRepo.cancelById(queueId, Math.floor(Date.now() / 1000), userId);
    return { success: true };
  }

  /** Update status of a queue item */
  _updateStatus(id, status) {
    this.queueRepo.updateStatus(id, status, Math.floor(Date.now() / 1000));
  }
}