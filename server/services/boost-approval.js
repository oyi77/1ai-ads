/**
 * BoostApprovalService — computes boost scores for published posts
 * and manages the approval workflow with Telegram notifications.
 */
import config from '../config/index.js';

const TELEGRAM_API = 'https://api.telegram.org';

/** Score thresholds */
const SCORE_HIGH = 0.75;
const SCORE_MED  = 0.45;

export class BoostApprovalService {
  /**
   * @param {import('../repositories/boost-recommendations.js').BoostRecommendationsRepository} boostRepo
   * @param {object} settingsRepo — for reading telegram_bot_token / telegram_chat_id
   */
  constructor(boostRepo, settingsRepo) {
    this.boostRepo    = boostRepo;
    this.settingsRepo = settingsRepo;
  }

  // ── Scoring ────────────────────────────────────────────────────

  /**
   * Compute a 0–1 boost score from engagement signals.
   * @param {{ likes?: number, comments?: number, shares?: number, reach?: number }} metrics
   */
  computeScore(metrics = {}) {
    const { likes = 0, comments = 0, shares = 0, reach = 1 } = metrics;
    const engagement = likes + comments * 2 + shares * 3;
    const rate = reach > 0 ? engagement / reach : 0;
    // Normalise to 0-1: sigmoid-like cap at rate=0.10 → score≈1
    const score = Math.min(1, rate / 0.10);
    return Math.round(score * 1000) / 1000;
  }

  /** Translate score to IDR budget suggestion */
  _suggestBudget(score) {
    if (score >= SCORE_HIGH) return 'High engagement: Rp 200.000 – Rp 500.000';
    if (score >= SCORE_MED)  return 'Medium engagement: Rp 50.000 – Rp 150.000';
    return 'Low engagement: Rp 20.000 – Rp 50.000';
  }

  // ── Recommendation lifecycle ───────────────────────────────────

  /**
   * Create a boost recommendation for a post and optionally notify via Telegram.
   * @param {{ post_id: string, page_id: string, metrics?: object, target_audience_json?: string }} opts
   * @returns {object} created recommendation row
   */
  async recommend({ post_id, page_id, metrics = {}, target_audience_json = null }) {
    const score = this.computeScore(metrics);
    const budget = this._suggestBudget(score);

    const rec = this.boostRepo.create({
      post_id,
      page_id,
      boost_score: score,
      suggested_budget_idr: budget,
      suggested_duration_days: 3,
      target_audience_json,
    });

    if (score >= SCORE_MED) {
      await this._notify(rec).catch(() => {}); // non-fatal
    }

    return rec;
  }

  /** Approve a recommendation by id. */
  approve(id, reviewed_by = 'system') {
    return this.boostRepo.updateStatus(id, { status: 'approved', reviewed_by });
  }

  /** Reject a recommendation by id. */
  reject(id, reviewed_by = 'system') {
    return this.boostRepo.updateStatus(id, { status: 'rejected', reviewed_by });
  }

  /** Mark as actually boosted (ad campaign created). */
  markBoosted(id, ad_campaign_id) {
    return this.boostRepo.updateStatus(id, { status: 'boosted', reviewed_by: 'system', ad_campaign_id });
  }

  /** List recommendations, optionally filtered by status. */
  list(status = null, opts = {}) {
    return this.boostRepo.findByStatus(status, opts);
  }

  getById(id) {
    return this.boostRepo.findById(id);
  }

  // ── Telegram ───────────────────────────────────────────────────

  _telegramToken() {
    return this.settingsRepo?.getKey?.('telegram_bot_token') || config.telegramBotToken || '';
  }

  _telegramChatId() {
    return this.settingsRepo?.getKey?.('telegram_chat_id') || config.telegramChatId || '';
  }

  async _notify(rec) {
    const token  = this._telegramToken();
    const chatId = this._telegramChatId();
    if (!token || !chatId) return;

    const score   = (rec.boost_score * 100).toFixed(0);
    const emoji   = rec.boost_score >= SCORE_HIGH ? '🔥' : '📈';
    const text = [
      `${emoji} <b>Boost Recommendation</b>`,
      `Post: <code>${rec.post_id}</code>`,
      `Page: <code>${rec.page_id}</code>`,
      `Score: <b>${score}%</b>`,
      `Budget: ${rec.suggested_budget_idr}`,
      `Duration: ${rec.suggested_duration_days} days`,
      ``,
      `✅ /boost_approve_${rec.id}`,
      `❌ /boost_reject_${rec.id}`,
    ].join('\n');

    await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });
  }

  /**
   * Handle a Telegram bot command like /boost_approve_42 or /boost_reject_42.
   * Returns { handled: bool, action?, rec_id?, success? }.
   */
  async handleTelegramCommand(text = '') {
    const approveMatch = text.match(/^\/boost_approve_(\d+)/);
    const rejectMatch  = text.match(/^\/boost_reject_(\d+)/);

    if (approveMatch) {
      const id  = parseInt(approveMatch[1], 10);
      const rec = this.boostRepo.findById(id);
      if (!rec) return { handled: true, action: 'approved', rec_id: id, success: false };
      this.approve(id, 'telegram');
      return { handled: true, action: 'approved', rec_id: id, success: true };
    }

    if (rejectMatch) {
      const id  = parseInt(rejectMatch[1], 10);
      const rec = this.boostRepo.findById(id);
      if (!rec) return { handled: true, action: 'rejected', rec_id: id, success: false };
      this.reject(id, 'telegram');
      return { handled: true, action: 'rejected', rec_id: id, success: true };
    }

    return { handled: false };
  }
}
