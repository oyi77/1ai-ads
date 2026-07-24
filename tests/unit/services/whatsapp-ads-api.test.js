import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WhatsAppAdsAPI } from '../../../server/services/whatsapp/index.js';

vi.mock('../../../server/lib/platform-client.js', () => ({
  safeFetch: vi.fn(),
}));

describe('WhatsAppAdsAPI', () => {
  let api;
  let mockSettingsRepo;
  let mockSafeFetch;

  beforeEach(async () => {
    mockSafeFetch = (await import('../../../server/lib/platform-client.js')).safeFetch;
    mockSettingsRepo = {
      getCredentials: vi.fn().mockImplementation((platform) => {
        if (platform === 'whatsapp') return { access_token: 'test-whatsapp-token' };
        return null;
      }),
    };
    api = new WhatsAppAdsAPI(mockSettingsRepo);
    mockSafeFetch.mockClear();
  });

  describe('constructor', () => {
    it('should set base URL to Meta Graph API', () => {
      expect(api._baseUrl).toBe('https://graph.facebook.com/v22.0');
    });
  });

  describe('_getToken', () => {
    it('should return the whatsapp access token', () => {
      expect(api._getToken()).toBe('test-whatsapp-token');
    });

    it('should fall back to meta credentials when whatsapp not available', () => {
      mockSettingsRepo.getCredentials.mockImplementation((platform) => {
        if (platform === 'meta') return { access_token: 'test-meta-token' };
        return null;
      });
      expect(api._getToken()).toBe('test-meta-token');
    });

    it('should throw ConfigurationError when no token available', () => {
      mockSettingsRepo.getCredentials.mockReturnValue(null);
      const apiNoToken = new WhatsAppAdsAPI(mockSettingsRepo);
      expect(() => apiNoToken._getToken()).toThrow('WhatsApp access token not configured');
    });
  });

  describe('getBusinessAccounts', () => {
    it('should fetch businesses then owned_whatsapp_business_accounts', async () => {
      mockSafeFetch
        .mockResolvedValueOnce({
          json: () => Promise.resolve({ data: [{ id: 'biz1' }] }),
        })
        .mockResolvedValueOnce({
          json: () => Promise.resolve({ data: [{ id: 'wa1', name: 'WA Account 1' }] }),
        });

      const accounts = await api.getBusinessAccounts();

      expect(mockSafeFetch).toHaveBeenNthCalledWith(
        1,
        'whatsapp',
        'https://graph.facebook.com/v22.0/me/businesses',
        expect.objectContaining({ headers: expect.any(Object) })
      );
      expect(mockSafeFetch).toHaveBeenNthCalledWith(
        2,
        'whatsapp',
        'https://graph.facebook.com/v22.0/biz1/owned_whatsapp_business_accounts',
        expect.objectContaining({ headers: expect.any(Object) })
      );
      expect(accounts).toEqual([{ id: 'wa1', name: 'WA Account 1', business_id: 'biz1' }]);
    });
  });

  describe('getAccounts', () => {
    it('should be an alias for getBusinessAccounts', async () => {
      mockSafeFetch
        .mockResolvedValueOnce({ json: () => Promise.resolve({ data: [] }) });

      const accounts = await api.getAccounts();
      expect(accounts).toEqual([]);
    });
  });

  describe('getMessageTemplates', () => {
    it('should call GET /{accountId}/message_templates', async () => {
      mockSafeFetch.mockResolvedValue({
        json: () => Promise.resolve({ data: [{ id: 't1', name: 'welcome', status: 'APPROVED', language: 'en' }] }),
      });

      const templates = await api.getMessageTemplates('wa1');

      expect(mockSafeFetch).toHaveBeenCalledWith(
        'whatsapp',
        'https://graph.facebook.com/v22.0/wa1/message_templates',
        expect.objectContaining({ headers: expect.any(Object) })
      );
      expect(templates).toEqual([{ id: 't1', name: 'welcome', status: 'APPROVED', language: 'en' }]);
    });
  });

  describe('createMessageTemplate', () => {
    it('should call POST /{accountId}/message_templates with correct components', async () => {
      mockSafeFetch.mockResolvedValue({
        json: () => Promise.resolve({ id: 't-new', status: 'PENDING' }),
      });

      const result = await api.createMessageTemplate('wa1', { name: 'new_template', language: 'en_US', body: 'Hello!' });

      expect(mockSafeFetch).toHaveBeenCalledWith(
        'whatsapp',
        'https://graph.facebook.com/v22.0/wa1/message_templates',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            name: 'new_template',
            language: 'en_US',
            category: 'MARKETING',
            components: [{ type: 'BODY', text: 'Hello!' }],
          }),
        })
      );
      expect(result).toEqual({ templateId: 't-new', status: 'PENDING' });
    });
  });

  describe('syncAllAccounts', () => {
    it('should fetch templates for each business account', async () => {
      mockSafeFetch
        .mockResolvedValueOnce({
          json: () => Promise.resolve({ data: [{ id: 'biz1' }] }),
        })
        .mockResolvedValueOnce({
          json: () => Promise.resolve({ data: [{ id: 'wa1', name: 'WA 1' }] }),
        })
        .mockResolvedValueOnce({
          json: () => Promise.resolve({
            data: [{ id: 't1', name: 'welcome', status: 'APPROVED', language: 'en', category: 'MARKETING' }],
          }),
        });

      const results = await api.syncAllAccounts();

      expect(results).toHaveLength(1);
      expect(results[0].account.id).toBe('wa1');
      expect(results[0].campaigns[0].id).toBe('t1');
      expect(results[0].campaigns[0].status).toBe('approved');
      expect(results[0].campaigns[0].language).toBe('en');
      expect(results[0].campaigns[0].category).toBe('MARKETING');
    });
  });
});
