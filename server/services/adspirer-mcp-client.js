import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('adspirer-mcp-client');
const MCP_URL = 'https://mcp.adspirer.com/mcp';

export class AdspirerMcpClient {
  constructor(platformAccountsRepo) {
    this.repo = platformAccountsRepo;
    this._clients = new Map(); // userId → { client, transport }
  }

  async callTool(userId, toolName, args = {}) {
    const client = await this._getClient(userId);
    log.info('Calling Adspirer tool', { userId, toolName });
    try {
      const result = await client.callTool({ name: toolName, arguments: args });
      const text = result.content?.[0]?.text;
      if (!text) return null;
      try { return JSON.parse(text); } catch { return text; }
    } catch (err) {
      if (err.message?.includes('401') || err.message?.includes('Unauthorized')) {
        // Force token refresh and retry once
        this._clients.delete(userId);
        const account = this.repo.findActiveByUserAndPlatform(userId, 'adspirer');
        if (account) {
          const creds = JSON.parse(account.credentials);
          await this._refreshToken(userId, account, creds);
          return this.callTool(userId, toolName, args);
        }
      }
      throw err;
    }
  }

  async listTools(userId) {
    const client = await this._getClient(userId);
    const result = await client.request({ method: 'tools/list', params: {} }, { type: 'object' });
    return result.tools || [];
  }

  async disconnect(userId) {
    const cached = this._clients.get(userId);
    if (cached?.client) await cached.client.close().catch(() => {});
    this._clients.delete(userId);
  }

  async _getClient(userId) {
    const account = this.repo.findActiveByUserAndPlatform(userId, 'adspirer');
    if (!account) throw new Error('Adspirer not connected. Visit Settings to connect.');

    const creds = JSON.parse(account.credentials);
    // Auto-refresh if expired (or within 60s of expiry)
    if (creds.expires_at && Date.now() > new Date(creds.expires_at).getTime() - 60000) {
      await this._refreshToken(userId, account, creds);
      this._clients.delete(userId);
      return this._getClient(userId);
    }

    if (this._clients.has(userId)) return this._clients.get(userId).client;

    const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
      requestInit: {
        headers: { Authorization: `Bearer ${creds.access_token}` },
      },
    });
    const client = new Client({ name: 'adforge-backend', version: '1.0.0' }, { capabilities: { tools: {} } });
    await client.connect(transport);
    this._clients.set(userId, { client, transport });
    return client;
  }

  async _refreshToken(userId, account, creds) {
    if (!creds.refresh_token) throw new Error('No refresh token available. Please reconnect Adspirer.');
    const resp = await fetch('https://mcp.adspirer.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: creds.refresh_token,
        client_id: process.env.ADSPIRER_CLIENT_ID || '',
      }),
    });
    if (!resp.ok) throw new Error(`Token refresh failed (${resp.status}). Please reconnect Adspirer.`);
    const tokens = await resp.json();
    const updatedCreds = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || creds.refresh_token,
      expires_at: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString(),
    };
    this.repo.update(account.id, { credentials: JSON.stringify(updatedCreds) });
    log.info('Adspirer token refreshed', { userId });
  }
}
