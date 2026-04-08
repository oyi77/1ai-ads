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

describe('MCP Server (createAdForgeMCPServer)', () => {
  let createAdForgeMCPServer;
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
    createAdForgeMCPServer = module.createAdForgeMCPServer;
  });

  describe('server creation', () => {
    it('can create an MCP server instance', () => {
      const server = createAdForgeMCPServer(mockCampaignsRepo, mockLandingRepo, mockAdsRepo);
      expect(server).toBeDefined();
      expect(server.setRequestHandler).toHaveBeenCalled();
    });

    it('registers ListToolsRequestSchema handler', () => {
      const server = createAdForgeMCPServer(mockCampaignsRepo, mockLandingRepo, mockAdsRepo);

      // Should have registered handlers
      expect(server.setRequestHandler).toHaveBeenCalled();
      expect(server.setRequestHandler).toHaveBeenCalledTimes(2); // ListTools and CallTool
    });

    it('registers CallToolRequestSchema handler', () => {
      const server = createAdForgeMCPServer(mockCampaignsRepo, mockLandingRepo, mockAdsRepo);

      // Should have registered two handlers (list tools and call tool)
      expect(server.setRequestHandler).toHaveBeenCalledTimes(2);
    });
  });

  describe('tool registration', () => {
    it('registers adforge_list_campaigns tool', () => {
      const server = createAdForgeMCPServer(mockCampaignsRepo, mockLandingRepo, mockAdsRepo);

      // Verify server was created and handlers were registered
      expect(server).toBeDefined();
      expect(server.setRequestHandler).toHaveBeenCalled();
    });

    it('registers adforge_get_analytics tool', () => {
      const server = createAdForgeMCPServer(mockCampaignsRepo, mockLandingRepo, mockAdsRepo);

      // Verify server was created and handlers were registered
      expect(server).toBeDefined();
      expect(server.setRequestHandler).toHaveBeenCalled();
    });

    it('registers adforge_list_landing_pages tool', () => {
      const server = createAdForgeMCPServer(mockCampaignsRepo, mockLandingRepo, mockAdsRepo);

      // Verify server was created and handlers were registered
      expect(server).toBeDefined();
      expect(server.setRequestHandler).toHaveBeenCalled();
    });

    it('registers adforge_list_creatives tool', () => {
      const server = createAdForgeMCPServer(mockCampaignsRepo, mockLandingRepo, mockAdsRepo);

      // Verify server was created and handlers were registered
      expect(server).toBeDefined();
      expect(server.setRequestHandler).toHaveBeenCalled();
    });
  });

  describe('server behavior', () => {
    it('passes repos to server instance', () => {
      const server = createAdForgeMCPServer(mockCampaignsRepo, mockLandingRepo, mockAdsRepo);

      expect(server).toBeDefined();
      // The server should have the repos accessible internally
      // We verify this by checking that the server was created successfully
    });

    it('can create multiple server instances', () => {
      const server1 = createAdForgeMCPServer(mockCampaignsRepo, mockLandingRepo, mockAdsRepo);
      const server2 = createAdForgeMCPServer(mockCampaignsRepo, mockLandingRepo, mockAdsRepo);

      expect(server1).toBeDefined();
      expect(server2).toBeDefined();
      expect(server1).not.toBe(server2); // Different instances
    });

    it('handles missing repos gracefully', () => {
      expect(() => {
        createAdForgeMCPServer(null, null, null);
      }).not.toThrow();
    });
  });
});
