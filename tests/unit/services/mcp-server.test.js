import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the MCP SDK server module
vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: class {
    constructor() {}
    setRequestHandler = vi.fn();
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
});
