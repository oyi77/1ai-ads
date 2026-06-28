import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env BEFORE any application imports — ESM hoists static imports
const { default: dotenv } = await import('dotenv');
dotenv.config({ path: join(__dirname, '.env') });

const { createDatabase } = await import('./db/index.js');
const { backupDatabase } = await import('./db/backup.js');
const { createApp, startServices } = await import('./server/app.js');
const { LLMClient } = await import('./server/services/llm-client.js');
const { MCPClientManager } = await import('./server/services/mcp-client.js');
const { seedDemoData } = await import('./db/seed.js');
const { default: config, validateConfig } = await import('./server/config/index.js');

// Validate required configuration before starting
validateConfig();

backupDatabase(config.dbPath, __dirname);

const db = createDatabase(config.dbPath);
// Seed demo data on first run (INSERT OR IGNORE deduplicates on re-seed)
// Uses OR IGNORE so it's safe in all environments
seedDemoData(db);

const llmClient = new LLMClient();
const mcpClient = new MCPClientManager();

const app = createApp({ db, llmClient, mcpClient });
const PORT = config.port;

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`1ai-ads running on ${PORT}`);
});

startServices(app);

// ── Real-time Meta Sync (every 15 minutes) ─────────────
{
  const { MetaAdsAPI } = await import('./server/services/meta/index.js');
  const syncInterval = 15 * 60 * 1000;

  async function syncFromMeta() {
    try {
      const metaApi = new MetaAdsAPI(app.locals.settingsRepo);
      const campaignsRepo = app.locals.campaignsRepo;
      if (!campaignsRepo) return;
      const accounts = await metaApi.getAdAccounts();
      if (!accounts || accounts.length === 0) return;
      let total = 0;
      for (const account of accounts) {
        try {
          const campaigns = await metaApi.getCampaigns(account.id);
          const insightsMap = campaigns.length > 0
            ? await metaApi.getMultiCampaignInsights(campaigns.map(c => c.id))
            : {};
          for (const c of campaigns) {
            const ins = insightsMap[c.id] || {};
            const spendVal = parseFloat(ins.spend || 0);
            const revenueVal = parseFloat(ins.revenue || 0);
            campaignsRepo.upsert({
              platform: 'meta', campaign_id: c.id, name: c.name, status: c.status,
              budget: c.dailyBudget || c.lifetimeBudget || 0,
              spend: spendVal, revenue: revenueVal,
              impressions: parseInt(ins.impressions || 0), clicks: parseInt(ins.clicks || 0),
              conversions: parseInt(ins.conversions || 0),
              roas: spendVal > 0 ? Math.round((revenueVal / spendVal) * 100) / 100 : 0,
            });
            total++;
          }
        } catch (err) {
          console.error('[auto-sync] Account error:', account.id, err.message);
        }
      }
      console.log('[auto-sync] Synced ' + total + ' campaigns from ' + accounts.length + ' accounts');
    } catch (err) {
      console.error('[auto-sync] Sync failed:', err.message);
    }
  }

  setTimeout(syncFromMeta, 30000);
  setInterval(syncFromMeta, syncInterval);
  console.log('[auto-sync] Real-time Meta sync enabled (every 15 min)');

  // Start WebSocket realtime polling
  if (app.locals.realtimeService) {
    app.locals.realtimeService.attach(server);
    app.locals.realtimeService.startPolling();
    console.log('[realtime] WebSocket server started on /ws/realtime');
  }
}

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
