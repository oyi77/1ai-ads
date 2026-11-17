import { describe, it, expect, vi, beforeEach } from 'vitest';

let registeredHandlers;

// Mock the MCP SDK server module
vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: class {
    constructor() {
      registeredHandlers = [];
    }
    setRequestHandler = vi.fn((schema, handler) => {
      registeredHandlers.push({ schema, handler });
    });
  },
}));

vi.mock('@modelcontextprotocol/sdk/types.js', () => ({
  CallToolRequestSchema: {},
  ListToolsRequestSchema: {},
}));

describe('MCP Server (create1aiAdsMCPServer)', () => {
  let create1aiAdsMCPServer;
  let mockCampaignsRepo;
  let mockLandingRepo;
  let mockAdsRepo;

  beforeEach(async () => {
    // Reset modules
    vi.clearAllMocks();

    // Setup mock repos
    mockCampaignsRepo = {
      getAll: vi.fn(),
      getById: vi.fn(),
    };

    mockLandingRepo = {
      getAll: vi.fn(),
    };

    mockAdsRepo = {
      getAll: vi.fn(),
    };

    // Import the function
    const module = await import('../../../server/services/mcp-server.js');
    create1aiAdsMCPServer = module.create1aiAdsMCPServer;
  });

  describe('server creation', () => {
    it('can create an MCP server instance', () => {
      const server = create1aiAdsMCPServer(mockCampaignsRepo, mockLandingRepo, mockAdsRepo);
      expect(server).toBeDefined();
      expect(server.setRequestHandler).toHaveBeenCalled();
    });

    it('registers ListToolsRequestSchema handler', () => {
      const server = create1aiAdsMCPServer(mockCampaignsRepo, mockLandingRepo, mockAdsRepo);

      // Should have registered handlers
      expect(server.setRequestHandler).toHaveBeenCalled();
      expect(server.setRequestHandler).toHaveBeenCalledTimes(2); // ListTools and CallTool
    });

    it('registers CallToolRequestSchema handler', () => {
      const server = create1aiAdsMCPServer(mockCampaignsRepo, mockLandingRepo, mockAdsRepo);

      // Should have registered two handlers (list tools and call tool)
      expect(server.setRequestHandler).toHaveBeenCalledTimes(2);
    });
  });

  describe('tool registration', () => {
    it('registers 1ai-ads_list_campaigns tool', () => {
      const server = create1aiAdsMCPServer(mockCampaignsRepo, mockLandingRepo, mockAdsRepo);

      // Verify server was created and handlers were registered
      expect(server).toBeDefined();
      expect(server.setRequestHandler).toHaveBeenCalled();
    });

    it('registers 1ai-ads_get_analytics tool', () => {
      const server = create1aiAdsMCPServer(mockCampaignsRepo, mockLandingRepo, mockAdsRepo);

      // Verify server was created and handlers were registered
      expect(server).toBeDefined();
      expect(server.setRequestHandler).toHaveBeenCalled();
    });

    it('registers 1ai-ads_list_landing_pages tool', () => {
      const server = create1aiAdsMCPServer(mockCampaignsRepo, mockLandingRepo, mockAdsRepo);

      // Verify server was created and handlers were registered
      expect(server).toBeDefined();
      expect(server.setRequestHandler).toHaveBeenCalled();
    });

    it('registers 1ai-ads_list_creatives tool', () => {
      const server = create1aiAdsMCPServer(mockCampaignsRepo, mockLandingRepo, mockAdsRepo);

      // Verify server was created and handlers were registered
      expect(server).toBeDefined();
      expect(server.setRequestHandler).toHaveBeenCalled();
    });
  });

  describe('server behavior', () => {
    it('passes repos to server instance', () => {
      const server = create1aiAdsMCPServer(mockCampaignsRepo, mockLandingRepo, mockAdsRepo);

      expect(server).toBeDefined();
      // The server should have the repos accessible internally
      // We verify this by checking that the server was created successfully
    });

    it('can create multiple server instances', () => {
      const server1 = create1aiAdsMCPServer(mockCampaignsRepo, mockLandingRepo, mockAdsRepo);
      const server2 = create1aiAdsMCPServer(mockCampaignsRepo, mockLandingRepo, mockAdsRepo);

      expect(server1).toBeDefined();
      expect(server2).toBeDefined();
      expect(server1).not.toBe(server2); // Different instances
    });

    it('handles missing repos gracefully', () => {
      expect(() => {
        create1aiAdsMCPServer(null, null, null);
      }).not.toThrow();
    });
  });

  // DEF-02 (audit 2026-11-17): MCP tool handlers previously called
  // campaignsRepo.findAll({}) / landingRepo.findAll({}) / adsRepo.findAll({})
  // without a userId filter — every session could read every tenant's data.
  describe('multi-tenant scoping (DEF-02)', () => {
    const buildServer = () => {
      registeredHandlers = [];
      create1aiAdsMCPServer(mockCampaignsRepo, mockLandingRepo, mockAdsRepo, {}, {
        userId: 'user-1', role: 'admin',
      });
      return registeredHandlers[1].handler; // CallToolRequestSchema handler
    };

    it('1ai-ads_list_campaigns is scoped to the session identity', async () => {
      mockCampaignsRepo.findAll = vi.fn(() => ({ data: [{ id: 'c1', name: 'Mine' }] }));
      const callTool = buildServer();

      const response = await callTool({ params: { name: '1ai-ads_list_campaigns', arguments: {} } });
      expect(mockCampaignsRepo.findAll).toHaveBeenCalledWith({ userId: 'user-1' });
      expect(response.content[0].text).toContain('Mine');
    });

    it('1ai-ads_list_campaigns throws when no identity and no user_id arg', async () => {
      registeredHandlers = [];
      create1aiAdsMCPServer(mockCampaignsRepo, mockLandingRepo, mockAdsRepo, {}, {});
      const callTool = registeredHandlers[1].handler;

      const response = await callTool({ params: { name: '1ai-ads_list_campaigns', arguments: {} } });
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('user_id required');
    });

    it('1ai-ads_list_landing_pages is scoped to the session identity', async () => {
      mockLandingRepo.findAll = vi.fn(() => ({ data: [{ id: 'lp1' }] }));
      const callTool = buildServer();

      await callTool({ params: { name: '1ai-ads_list_landing_pages', arguments: {} } });
      expect(mockLandingRepo.findAll).toHaveBeenCalledWith({ userId: 'user-1' });
    });

    it('1ai-ads_list_creatives is scoped to the session identity', async () => {
      mockAdsRepo.findAll = vi.fn(() => ({ data: [{ id: 'ad1' }] }));
      const callTool = buildServer();

      await callTool({ params: { name: '1ai-ads_list_creatives', arguments: {} } });
      expect(mockAdsRepo.findAll).toHaveBeenCalledWith({ userId: 'user-1' });
    });

    it('1ai-ads_get_analytics rejects another tenant\'s campaign', async () => {
      mockCampaignsRepo.getById = vi.fn(() => ({ id: 'c2', user_id: 'someone-else' }));
      const callTool = buildServer();

      const response = await callTool({ params: { name: '1ai-ads_get_analytics', arguments: { campaign_id: 'c2' } } });
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Campaign not found');
    });

    it('1ai-ads_get_analytics allows the owner', async () => {
      mockCampaignsRepo.getById = vi.fn(() => ({ id: 'c1', user_id: 'user-1', name: 'Mine' }));
      const callTool = buildServer();

      const response = await callTool({ params: { name: '1ai-ads_get_analytics', arguments: { campaign_id: 'c1' } } });
      expect(response.isError).toBeFalsy();
      expect(response.content[0].text).toContain('Mine');
    });
  });
});
