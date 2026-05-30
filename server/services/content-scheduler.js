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
 *   - repositories/ for DB persistence
 */

import { createLogger } from '../lib/logger.js';
import { v4 as uuidv4 } from 'uuid';

const log = createLogger('content-scheduler');

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
   * @param {object} deps.db - better-sqlite3 instance (for queue persistence)
   */
  constructor({ videoService, llmClient, db }) {
    this.videoService = videoService;
    this.llmClient = llmClient;
    this.db = db;
    this._processing = false;
    this._interval = null;
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
   *
   * @param {object} options
   * @param {string} options.pageId - Facebook Page ID
   * @param {string} options.filePath - Path to video file
   * @param {string} [options.caption] - Optional pre-defined caption
   * @param {string[]} [options.hashtags] - Optional hashtags
   * @param {string} [options.hook] - Optional hook text
   * @param {string} [options.cta] - Optional CTA
   * @param {number} [options.scheduleAt] - Unix timestamp for scheduled posting (default: now)
   * @param {string} [options.category] - Product category (for AI caption generation)
   * @param {string} [options.style] - Visual style (for AI caption generation)
   * @param {string} [options.productDesc] - Product description (for AI caption generation)
   * @returns {{ success: boolean, queueId: string, error?: string }}
   */
  queueContent({ pageId, filePath, caption, hashtags, hook, cta, scheduleAt, category, style, productDesc }) {
    if (!pageId || !filePath) {
      return { success: false, queueId: null, error: 'pageId and filePath are required' };
    }

    const id = uuidv4();
    const now = Math.floor(Date.now() / 1000);

    // If no caption provided but category/productDesc given, we'll generate later
    const needsCaption = !caption && (category || productDesc);

    const stmt = this.db.prepare(`
      INSERT INTO content_queue (id, page_id, platform, file_path, caption, hashtags, hook, cta, status, scheduled_at, created_at, category, style, product_desc)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      pageId,
      'facebook',
      filePath,
      caption || '',
      JSON.stringify(hashtags || []),
      hook || '',
      cta || '',
      needsCaption ? 'pending' : 'pending',
      scheduleAt || now,
      now,
      category || '',
      style || '',
      productDesc || '',
    );

    log.info('Content queued', { queueId: id, pageId, needsCaption });
    return { success: true, queueId: id };
  }

  /**
   * Process the queue — uploads pending items that are due
   *
   * @param {object} [options]
   * @param {string} [options.pageId] - Only process items for this page
   * @returns {Promise<Array<{id: string, success: boolean, videoId?: string, error?: string}>>}
   */
  async processQueue({ pageId } = {}) {
    if (this._processing) {
      log.warn('Queue processing already in progress, skipping');
      return [];
    }

    this._processing = true;
    const results = [];

    try {
      const now = Math.floor(Date.now() / 1000);
      let rows;

      if (pageId) {
        rows = this.db.prepare(
          'SELECT * FROM content_queue WHERE page_id = ? AND status = ? AND scheduled_at <= ? ORDER BY created_at ASC'
        ).all(pageId, 'pending', now);
      } else {
        rows = this.db.prepare(
          'SELECT * FROM content_queue WHERE status = ? AND scheduled_at <= ? ORDER BY created_at ASC'
        ).all('pending', now);
      }

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

  /**
   * Process a single queue item
   */
  async _processItem(row) {
    const id = row.id;
    const logCtx = { queueId: id, pageId: row.page_id };

    try {
      // Step 1: Generate caption if needed
      let caption = row.caption;
      let hashtags = JSON.parse(row.hashtags || '[]');

      if (!caption && (row.category || row.product_desc)) {
        log.info('Generating caption via LLM', logCtx);
        this._updateStatus(id, 'generating_caption');

        const captionResult = await this._generateCaption({
          category: row.category,
          style: row.style,
          productDesc: row.product_desc,
          platform: 'facebook',
        });

        caption = captionResult.caption || caption;
        hashtags = captionResult.hashtags || hashtags;
      }

      if (!caption) {
        caption = 'New video post';
      }

      // Step 2: Upload video
      log.info('Uploading video', logCtx);
      this._updateStatus(id, 'uploading');

      const fs = await import('fs');
      const videoBuffer = fs.readFileSync(row.file_path);

      const uploadResult = await this.videoService.uploadVideo({
        pageId: row.page_id,
        videoData: videoBuffer,
        title: caption.substring(0, 100),
        description: `${caption}\n\n${hashtags.join(' ')}`,
        published: true,
      });

      if (uploadResult.success) {
        this.db.prepare(`
          UPDATE content_queue SET status = ?, caption = ?, hashtags = ?, video_id = ?, permalink_url = ?, posted_at = ?, error = NULL, updated_at = ?
          WHERE id = ?
        `).run('completed', caption, JSON.stringify(hashtags), uploadResult.videoId, uploadResult.permalinkUrl, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000), id);

        log.info('Content posted successfully', { ...logCtx, videoId: uploadResult.videoId });
        return { id, success: true, videoId: uploadResult.videoId, permalinkUrl: uploadResult.permalinkUrl };
      }

      throw new Error(uploadResult.error || 'Upload failed');
    } catch (err) {
      const errorMsg = err.message || 'Unknown error';
      this.db.prepare(`
        UPDATE content_queue SET status = ?, error = ?, updated_at = ? WHERE id = ?
      `).run('failed', errorMsg, Math.floor(Date.now() / 1000), id);

      log.error('Content processing failed', { ...logCtx, error: errorMsg });
      return { id, success: false, error: errorMsg };
    }
  }

  /**
   * Generate caption using LLM (via OmniRoute)
   * Ported from auto_poster.py generate_caption()
   */
  async _generateCaption({ category, style, productDesc, platform = 'facebook' }) {
    const platformTips = {
      tiktok: 'TikTok — max 2200 chars, 3-5 hashtags, hook di baris pertama, casual & relatable',
      instagram: 'Instagram — max 2200 chars, 5-10 hashtags, storytelling, emojis natural',
      facebook: 'Facebook — conversational, longer form ok, 1-2 hashtags only',
    };

    const systemPrompt = 'Kamu adalah copywriter viral Indonesia untuk konten produk. Selalu respond dengan JSON valid tanpa markdown.';
    const userPrompt = `Buat caption untuk platform ${platform}:
- Produk: ${productDesc || '(produk tidak disebutkan)'}
- Kategori: ${category || 'general'}
- Visual style: ${style || 'natural'}
- Tips platform: ${platformTips[platform] || ''}

Respond ONLY JSON:
{
  "caption": "caption text disini (Bahasa Indonesia, natural, engaging)",
  "hashtags": ["#tag1", "#tag2", "#tag3"],
  "hook": "kalimat pembuka yang menarik perhatian dalam 3 detik",
  "cta": "call-to-action yang subtle, tidak jualan banget"
}`;

    try {
      const content = await this.llmClient.call(systemPrompt, userPrompt, {
        temperature: 0.8,
        max_tokens: 500,
      });

      // Clean markdown code blocks
      const cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      const parsed = JSON.parse(cleaned);

      return {
        caption: parsed.caption || '',
        hashtags: parsed.hashtags || [],
        hook: parsed.hook || '',
        cta: parsed.cta || '',
      };
    } catch (err) {
      log.warn('Caption generation failed, using fallback', { error: err.message });
      return {
        caption: productDesc ? `Produk ${productDesc} yang kamu cari! 🔥` : 'Cek produk terbaru kami! 🔥',
        hashtags: [`#${category || 'produk'}`, '#viral'],
        hook: productDesc ? `Cobain ${productDesc} ini!` : 'Jangan sampai ketinggalan!',
        cta: 'Klik untuk info lebih lanjut',
      };
    }
  }

  /**
   * Get queue status summary
   *
   * @returns {{ total: number, pending: number, generating: number, uploading: number, completed: number, failed: number }}
   */
  getQueueStatus() {
    const total = this.db.prepare('SELECT COUNT(*) as c FROM content_queue').get().c;
    const pending = this.db.prepare("SELECT COUNT(*) as c FROM content_queue WHERE status = 'pending'").get().c;
    const generating = this.db.prepare("SELECT COUNT(*) as c FROM content_queue WHERE status = 'generating_caption'").get().c;
    const uploading = this.db.prepare("SELECT COUNT(*) as c FROM content_queue WHERE status = 'uploading'").get().c;
    const completed = this.db.prepare("SELECT COUNT(*) as c FROM content_queue WHERE status = 'completed'").get().c;
    const failed = this.db.prepare("SELECT COUNT(*) as c FROM content_queue WHERE status = 'failed'").get().c;

    return { total, pending, generating, uploading, completed, failed };
  }

  /**
   * Get items by status
   *
   * @param {ContentStatus} [status]
   * @param {number} [limit=50]
   * @returns {QueueItem[]}
   */
  getQueue(status, limit = 50) {
    if (status) {
      return this.db.prepare('SELECT * FROM content_queue WHERE status = ? ORDER BY created_at DESC LIMIT ?').all(status, limit);
    }
    return this.db.prepare('SELECT * FROM content_queue ORDER BY created_at DESC LIMIT ?').all(limit);
  }

  /**
   * Cancel a pending queue item
   *
   * @param {string} queueId
   * @returns {{ success: boolean, error?: string }}
   */
  cancelSchedule(queueId) {
    const item = this.db.prepare('SELECT * FROM content_queue WHERE id = ?').get(queueId);
    if (!item) {
      return { success: false, error: 'Queue item not found' };
    }
    if (item.status !== 'pending') {
      return { success: false, error: `Cannot cancel item with status: ${item.status}` };
    }

    this.db.prepare('UPDATE content_queue SET status = ?, updated_at = ? WHERE id = ?')
      .run('cancelled', Math.floor(Date.now() / 1000), queueId);

    return { success: true };
  }

  /**
   * Update status of a queue item in DB
   */
  _updateStatus(id, status) {
    this.db.prepare('UPDATE content_queue SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, Math.floor(Date.now() / 1000), id);
  }
}
