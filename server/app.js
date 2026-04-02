import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { AdsRepository } from './repositories/ads.js';
import { LandingRepository } from './repositories/landing.js';
import { CampaignsRepository } from './repositories/campaigns.js';
import { UsersRepository } from './repositories/users.js';
import { SettingsRepository } from './repositories/settings.js';
import { AdGenerator } from './services/ad-generator.js';
import { LandingGenerator } from './services/landing-generator.js';
import { MCPClientManager } from './services/mcp-client.js';
import { hashPassword, verifyPassword, generateToken } from './lib/auth.js';
import { requireAuth } from './middleware/auth.js';
import { createAdsRouter } from './routes/ads.js';
import { createLandingRouter } from './routes/landing.js';
import { createAnalyticsRouter } from './routes/analytics.js';
import { createMcpRouter } from './routes/mcp.js';
import { createSettingsRouter } from './routes/settings.js';
import { createResearchRouter } from './routes/research.js';
import { AdResearchService } from './services/ad-research.js';
import { ScalevService } from './services/scalev.js';
import { createScalevRouter } from './routes/scalev.js';
import { MetaAdsAPI } from './services/meta-api.js';
import { createMetaRouter } from './routes/meta.js';
import { TikTokAdsAPI } from './services/tiktok-api.js';
import { GoogleAdsAPI } from './services/google-ads-api.js';
import { createPlatformsRouter } from './routes/platforms.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createApp({ db, llmClient, mcpClient } = {}) {
  const app = express();

  app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
  app.use(express.json({ limit: '2mb' }));

  // Repositories
  const adsRepo = new AdsRepository(db);
  const landingRepo = new LandingRepository(db);
  const campaignsRepo = new CampaignsRepository(db);
  const usersRepo = new UsersRepository(db);
  const settingsRepo = new SettingsRepository(db);

  // Services
  const adGenerator = new AdGenerator(llmClient);
  const landingGenerator = new LandingGenerator(llmClient);
  const mcp = mcpClient || new MCPClientManager();

  // --- Auth routes (public) ---
  app.post('/api/auth/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'username and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
    }
    const existing = usersRepo.findByUsername(username);
    if (existing) {
      return res.status(409).json({ success: false, error: 'Username already exists' });
    }
    const id = usersRepo.create({ username, password_hash: hashPassword(password) });
    const token = generateToken({ id, username });
    res.json({ success: true, data: { id, username, token } });
  });

  app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'username and password are required' });
    }
    const user = usersRepo.findByUsername(username);
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ success: false, error: 'Invalid username or password' });
    }
    const token = generateToken({ id: user.id, username: user.username });
    res.json({ success: true, data: { id: user.id, username: user.username, token } });
  });

  // --- Protected routes ---
  app.use('/api/ads', requireAuth, createAdsRouter(adsRepo, adGenerator));
  app.use('/api/landing', requireAuth, createLandingRouter(landingRepo, landingGenerator));
  app.use('/api/analytics', requireAuth, createAnalyticsRouter(campaignsRepo));
  app.use('/api/mcp', requireAuth, createMcpRouter(mcp, settingsRepo, campaignsRepo));
  app.use('/api/settings', requireAuth, createSettingsRouter(settingsRepo));
  const scalevService = new ScalevService(settingsRepo);
  app.use('/api/research', requireAuth, createResearchRouter(new AdResearchService(settingsRepo)));
  app.use('/api/scalev', requireAuth, createScalevRouter(scalevService));
  const metaApi = new MetaAdsAPI(settingsRepo);
  const tiktokApi = new TikTokAdsAPI(settingsRepo);
  const googleApi = new GoogleAdsAPI(settingsRepo);
  app.use('/api/meta', requireAuth, createMetaRouter(metaApi, campaignsRepo));
  app.use('/api/platforms', requireAuth, createPlatformsRouter({ meta: metaApi, tiktok: tiktokApi, google: googleApi }, campaignsRepo));

  // Scalev webhook (public - no auth, called by Scalev servers)
  app.post('/api/webhooks/scalev', express.json(), (req, res) => {
    console.log('Scalev webhook:', JSON.stringify(req.body).substring(0, 200));
    res.json({ success: true });
  });

  // Serve static files in production
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(join(__dirname, '../dist')));
  }

  // Global error handler
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ success: false, error: 'Invalid JSON in request body' });
    }
    console.error('Unhandled error:', err.message);
    res.status(err.status || 500).json({ success: false, error: err.message || 'Internal server error' });
  });

  return app;
}
