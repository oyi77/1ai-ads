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
const { createLogger } = await import('./server/lib/logger.js');
const log = createLogger('server');
const syncLog = createLogger('auto-sync');
const llmClient = new LLMClient();
const { seedDemoData } = await import('./db/seed.js');
const { default: config, validateConfig } = await import('./server/config/index.js');

// Validate required configuration before starting
validateConfig();

backupDatabase(config.dbPath, __dirname);

const db = createDatabase(config.dbPath);
// Seed demo data for non-production environments only
if (process.env.NODE_ENV !== 'production') {
  seedDemoData(db);
}

const app = createApp({ db, llmClient });

const PORT = config.port;

const server = app.listen(PORT, '0.0.0.0', () => {
  log.info(`1ai-ads running on ${PORT}`);
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
          syncLog.error('Account sync error', { account: account.id, error: err.message });
        }
      }
      syncLog.info(`Synced ${total} campaigns from ${accounts.length} accounts`);
    } catch (err) {
      syncLog.error('Sync failed', { error: err.message });
    }
  }

  setTimeout(syncFromMeta, 30000);
  setInterval(syncFromMeta, syncInterval);
  syncLog.info('Real-time Meta sync enabled (every 15 min)');

  // Start WebSocket realtime polling
  if (app.locals.realtimeService) {
    app.locals.realtimeService.attach(server);
    app.locals.realtimeService.startPolling();
    log.info('WebSocket server started on /ws/realtime');
  }
}

process.on('SIGTERM', () => {
  log.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    log.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  log.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    log.info('Server closed');
    process.exit(0);
  });
});
