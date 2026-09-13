/**
 * McpClientManager — minimal per-user MCP client for the /api/mcp routes.
 *
 * The HTTP routes need a *client* that dials out to platform MCP servers with
 * the CALLER's credentials (mcp.js / mcp-server.js are the opposite direction:
 * our own server). Each user+platform gets its own spawned server over stdio,
 * so one tenant's token can never reach another tenant's session.
 *
 * Supported backends:
 * - meta: the `meta-ads-mcp` package (bundled dependency), spawned as
 *   `node <pkg>/build/index.js` with META_ACCESS_TOKEN taken from the user's
 *   own active Meta platform account. No other host env is inherited.
 *
 * Anything else answers a clear "not supported" error instead of an opaque
 * TypeError. Token refresh is deliberately out of scope: Meta user tokens are
 * long-lived, and the token-health cron already flags dead ones.
 */
import { createRequire } from 'module';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createLogger } from '../lib/logger.js';
import config from '../config/index.js';

const require = createRequire(import.meta.url);
const log = createLogger('mcp-client');

const SUPPORTED = ['meta'];

function serverEntry() {
  try {
    return require.resolve('meta-ads-mcp');
  } catch {
    return null;
  }
}

function realTransportFactory(env) {
  const entry = serverEntry();
  if (!entry) throw new Error('Meta MCP server package is not installed');
  return new StdioClientTransport({
    command: process.execPath,
    args: [entry],
    // Minimal child env on purpose: the user's token and nothing else.
    // Inheriting process.env would leak every host secret into the child.
    env: {
      META_ACCESS_TOKEN: env.META_ACCESS_TOKEN,
      META_API_VERSION: config.metaApiVersion,
    },
  });
}

export class McpClientManager {
  /**
   * @param {object} deps
   * @param {object} deps.platformAccountsRepo — per-user credential source
   * @param {Function} [deps.transportFactory] — (env) => transport; seam for tests
   */
  constructor({ platformAccountsRepo, transportFactory = realTransportFactory } = {}) {
    this.repo = platformAccountsRepo;
    this.transportFactory = transportFactory;
    // `${userId}:${platform}` → { client, transport }
    this._clients = new Map();
  }

  isSupported(platform) {
    return SUPPORTED.includes(platform);
  }

  getStatus(userId) {
    const status = {};
    for (const platform of SUPPORTED) {
      status[platform] = {
        configured: this._tokenFor(userId, platform) !== null,
        connected: this._clients.has(`${userId}:${platform}`),
      };
    }
    return status;
  }

  async connect(userId, platform) {
    this._assertSupported(platform);
    const key = `${userId}:${platform}`;
    if (this._clients.has(key)) return { connected: true, platform };
    const token = this._tokenFor(userId, platform);
    if (!token) {
      throw new Error(`Meta not connected for this user. Visit Settings to connect.`);
    }
    const transport = this.transportFactory({ META_ACCESS_TOKEN: token });
    const client = new Client({ name: '1ai-ads-backend', version: '1.0.0' }, { capabilities: { tools: {} } });
    try {
      await client.connect(transport);
    } catch (err) {
      await transport.close?.().catch(() => {});
      throw new Error(`MCP connect failed for ${platform}: ${err.message}`);
    }
    this._clients.set(key, { client, transport });
    log.info('MCP client connected', { userId, platform });
    return { connected: true, platform };
  }

  async disconnect(userId, platform) {
    const key = `${userId}:${platform}`;
    const cached = this._clients.get(key);
    if (cached?.transport) await cached.transport.close().catch(() => {});
    if (cached?.client) await cached.client.close?.().catch(() => {});
    this._clients.delete(key);
    return { connected: false, platform };
  }

  async getTools(userId, platform) {
    const client = await this._connectedClient(userId, platform);
    const result = await client.listTools();
    return result.tools || [];
  }

  async callTool(userId, platform, tool, args = {}) {
    if (!tool) throw new Error('tool is required');
    const client = await this._connectedClient(userId, platform);
    const result = await client.callTool({ name: tool, arguments: args });
    const text = result.content?.[0]?.text;
    if (text === undefined) return { data: result.content ?? null };
    try {
      return { data: JSON.parse(text) };
    } catch {
      return { data: text };
    }
  }

  _assertSupported(platform) {
    if (!this.isSupported(platform)) {
      throw new Error(`MCP platform "${platform}" is not supported`);
    }
  }

  _tokenFor(userId, platform) {
    try {
      const account = this.repo?.findActiveByUserAndPlatform?.(userId, platform);
      return account?.access_token || null;
    } catch {
      return null;
    }
  }

  async _connectedClient(userId, platform) {
    this._assertSupported(platform);
    const key = `${userId}:${platform}`;
    const cached = this._clients.get(key);
    if (cached) return cached.client;
    await this.connect(userId, platform);
    return this._clients.get(key).client;
  }
}
