import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MCPClientManager } from '../../../server/services/mcp-client.js';

// Mock the MCP SDK modules
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: class {
    constructor() {
      this.connect = vi.fn().mockResolvedValue(undefined);
      this.close = vi.fn().mockResolvedValue(undefined);
      this.request = vi.fn().mockResolvedValue({
        tools: [{ name: 'test-tool' }],
      });
      this.callTool = vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({ result: 'success' }) }],
      });
    }
  },
}));

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: class {
    constructor() {}
  },
}));

describe('MCPClientManager', () => {
  let manager;

  beforeEach(() => {
    manager = new MCPClientManager();
  });

  describe('constructor', () => {
    it('can be instantiated', () => {
      expect(manager).toBeInstanceOf(MCPClientManager);
    });

    it('initializes with empty clients map', () => {
      expect(manager.clients).toBeInstanceOf(Map);
      expect(manager.clients.size).toBe(0);
    });
  });

  describe('connect', () => {
    it('connect method exists', () => {
      expect(typeof manager.connect).toBe('function');
    });

    it('connects to meta platform with valid credentials', async () => {
      const credentials = {
        access_token: 'test-token',
        app_id: 'test-app-id',
        app_secret: 'test-app-secret',
      };

      const result = await manager.connect('meta', credentials);
      expect(result.connected).toBe(true);
      expect(result.tools).toContain('test-tool');
      expect(result.toolCount).toBe(1);
    });

    it('connects to google platform with valid credentials', async () => {
      const credentials = {
        credentials_path: '/path/to/credentials.json',
        developer_token: 'test-dev-token',
        auth_type: 'oauth',
      };

      const result = await manager.connect('google', credentials);
      expect(result.connected).toBe(true);
      expect(result.tools).toContain('test-tool');
    });

    it('throws error for unsupported platform', async () => {
      await expect(manager.connect('unsupported', {})).rejects.toThrow('Unsupported platform: unsupported');
    });

    it('throws error for meta platform without access_token', async () => {
      const credentials = {};
      await expect(manager.connect('meta', credentials)).rejects.toThrow('META_ACCESS_TOKEN is required');
    });

    it('throws error for google platform without credentials_path', async () => {
      const credentials = { developer_token: 'test' };
      await expect(manager.connect('google', credentials)).rejects.toThrow('Google Ads credentials path is required');
    });

    it('throws error for google platform without developer_token', async () => {
      const credentials = { credentials_path: '/path/to/credentials.json' };
      await expect(manager.connect('google', credentials)).rejects.toThrow('Google Ads developer token is required');
    });

    it('disconnects existing connection before connecting new one', async () => {
      const credentials = { access_token: 'test-token' };

      // First connection
      await manager.connect('meta', credentials);

      // Get the first client
      const firstClient = manager.clients.get('meta').client;

      // Connect again to the same platform
      await manager.connect('meta', credentials);

      // The previous client should have been closed
      expect(firstClient.close).toHaveBeenCalled();
    });
  });

  describe('disconnect', () => {
    it('disconnect method exists', () => {
      expect(typeof manager.disconnect).toBe('function');
    });

    it('disconnects a connected platform', async () => {
      const credentials = { access_token: 'test-token' };
      await manager.connect('meta', credentials);

      await manager.disconnect('meta');

      expect(manager.clients.has('meta')).toBe(false);
    });

    it('handles disconnect of non-existent platform', async () => {
      await expect(manager.disconnect('non-existent')).resolves.not.toThrow();
    });
  });

  describe('callTool', () => {
    it('callTool method exists', () => {
      expect(typeof manager.callTool).toBe('function');
    });

    it('calls a tool on connected platform', async () => {
      const credentials = { access_token: 'test-token' };
      await manager.connect('meta', credentials);

      const result = await manager.callTool('meta', 'test-tool', { param: 'value' });
      expect(result.data).toEqual({ result: 'success' });
    });

    it('throws error when platform not connected', async () => {
      await expect(manager.callTool('meta', 'test-tool')).rejects.toThrow('meta is not connected');
    });

    it('handles text response that is not JSON', async () => {
      const credentials = { access_token: 'test-token' };
      await manager.connect('meta', credentials);

      // Modify the existing client's callTool mock
      const client = manager.clients.get('meta').client;
      client.callTool.mockResolvedValue({
        content: [{ type: 'text', text: 'plain text response' }],
      });

      const result = await manager.callTool('meta', 'test-tool');
      expect(result.data).toBe('plain text response');
    });

    it('handles empty content response', async () => {
      const credentials = { access_token: 'test-token' };
      await manager.connect('meta', credentials);

      // Modify the existing client's callTool mock
      const client = manager.clients.get('meta').client;
      client.callTool.mockResolvedValue({
        content: [],
      });

      const result = await manager.callTool('meta', 'test-tool');
      expect(result.data).toBeNull();
    });

    it('marks connection as disconnected on connection loss', async () => {
      const credentials = { access_token: 'test-token' };
      await manager.connect('meta', credentials);

      // Modify the existing client's callTool mock
      const client = manager.clients.get('meta').client;
      client.callTool.mockRejectedValue(new Error('Connection closed'));

      await expect(manager.callTool('meta', 'test-tool')).rejects.toThrow();

      const status = manager.getStatus();
      expect(status.meta.connected).toBe(false);
      expect(status.meta.error).toContain('Connection lost');
    });
  });

  describe('getStatus', () => {
    it('getStatus method exists', () => {
      expect(typeof manager.getStatus).toBe('function');
    });

    it('returns status for all platforms', () => {
      const status = manager.getStatus();
      expect(status).toHaveProperty('meta');
      expect(status).toHaveProperty('google');
    });

    it('returns disconnected status for platforms not connected', () => {
      const status = manager.getStatus();
      expect(status.meta.connected).toBe(false);
      expect(status.meta.toolCount).toBe(0);
      expect(status.meta.connectedAt).toBeNull();
      expect(status.meta.error).toBeNull();
    });

    it('returns connected status for connected platform', async () => {
      const credentials = { access_token: 'test-token' };
      await manager.connect('meta', credentials);

      const status = manager.getStatus();
      expect(status.meta.connected).toBe(true);
      expect(status.meta.toolCount).toBe(1);
      expect(status.meta.connectedAt).toBeTruthy();
      expect(status.meta.error).toBeNull();
    });
  });

  describe('getTools', () => {
    it('getTools method exists', () => {
      expect(typeof manager.getTools).toBe('function');
    });

    it('returns empty array for disconnected platform', () => {
      const tools = manager.getTools('meta');
      expect(tools).toEqual([]);
    });

    it('returns tools for connected platform', async () => {
      const credentials = { access_token: 'test-token' };
      await manager.connect('meta', credentials);

      const tools = manager.getTools('meta');
      expect(tools).toContain('test-tool');
    });
  });

  describe('_getServerConfig', () => {
    it('_getServerConfig method exists', () => {
      expect(typeof manager._getServerConfig).toBe('function');
    });

    it('returns config for meta platform', () => {
      const credentials = {
        access_token: 'test-token',
        app_id: 'test-app-id',
        app_secret: 'test-app-secret',
      };

      const config = manager._getServerConfig('meta', credentials);
      expect(config).toBeDefined();
      expect(config.command).toBe('npx');
      expect(config.args).toEqual(['-y', 'meta-ads-mcp']);
      expect(config.env).toHaveProperty('META_ACCESS_TOKEN', 'test-token');
      expect(config.env).toHaveProperty('META_APP_ID', 'test-app-id');
      expect(config.env).toHaveProperty('META_APP_SECRET', 'test-app-secret');
    });

    it('returns config for google platform', () => {
      const credentials = {
        credentials_path: '/path/to/credentials.json',
        developer_token: 'test-dev-token',
        auth_type: 'oauth',
        login_customer_id: '1234567890',
      };

      const config = manager._getServerConfig('google', credentials);
      expect(config).toBeDefined();
      expect(config.command).toBe('python3');
      expect(config.args).toContain('google_ads_server.py');
      expect(config.env).toHaveProperty('GOOGLE_ADS_CREDENTIALS_PATH', '/path/to/credentials.json');
      expect(config.env).toHaveProperty('GOOGLE_ADS_DEVELOPER_TOKEN', 'test-dev-token');
      expect(config.env).toHaveProperty('GOOGLE_ADS_AUTH_TYPE', 'oauth');
      expect(config.env).toHaveProperty('GOOGLE_ADS_LOGIN_CUSTOMER_ID', '1234567890');
    });

    it('returns null for unsupported platform', () => {
      const config = manager._getServerConfig('unsupported', {});
      expect(config).toBeNull();
    });
  });
});
