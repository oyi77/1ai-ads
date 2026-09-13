import { describe, it, expect, vi } from 'vitest';
import { McpClientManager } from '../../../server/services/mcp-client.js';

/**
 * McpClientManager lifecycle, against the REAL SDK Client talking to an
 * in-memory fake transport. The fake answers the JSON-RPC handshake
 * (initialize), tools/list and tools/call, so connect/getTools/callTool run
 * their production code paths without spawning processes.
 */
function fakeTransportFactory(log = {}) {
  log.spawns = 0;
  return (_env) => {
    log.spawns += 1;
    const t = {
      onmessage: null,
      onclose: null,
      onerror: null,
      async start() {},
      async send(msg) {
        if (msg.id === undefined || msg.id === null) return; // notification
        let result;
        if (msg.method === 'initialize') {
          result = { protocolVersion: '2024-11-05', capabilities: {}, serverInfo: { name: 'fake', version: '0' } };
        } else if (msg.method === 'tools/list') {
          result = { tools: [{ name: 'get_ad_accounts', description: 'accounts', inputSchema: { type: 'object', properties: {} } }] };
        } else if (msg.method === 'tools/call') {
          result = msg.params?.name === 'echo'
            ? { content: [{ type: 'text', text: JSON.stringify({ echoed: msg.params.arguments }) }] }
            : { content: [{ type: 'text', text: 'plain-text-result' }] };
        } else {
          result = {};
        }
        queueMicrotask(() => t.onmessage?.({ jsonrpc: '2.0', id: msg.id, result }));
      },
      async close() {},
    };
    return t;
  };
}

const repoFor = (tokens = { u1: 'tok-u1' }) => ({
  findActiveByUserAndPlatform: vi.fn((userId, platform) =>
    platform === 'meta' && tokens[userId] ? { access_token: tokens[userId] } : null
  ),
});

describe('McpClientManager — per-user lifecycle', () => {
  it('connects, lists tools, and calls a tool with parsed JSON', async () => {
    const log = {};
    const mgr = new McpClientManager({ platformAccountsRepo: repoFor(), transportFactory: fakeTransportFactory(log) });

    const connected = await mgr.connect('u1', 'meta');
    expect(connected).toMatchObject({ connected: true, platform: 'meta' });

    const tools = await mgr.getTools('u1', 'meta');
    expect(tools).toMatchObject([{ name: 'get_ad_accounts', description: 'accounts' }]);

    const res = await mgr.callTool('u1', 'meta', 'echo', { a: 1 });
    expect(res).toEqual({ data: { echoed: { a: 1 } } });
    expect(log.spawns).toBe(1); // second use reuses the cached session
  });

  it('returns raw text when the tool result is not JSON', async () => {
    const mgr = new McpClientManager({ platformAccountsRepo: repoFor(), transportFactory: fakeTransportFactory() });
    const res = await mgr.callTool('u1', 'meta', 'other-tool');
    expect(res).toEqual({ data: 'plain-text-result' });
  });

  it('isolates tenants: one user never borrows another session', async () => {
    const log = {};
    const mgr = new McpClientManager({
      platformAccountsRepo: repoFor({ u1: 'tok-u1', u2: 'tok-u2' }),
      transportFactory: fakeTransportFactory(log),
    });

    await mgr.connect('u1', 'meta');
    await mgr.connect('u2', 'meta');

    expect(log.spawns).toBe(2);
    expect(mgr.getStatus('u1')).toEqual({ meta: { configured: true, connected: true } });
    expect(mgr.getStatus('ghost')).toEqual({ meta: { configured: false, connected: false } });
  });

  it('refuses unknown platforms and unbound accounts with clear errors', async () => {
    const mgr = new McpClientManager({ platformAccountsRepo: repoFor(), transportFactory: fakeTransportFactory() });

    await expect(mgr.connect('u1', 'tiktok')).rejects.toThrow('not supported');
    await expect(mgr.callTool('ghost', 'meta', 'echo')).rejects.toThrow('not connected');
    await expect(mgr.callTool('u1', 'meta', '')).rejects.toThrow('tool is required');
  });

  it('disconnect is idempotent and forces a fresh spawn next time', async () => {
    const log = {};
    const mgr = new McpClientManager({ platformAccountsRepo: repoFor(), transportFactory: fakeTransportFactory(log) });

    await mgr.connect('u1', 'meta');
    await mgr.disconnect('u1', 'meta');
    await mgr.disconnect('u1', 'meta'); // no client — must not throw
    expect(mgr.getStatus('u1')).toEqual({ meta: { configured: true, connected: false } });

    await mgr.getTools('u1', 'meta'); // lazy reconnect
    expect(log.spawns).toBe(2);
  });
});
