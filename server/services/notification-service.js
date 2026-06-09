import { createLogger } from '../lib/logger.js';
import appConfig from '../config/index.js';

const log = createLogger('notification-service');

export class NotificationService {
  constructor(options = {}) {
    this.telegramToken = options.telegramToken || appConfig.telegramBotToken;
    this.telegramChatId = options.telegramChatId || appConfig.telegramChatId;
    this.webhookUrls = options.webhookUrls || (appConfig.notificationWebhooks || '').split(',').filter(Boolean);
  }

  async sendTelegram(message) {
    if (!this.telegramToken || !this.telegramChatId) {
      log.debug('Telegram not configured, skipping');
      return false;
    }
    try {
      const url = `https://api.telegram.org/bot${this.telegramToken}/sendMessage`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.telegramChatId,
          text: message,
          parse_mode: 'HTML',
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const data = await res.json();
      log.info('Telegram sent', { ok: data.ok });
      return data.ok;
    } catch (err) {
      log.error('Telegram send failed', { error: err.message });
      return false;
    }
  }

  async sendWebhook(event, data) {
    if (!this.webhookUrls.length) {
      log.debug('No webhook URLs configured');
      return false;
    }
    const payload = JSON.stringify({ event, data, timestamp: new Date().toISOString() });
    let sent = 0;
    for (const url of this.webhookUrls) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          signal: AbortSignal.timeout(10_000),
        });
        if (res.ok) sent++;
        log.info('Webhook sent', { url, status: res.status });
      } catch (err) {
        log.warn('Webhook failed', { url, error: err.message });
      }
    }
    return sent > 0;
  }

  async sendToUser(userId, message, settingsRepo) {
    let token = '';
    let chatId = '';

    try {
      const userToken = settingsRepo.get(`telegram_bot_token_${userId}`);
      const userChatId = settingsRepo.get(`telegram_chat_id_${userId}`);
      if (userToken && userChatId) {
        token = userToken;
        chatId = userChatId;
      }
    } catch {
      log.debug('No per-user Telegram config, falling back to global');
    }

    if (!token || !chatId) {
      token = this.telegramToken;
      chatId = this.telegramChatId;
    }

    if (!token || !chatId) {
      log.debug('Telegram not configured (user or global), skipping');
      return false;
    }

    try {
      const url = `https://api.telegram.org/bot${token}/sendMessage`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'HTML',
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const data = await res.json();
      log.info('Telegram sendToUser sent', { userId, ok: data.ok });
      return data.ok;
    } catch (err) {
      log.error('Telegram sendToUser failed', { userId, error: err.message });
      return false;
    }
  }

  async notify(event, data) {
    const message = this._formatMessage(event, data);
    await this.sendTelegram(message);
    await this.sendWebhook(event, data);
  }

  static MESSAGE_FORMATTERS = {
    roas_alert: (data) => `ROAS Alert: Campaign ${data.campaign_id} ROAS dropped to ${data.roas?.toFixed(2)} (threshold: ${data.threshold})`,
    cpa_breach: (data) => `CPA Breach: Campaign ${data.campaign_id} CPA ${data.cpa?.toFixed(0)} exceeds limit ${data.limit}`,
    auto_pause: (data) => `Auto-Pause: Campaign ${data.campaign_id} paused — ${data.reason}`,
    attribution_match: (data) => `Attribution: Order ${data.order_id} matched to ad ${data.ad_id} — revenue ${data.revenue}`,
    circuit_open: (data) => `Circuit Open: ${data.service} failed ${data.failures} times`,
  };

  _formatMessage(event, data) {
    const formatter = this.constructor.MESSAGE_FORMATTERS[event];
    return formatter
      ? formatter(data)
      : `[${event}] ${JSON.stringify(data)}`;
  }
}
