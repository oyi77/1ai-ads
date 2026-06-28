import { safeFetch } from '../lib/platform-client.js';
import { BasePlatformApiClient } from '../lib/base-platform-api.js';
import { ConfigurationError, PlatformError } from '../lib/errors.js';

const BASE = 'https://graph.facebook.com/v22.0';

export class WhatsAppAdsAPI extends BasePlatformApiClient {
  constructor(settingsRepo) {
    super('whatsapp', settingsRepo, { baseUrl: BASE });
  }

  _getToken() {
    if (this._explicitToken) return this._explicitToken;
    if (this.settingsRepo) {
      const whatsappCreds = this.settingsRepo.getCredentials('whatsapp');
      if (whatsappCreds?.access_token) return whatsappCreds.access_token;
      const metaCreds = this.settingsRepo.getCredentials('meta');
      if (metaCreds?.access_token) return metaCreds.access_token;
    }
    throw new ConfigurationError(
      'WhatsApp Business access token not configured. Go to Settings > WhatsApp or Meta to add it.'
    );
  }

  _headers() {
    return {
      'Authorization': `Bearer ${this._getToken()}`,
    };
  }

  async _get(path, params = {}) {
    const url = new URL(`${this._baseUrl}${path}`);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) {
        url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
      }
    }
    const res = await safeFetch('whatsapp', url.toString(), {
      headers: this._headers(),
    });
    const data = await res.json();
    if (data.error) {
      throw new PlatformError(
        `WhatsApp API error: ${data.error.message}`,
        'whatsapp',
        data.error.code
      );
    }
    return data;
  }

  async _post(path, body = {}) {
    const res = await safeFetch('whatsapp', `${this._baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this._headers() },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.error) {
      throw new PlatformError(
        `WhatsApp API error: ${data.error.message}`,
        'whatsapp',
        data.error.code
      );
    }
    return data;
  }

  /**
   * List WhatsApp Business Accounts.
   * GET /me/businesses → then /{business-id}/owned_whatsapp_business_accounts
   */
  async getBusinessAccounts() {
    this.log.debug('Fetching WhatsApp business accounts');
    const meData = await this._get('/me/businesses');
    const businesses = meData.data || [];

    const accounts = [];
    for (const biz of businesses) {
      const waData = await this._get(`/${biz.id}/owned_whatsapp_business_accounts`);
      for (const acct of waData.data || []) {
        accounts.push({
          id: acct.id,
          name: acct.name,
          business_id: biz.id,
        });
      }
    }
    return accounts;
  }

  /**
   * List message templates for a WhatsApp Business Account.
   * GET /{accountId}/message_templates
   */
  async getMessageTemplates(accountId) {
    this.log.debug('Fetching WhatsApp message templates', { accountId });
    const data = await this._get(`/${accountId}/message_templates`);
    return data.data || [];
  }

  /**
   * Create a new message template.
   * POST /{accountId}/message_templates
   */
  async createMessageTemplate(accountId, { name, language = 'en', body: bodyText }) {
    this.log.info('Creating WhatsApp message template', { accountId, name });
    const body = {
      name,
      language,
      category: 'MARKETING',
      components: [
        {
          type: 'BODY',
          text: bodyText,
        },
      ],
    };
    const data = await this._post(`/${accountId}/message_templates`, body);
    this.log.info('WhatsApp message template created', { templateId: data.id });
    return { templateId: data.id, status: data.status };
  }

  /**
   * Sync all business accounts: fetch templates per account.
   * Returns standardized format matching other platforms.
   */
  async syncAllAccounts() {
    this.log.info('Starting WhatsApp Business sync');
    const accounts = await this.getBusinessAccounts();
    const results = [];

    for (const account of accounts) {
      try {
        const templates = await this.getMessageTemplates(account.id);

        results.push({
          account: { id: account.id, name: account.name },
          campaigns: templates.map(t => this._mapTemplate(t)),
          insights: [],
          syncedAt: new Date().toISOString(),
        });
      } catch (err) {
        results.push({
          account: { id: account.id, name: account.name },
          error: err.message,
          syncedAt: new Date().toISOString(),
        });
      }
    }

    this.log.info('WhatsApp Business sync complete', { accounts: results.length });
    return results;
  }

  _mapTemplate(t) {
    return {
      id: t.id,
      name: t.name,
      status: t.status ? t.status.toLowerCase() : 'unknown',
      language: t.language,
      category: t.category,
    };
  }
}
