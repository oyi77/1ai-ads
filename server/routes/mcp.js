import { Router } from 'express';
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createAdForgeMCPServer } from '../services/mcp-server.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('mcp');

export function createMcpRouter(mcpClient, settingsRepo, campaignsRepo, adsRepo, landingRepo) {
  const router = Router();

  const mcpServer = createAdForgeMCPServer(campaignsRepo, landingRepo, adsRepo);
  // Per-user transport map prevents concurrent connections from overwriting each other
  const sseTransports = new Map();

  router.get('/sse', async (req, res) => {
    const userId = req.user.id;
    log.info('New SSE connection request', { userId });
    const transport = new SSEServerTransport("/api/mcp/messages", res);
    sseTransports.set(userId, transport);
    res.on('close', () => sseTransports.delete(userId));
    await mcpServer.connect(transport);
  });

  router.post('/messages', async (req, res) => {
    const userId = req.user.id;
    const transport = sseTransports.get(userId);
    if (transport) {
      await transport.handlePostMessage(req, res);
    } else {
      res.status(400).json({ error: "No active SSE transport" });
    }
  });

  router.get('/status', (req, res) => {
    const status = mcpClient.getStatus();
    res.json({ success: true, data: status });
  });

  // Connect to a platform's MCP server
  router.post('/connect', async (req, res) => {
    const { platform } = req.body;
    if (!platform) {
      return res.status(400).json({ success: false, error: 'platform is required' });
    }

    // Get stored credentials
    const credentials = settingsRepo.getCredentials(platform);
    if (!credentials) {
      return res.status(400).json({
        success: false,
        error: `No credentials configured for ${platform}. Go to Settings to add them.`
      });
    }

    try {
      const result = await mcpClient.connect(platform, credentials);
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Disconnect from a platform
  router.post('/disconnect', async (req, res) => {
    const { platform } = req.body;
    if (!platform) {
      return res.status(400).json({ success: false, error: 'platform is required' });
    }

    await mcpClient.disconnect(platform);
    res.json({ success: true, data: { message: `Disconnected from ${platform}` } });
  });

  // List available tools for a connected platform
  router.get('/tools/:platform', (req, res) => {
    const tools = mcpClient.getTools(req.params.platform);
    res.json({ success: true, data: tools });
  });

  // Call an MCP tool
  router.post('/call', async (req, res) => {
    const { platform, tool, arguments: args } = req.body;
    if (!platform || !tool) {
      return res.status(400).json({ success: false, error: 'platform and tool are required' });
    }

    try {
      const result = await mcpClient.callTool(platform, tool, args || {});
      res.json({ success: true, data: result.data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get ad accounts for a connected platform
  router.get('/accounts/:platform', async (req, res) => {
    const { platform } = req.params;
    const toolName = platform === 'meta' ? 'get_ad_accounts' : 'list_accounts';

    try {
      const result = await mcpClient.callTool(platform, toolName, {});
      res.json({ success: true, data: result.data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Sync campaigns from a connected platform
  router.post('/sync/:platform', async (req, res) => {
    const { platform } = req.params;
    const { account_id } = req.body;

    if (!account_id) {
      return res.status(400).json({ success: false, error: 'account_id is required' });
    }

    try {
      // Get campaigns
      const campaignsTool = platform === 'meta' ? 'get_campaigns' : 'get_campaign_performance';
      const campaignsResult = await mcpClient.callTool(platform, campaignsTool, {
        account_id,
        ...(platform === 'meta' && { status: ['ACTIVE', 'PAUSED'] }),
      });

      // Get insights if meta
      let insightsData = null;
      if (platform === 'meta') {
        try {
          const insightsResult = await mcpClient.callTool(platform, 'get_insights', {
            object_id: account_id,
            object_type: 'account',
            date_preset: 'last_30d',
            metrics: ['impressions', 'clicks', 'spend', 'ctr', 'cpc', 'conversions'],
          });
          insightsData = insightsResult.data;
        } catch {}
      }

      // Persist campaigns to local database
      const campaigns = Array.isArray(campaignsResult.data) ? campaignsResult.data : (campaignsResult.data?.data || []);
      let synced = 0;

      for (const camp of campaigns) {
        // Normalize field names across platforms
        const normalized = {
          platform,
          campaign_id: camp.id || camp.campaign_id || `${platform}_${synced}`,
          name: camp.name || camp.campaign_name || 'Unnamed',
          status: (camp.status || camp.effective_status || 'unknown').toLowerCase(),
          budget: parseFloat(camp.daily_budget || camp.budget || 0),
          spend: parseFloat(camp.spend || camp.cost || 0),
          revenue: parseFloat(camp.revenue || camp.purchase_value || 0),
          impressions: parseInt(camp.impressions || 0),
          clicks: parseInt(camp.clicks || 0),
          conversions: parseInt(camp.conversions || camp.actions?.length || 0),
          roas: parseFloat(camp.roas || (camp.spend > 0 ? (camp.revenue || 0) / camp.spend : 0)),
        };

        campaignsRepo.upsert(normalized);
        synced++;
      }

      res.json({
        success: true,
        data: {
          synced,
          campaigns: campaigns.length,
          insights: insightsData,
          synced_at: new Date().toISOString(),
        }
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
