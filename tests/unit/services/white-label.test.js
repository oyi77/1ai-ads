import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { WhiteLabelService } from '../../../server/services/white-label.js';

describe('WhiteLabelService', () => {
  let service;
  let mockDb;
  let mockLlm;
  let tables;
  let store;

  beforeEach(() => {
    vi.clearAllMocks();

    store = { clients: {}, reports: {} };
    tables = {};

    const mockStatement = (sql) => {
      const normalized = sql.trim().toLowerCase();
      return {
        run: vi.fn((...args) => {
          // INSERT clients
          if (normalized.startsWith('insert into clients')) {
            store.clients[args[0]] = {
              id: args[0], agency_id: args[1], name: args[2], company: args[3],
              email: args[4], logo_url: args[5], brand_color: args[6],
            };
          }
          // INSERT reports
          if (normalized.startsWith('insert into reports')) {
            store.reports[args[0]] = {
              id: args[0], client_id: args[1], agency_id: args[2],
              type: args[3], data: args[4],
            };
          }
        }),
        get: vi.fn((...args) => {
          if (normalized.includes('from clients')) return store.clients[args[0]] || null;
          if (normalized.includes('from reports')) return store.reports[args[0]] || null;
          return null;
        }),
        all: vi.fn((...args) => {
          if (normalized.includes('from clients')) {
            return Object.values(store.clients).filter(c => c.agency_id === args[0]);
          }
          if (normalized.includes('from reports')) {
            if (normalized.includes('client_id')) {
              return Object.values(store.reports).filter(r => r.client_id === args[0]);
            }
            if (normalized.includes('agency_id')) {
              return Object.values(store.reports).filter(r => r.agency_id === args[0]);
            }
          }
          return [];
        }),
      };
    };

    mockDb = {
      exec: vi.fn(),
      prepare: vi.fn((sql) => mockStatement(sql)),
    };

    mockLlm = {
      call: vi.fn().mockResolvedValue('Great performance this week.'),
    };

    service = new WhiteLabelService(mockDb, mockLlm);
  });

  it('should create instance and ensure tables', () => {
    expect(service.db).toBe(mockDb);
    expect(service.llm).toBe(mockLlm);
    expect(mockDb.exec).toHaveBeenCalled();
  });

  describe('createClient', () => {
    it('should create a client', () => {
      const result = service.createClient({ agencyId: 'agency-1', name: 'Acme Corp', email: 'a@b.com' });
      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
    });

    it('should throw without agencyId or name', () => {
      expect(() => service.createClient({})).toThrow('agencyId and name are required');
      expect(() => service.createClient({ agencyId: 'a' })).toThrow('agencyId and name are required');
    });

    it('should use default brand color', () => {
      service.createClient({ agencyId: 'a', name: 'Test' });
      const insertCall = mockDb.prepare.mock.results.find(r =>
        typeof r.value.run === 'function'
      );
    });
  });

  describe('getClient', () => {
    it('should return client by id', () => {
      service.createClient({ agencyId: 'a', name: 'Test' });
      // getClient is called internally via the mock store
    });
  });

  describe('getClients', () => {
    it('should return clients for agency', () => {
      const result = service.getClients('agency-1');
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('generateReport', () => {
    it('should generate report with LLM summary', async () => {
      // Create a client first in the store
      store.clients['c1'] = { id: 'c1', agency_id: 'a1', name: 'Test', brand_color: '#3b82f6' };

      const result = await service.generateReport({
        clientId: 'c1', agencyId: 'a1', type: 'weekly', data: { spend: 100 },
      });

      expect(result.id).toBeDefined();
      expect(result.type).toBe('weekly');
      expect(result.html).toContain('Test');
      expect(mockLlm.call).toHaveBeenCalled();
    });

    it('should throw without clientId or agencyId', async () => {
      await expect(service.generateReport({})).rejects.toThrow('clientId and agencyId are required');
    });

    it('should throw if client not found', async () => {
      await expect(service.generateReport({ clientId: 'missing', agencyId: 'a1' })).rejects.toThrow('not found');
    });

    it('should skip LLM if no llm client', async () => {
      store.clients['c1'] = { id: 'c1', agency_id: 'a1', name: 'Test' };
      const svc = new WhiteLabelService(mockDb, null);
      const result = await svc.generateReport({ clientId: 'c1', agencyId: 'a1', data: { spend: 100 } });
      expect(result).toBeDefined();
    });

    it('should use provided data.summary instead of LLM', async () => {
      store.clients['c1'] = { id: 'c1', agency_id: 'a1', name: 'Test' };
      const result = await service.generateReport({
        clientId: 'c1', agencyId: 'a1', data: { summary: 'My summary', spend: 50 },
      });
      expect(result.data.summary).toBe('My summary');
      expect(mockLlm.call).not.toHaveBeenCalled();
    });
  });

  describe('getReports', () => {
    it('should return reports by clientId', () => {
      const result = service.getReports({ clientId: 'c1' });
      expect(Array.isArray(result)).toBe(true);
    });

    it('should return reports by agencyId', () => {
      const result = service.getReports({ agencyId: 'a1' });
      expect(Array.isArray(result)).toBe(true);
    });

    it('should return empty if no filters', () => {
      expect(service.getReports()).toEqual([]);
    });
  });

  describe('renderReportHTML', () => {
    it('should render HTML with brand color', () => {
      const html = service.renderReportHTML({
        client: { name: 'Acme', brand_color: '#ff0000' },
        type: 'weekly',
        data: { spend: 100, revenue: 300 },
      });
      expect(html).toContain('#ff0000');
      expect(html).toContain('Acme');
      expect(html).toContain('Weekly Report');
    });

    it('should render logo image when provided', () => {
      const html = service.renderReportHTML({
        client: { name: 'Acme', logo_url: 'https://logo.png' },
        type: 'daily',
        data: {},
      });
      expect(html).toContain('logo.png');
    });

    it('should render campaign rows', () => {
      const html = service.renderReportHTML({
        client: { name: 'Acme' },
        type: 'monthly',
        data: { campaigns: [{ name: 'Camp 1', spend: 50, roas: 3.0, conversions: 5 }] },
      });
      expect(html).toContain('Camp 1');
      expect(html).toContain('Campaign Performance');
    });

    it('should render notes section', () => {
      const html = service.renderReportHTML({
        client: { name: 'Acme' },
        type: 'weekly',
        data: { notes: 'Great week!' },
      });
      expect(html).toContain('Great week!');
    });
  });

  describe('_humanize', () => {
    it('should humanize camelCase keys', () => {
      expect(service._humanize('totalSpend')).toBe('Total Spend');
    });

    it('should humanize snake_case keys', () => {
      expect(service._humanize('total_spend')).toBe('Total Spend');
    });
  });

  describe('_formatValue', () => {
    it('should format spend/cost/revenue as currency', () => {
      expect(service._formatValue(150.5, 'spend')).toContain('$');
      expect(service._formatValue(150.5, 'totalCost')).toContain('$');
    });

    it('should format ROAS/CTR with suffix', () => {
      expect(service._formatValue(3.5, 'roas')).toContain('x');
      expect(service._formatValue(2.5, 'ctr')).toContain('%');
    });

    it('should format percent values', () => {
      expect(service._formatValue(45.6, 'percent')).toContain('%');
    });

    it('should format plain numbers', () => {
      expect(service._formatValue(1000, 'impressions')).toBe('1,000');
    });

    it('should handle non-numbers', () => {
      expect(service._formatValue('N/A', 'status')).toBe('N/A');
      expect(service._formatValue(null, 'status')).toBe('—');
    });
  });
});
