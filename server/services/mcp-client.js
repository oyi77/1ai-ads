import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createLogger } from '../lib/logger.js';
import { ConfigurationError, PlatformError } from '../lib/errors.js';

const log = createLogger('mcp-client');

/**
 * Real MCP client manager. Spawns MCP servers as child processes
 * and communicates via JSON-RPC over stdio.
 */
export class MCPClientManager {
  constructor() {
    this.clients = new Map(); // platform -> { client, transport, connected, error }
  }

  /**
   * Connect to a platform's MCP server.
   * @param {string} platform - 'meta' or 'google'
   * @param {object} credentials - Platform-specific credentials
   */
  async connect(platform, credentials) {
    log.info('Connecting to MCP server', { platform });

    // Disconnect existing if any
    if (this.clients.has(platform)) {
      await this.disconnect(platform);
    }

    const config = this._getServerConfig(platform, credentials);
    if (!config) {
      log.error('Unsupported platform for MCP', { platform });
      throw new ConfigurationError(`Unsupported platform: ${platform}`);
    }

    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: { ...process.env, ...config.env },
    });

    const client = new Client(
      { name: 'adforge-backend', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );

    try {
      await client.connect(transport);

      // Verify connection by listing tools
      const toolsResult = await client.request(
        { method: 'tools/list', params: {} },
        { type: 'object' }
      );

      const toolNames = (toolsResult.tools || []).map(t => t.name);

      this.clients.set(platform, {
        client,
        transport,
        connected: true,
        tools: toolNames,
        connectedAt: new Date().toISOString(),
        error: null,
      });

      log.info('MCP server connected successfully', { platform, toolCount: toolNames.length });
      return { connected: true, tools: toolNames, toolCount: toolNames.length };
    } catch (err) {
      this.clients.set(platform, {
        client: null,
        transport: null,
        connected: false,
        tools: [],
        error: err.message,
      });
      log.error('Failed to connect to MCP server', { platform, error: err.message });
      throw new Error(`Failed to connect to ${platform} MCP: ${err.message}`);
    }
  }

  /**
   * Disconnect a platform's MCP server.
   */
  async disconnect(platform) {
    const entry = this.clients.get(platform);
    if (entry?.client) {
      try {
        await entry.client.close();
        log.info('MCP server disconnected', { platform });
      } catch (err) {
        log.warn('Error closing MCP client', { platform, error: err.message });
      }
    }
    this.clients.delete(platform);
  }

  /**
   * Call a tool on a connected platform.
   */
  async callTool(platform, toolName, args = {}) {
    const entry = this.clients.get(platform);
    if (!entry?.connected || !entry.client) {
      throw new ConfigurationError(`${platform} is not connected. Connect first via Settings.`);
    }

    try {
      const result = await entry.client.callTool({ name: toolName, arguments: args });
      const content = result.content;

      if (!content || content.length === 0) {
        return { data: null };
      }

      // MCP returns content as array of { type, text } objects
      const text = content[0]?.text;
      if (!text) return { data: null };

      try {
        return { data: JSON.parse(text) };
      } catch {
        return { data: text };
      }
    } catch (err) {
      // If connection died, mark as disconnected
      if (err.message?.includes('closed') || err.message?.includes('EPIPE')) {
        entry.connected = false;
        entry.error = 'Connection lost. Reconnect via Settings.';
      }
      throw new PlatformError(`MCP tool ${toolName} failed: ${err.message}`, platform);
    }
  }

  /**
   * Get connection status for all platforms.
   */
  getStatus() {
    const status = {};
    for (const [platform, entry] of this.clients) {
      status[platform] = {
        connected: entry.connected,
        toolCount: entry.tools?.length || 0,
        connectedAt: entry.connectedAt || null,
        error: entry.error,
      };
    }

    // Add disconnected platforms
    for (const p of ['meta', 'google']) {
      if (!status[p]) {
        status[p] = { connected: false, toolCount: 0, connectedAt: null, error: null };
      }
    }

    return status;
  }

  /**
   * List available tools for a connected platform.
   */
  getTools(platform) {
    const entry = this.clients.get(platform);
    if (!entry?.connected) return [];
    return entry.tools || [];
  }

  /**
   * Get MCP server config for a platform.
   */
  _getServerConfig(platform, credentials) {
    switch (platform) {
      case 'meta':
        if (!credentials.access_token) throw new Error('META_ACCESS_TOKEN is required');
        return {
          command: 'npx',
          args: ['-y', 'meta-ads-mcp'],
          env: {
            META_ACCESS_TOKEN: credentials.access_token,
            ...(credentials.app_id && { META_APP_ID: credentials.app_id }),
            ...(credentials.app_secret && { META_APP_SECRET: credentials.app_secret }),
          },
        };

      case 'google':
        // Google Ads MCP is Python-based (mcp-google-ads)
        // Requires: credentials file path + developer token
        if (!credentials.credentials_path) throw new Error('Google Ads credentials path is required');
        if (!credentials.developer_token) throw new Error('Google Ads developer token is required');
        return {
          command: 'python3',
          args: [credentials.server_path || 'google_ads_server.py'],
          env: {
            GOOGLE_ADS_AUTH_TYPE: credentials.auth_type || 'oauth',
            GOOGLE_ADS_CREDENTIALS_PATH: credentials.credentials_path,
            GOOGLE_ADS_DEVELOPER_TOKEN: credentials.developer_token,
            ...(credentials.login_customer_id && { GOOGLE_ADS_LOGIN_CUSTOMER_ID: credentials.login_customer_id }),
          },
        };

      default:
        return null;
    }
  }
}
