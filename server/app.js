import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import config from './config/index.js';
import { createLogger } from './lib/logger.js';
import { createRepositories } from './app/repositories.js';
import { createServices } from './app/services.js';
import { createRouters } from './app/routers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp(params) {
  const log = createLogger('app');
  const db = params && typeof params === 'object' && params.db ? params.db : params;

  const repos = createRepositories(db);
  repos.db = db;

  const services = createServices({ db, repos, params });

  const app = express();

  app.locals.usersRepo = repos.usersRepo;
  app.locals.settingsRepo = repos.settingsRepo;
  app.locals.campaignsRepo = repos.campaignsRepo;
  app.locals.rulesRepo = repos.rulesRepo;
  app.locals.platformAccountsRepo = repos.platformAccountsRepo;
  app.locals.adResearchService = services.adResearchService;
  app.locals.db = db;

  // Trust proxy for correct req.protocol behind Cloudflare/nginx
  app.set('trust proxy', 1);

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (config.nodeEnv === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  app.use(cors({
    origin: config.corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));

  app.use(express.json());

  const clientPath = path.join(process.cwd(), 'dist');
  app.use(express.static(clientPath));

  createRouters({ app, repos, services });

  app.post('/api/webhooks/video-complete', (req, res) => {
    const { jobId, status, videoUrl, thumbnailUrl } = req.body;
    log.info('Video completion webhook received', { jobId, status, videoUrl });
    if (status === 'completed' && videoUrl) {
      app.locals.pendingVideos = app.locals.pendingVideos || {};
      app.locals.pendingVideos[jobId] = { videoUrl, thumbnailUrl, receivedAt: Date.now() };
    }
    res.json({ received: true });
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use((req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/assets') || req.path.startsWith('/t/') || req.path.startsWith('/favicon.ico')) {
      return next();
    }
    const indexPath = path.join(clientPath, 'index.html');
    fs.readFile(indexPath, 'utf8', (err, data) => {
      if (err) {
        log.error('Failed to read index.html', { error: err.message });
        return res.status(500).send('Internal Server Error');
      }
      res.set('Content-Type', 'text/html');
      res.send(data);
    });
  });

  app.use((err, req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    log.error('Request error', { timestamp: new Date().toISOString(), method: req.method, path: req.path, status, error: err.message });
    if (status >= 500) log.error('Server error stack', { stack: err.stack });
    res.status(status).json({ success: false, error: config.nodeEnv === 'production' ? 'Internal Server Error' : err.message });
  });

  app.locals._services = {
    autonomousAgent: services.autonomousAgent,
    autoOptimizer: services.autoOptimizer,
    aiAgent: services.aiAgent,
    webhookProcessor: services.webhookProcessor,
    dataCleanup: services.dataCleanup,
    usersRepo: repos.usersRepo,
  };

  return app;
}

export function startServices(app) {
  const log = createLogger('app');
  const { autonomousAgent, autoOptimizer, aiAgent, webhookProcessor, dataCleanup, usersRepo } = app.locals._services;

  autonomousAgent.runAutonomousMode();
  autoOptimizer.start();
  aiAgent.startScheduler(() => usersRepo.findAll().map(u => u.id));
  webhookProcessor.start();
  dataCleanup.start();

  log.info('Background services started');
}
