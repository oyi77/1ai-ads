// MCP Integration Service — Mock/Stub for MVP
// Will be replaced with real MCP protocol when platform APIs are connected

export class MCPManager {
  constructor() {
    this.connected = false;
  }

  async connect(config) {
    this.connected = true;
    return { connected: true, version: '1.0.0' };
  }

  async listAccounts(platform) {
    return [
      { id: 'acc_1', name: 'Test Account', platform }
    ];
  }

  async getCampaigns(platform, accountId) {
    return [];
  }

  async disconnect() {
    this.connected = false;
  }
}

export const mcpManager = new MCPManager();
