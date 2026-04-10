import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdspirerMcpClient } from '../../../server/services/adspirer-mcp-client.js';

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: class {
    constructor() {}
  },
}));

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: class {
    constructor() {
      this.connect = vi.fn().mockResolvedValue(undefined);
      this.close = vi.fn().mockResolvedValue(undefined);
      this.callTool = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: '{"ok":true}' }] });
      this.request = vi.fn().mockResolvedValue({ tools: [] });
    }
  },
}));

function makeRepo(overrides = {}) {
  return {
    findActiveByUserAndPlatform: vi.fn(),
    update: vi.fn(),
    ...overrides,
  };
}

function makeAccount(credsOverrides = {}) {
  const creds = {
    access_token: 'tok-abc',
    refresh_token: 'ref-xyz',
    expires_at: new Date(Date.now() + 3600 * 1000).toISOString(), // 1h in future
    ...credsOverrides,
  };
  return { id: 1, credentials: JSON.stringify(creds) };
}

describe('AdspirerMcpClient', () => {
  let repo;
  let mcpClient;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = makeRepo();
    mcpClient = new AdspirerMcpClient(repo);
  });

  describe('callTool', () => {
    it('throws "Adspirer not connected" when findActiveByUserAndPlatform returns null', async () => {
      repo.findActiveByUserAndPlatform.mockReturnValue(null);
      await expect(mcpClient.callTool('user1', 'echo_test')).rejects.toThrow(
        'Adspirer not connected. Visit Settings to connect.'
      );
    });

    it('calls _refreshToken when credentials.expires_at is 2 hours in the past', async () => {
      const expiredAccount = makeAccount({
        expires_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(), // 2h ago
      });

      // First call to findActiveByUserAndPlatform sees expired creds → triggers refresh
      // All subsequent calls return a fresh (non-expired) account
      const updatedAccount = makeAccount({ access_token: 'new-tok' });
      repo.findActiveByUserAndPlatform
        .mockReturnValueOnce(expiredAccount)  // first check in _getClient → expired
        .mockReturnValue(updatedAccount);     // recursive _getClient after refresh

      const refreshSpy = vi.spyOn(mcpClient, '_refreshToken').mockResolvedValue(undefined);

      await mcpClient.callTool('user1', 'echo_test');

      expect(refreshSpy).toHaveBeenCalledOnce();
    });

    it('returns parsed JSON when callTool returns JSON text', async () => {
      repo.findActiveByUserAndPlatform.mockReturnValue(makeAccount());
      const result = await mcpClient.callTool('user1', 'echo_test');
      expect(result).toEqual({ ok: true });
    });

    it('returns null when content is empty', async () => {
      repo.findActiveByUserAndPlatform.mockReturnValue(makeAccount());
      // Establish connection first
      await mcpClient.callTool('user1', 'echo_test');
      // Now override the cached client's callTool to return empty content
      const cached = mcpClient._clients.get('user1');
      cached.client.callTool.mockResolvedValueOnce({ content: [] });
      const result = await mcpClient.callTool('user1', 'echo_test');
      expect(result).toBeNull();
    });
  });

  describe('_refreshToken', () => {
    it('calls repo.update with new access_token and expires_at', async () => {
      const account = makeAccount();
      const creds = JSON.parse(account.credentials);

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'refreshed-tok',
          refresh_token: 'new-ref',
          expires_in: 3600,
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await mcpClient._refreshToken('user1', account, creds);

      expect(repo.update).toHaveBeenCalledOnce();
      const [id, patch] = repo.update.mock.calls[0];
      expect(id).toBe(1);
      const updatedCreds = JSON.parse(patch.credentials);
      expect(updatedCreds.access_token).toBe('refreshed-tok');
      expect(updatedCreds.refresh_token).toBe('new-ref');
      expect(updatedCreds.expires_at).toBeDefined();

      vi.unstubAllGlobals();
    });

    it('throws when no refresh_token is available', async () => {
      const account = makeAccount({ refresh_token: undefined });
      const creds = JSON.parse(account.credentials);
      await expect(mcpClient._refreshToken('user1', account, creds)).rejects.toThrow(
        'No refresh token available. Please reconnect Adspirer.'
      );
    });

    it('throws when token endpoint returns non-ok response', async () => {
      const account = makeAccount();
      const creds = JSON.parse(account.credentials);

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400 }));

      await expect(mcpClient._refreshToken('user1', account, creds)).rejects.toThrow(
        'Token refresh failed (400). Please reconnect Adspirer.'
      );

      vi.unstubAllGlobals();
    });
  });

  describe('listTools', () => {
    it('returns empty array when client.request returns { tools: [] }', async () => {
      repo.findActiveByUserAndPlatform.mockReturnValue(makeAccount());
      const tools = await mcpClient.listTools('user1');
      expect(tools).toEqual([]);
    });
  });

  describe('disconnect', () => {
    it('removes client from internal map', async () => {
      repo.findActiveByUserAndPlatform.mockReturnValue(makeAccount());
      // Establish a connection first
      await mcpClient.callTool('user1', 'echo_test');
      expect(mcpClient._clients.has('user1')).toBe(true);

      await mcpClient.disconnect('user1');
      expect(mcpClient._clients.has('user1')).toBe(false);
    });

    it('does not throw when userId has no cached client', async () => {
      await expect(mcpClient.disconnect('unknown-user')).resolves.not.toThrow();
    });
  });
});
