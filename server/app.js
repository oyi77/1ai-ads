import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import config from './config/index.js';
import { createLogger } from './lib/logger.js';
import { createRepositories } from './app/repositories.js';
import { createServices } from './app/services.js';
import { createRouters } from './app/routers.js';
import helmet from 'helmet';
import { auditLog } from './middleware/audit.js';
import { AuditLogRepository } from './repositories/audit-log.js';
import { getMetricsText, metricsMiddleware } from './lib/metrics.js';
import { initBot } from './bot/index.js';

// ── Sentry (optional, env-gated) ──────────────────────
if (process.env.SENTRY_DSN) {
  try {
    const Sentry = await import('@sentry/node');
    Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV || 'development' });
  } catch { /* @sentry/node not installed — skip */ }
}

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

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://static.cloudflareinsights.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "wss:", "ws:"],
      },
    },
  }));
  app.use(metricsMiddleware);
  app.use(express.json());
  app.use(cookieParser());

  // EJS template engine for server-rendered dashboard pages
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  // Serve dashboard static assets (CSS, JS, images)
  app.use('/css', express.static(path.join(__dirname, 'public/css')));
  app.use('/js', express.static(path.join(__dirname, 'public/js')));
  app.use('/img', express.static(path.join(__dirname, 'public/img')));

  const clientPath = path.join(process.cwd(), 'dist');
  app.use(express.static(clientPath));

  // Proxy webhooks BEFORE API routers (must run before createRouters)
  
  // Proxy Telegram webhook requests to Hermes bot (port 8443)
  app.use('/webhook', async (req, res) => {
    try {
      const targetUrl = `${config.hermesBotUrl}${req.originalUrl}`;
      const response = await fetch(targetUrl, {
        method: req.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
        signal: AbortSignal.timeout(30000),
      });
      const responseBody = await response.arrayBuffer();
      res.status(response.status).send(Buffer.from(responseBody));
    } catch (err) {
      log.error('Webhook proxy error', err.message);
      if (!res.headersSent) res.status(502).json({ error: 'webhook proxy failed' });
    }
  });

  // Proxy Scalev payment callback → Hermes bot (port 8443)
  // Cloudflare WAF blocks unknown POST paths; use a standard-looking path
  app.post('/api/payments/notify', async (req, res) => {
    const signature = req.headers['x-scalev-signature'];
    if (!signature) {
      return res.status(401).json({ error: 'Missing signature' });
    }
    try {
      const targetUrl = `${config.hermesBotUrl}/webhook/scalev`;
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Scalev-Signature': signature,
        },
        body: JSON.stringify(req.body),
        signal: AbortSignal.timeout(30000),
      });
      const responseBody = await response.arrayBuffer();
      res.status(response.status).send(Buffer.from(responseBody));
    } catch (err) {
      log.error('Scalev proxy error', err.message);
      if (!res.headersSent) res.status(502).json({ error: 'proxy failed' });
    }
  });

  app.post('/api/webhooks/video-complete', (req, res) => {
    const { jobId, status, videoUrl, thumbnailUrl } = req.body;
    log.info('Video completion webhook received', { jobId, status, videoUrl });
    if (status === 'completed' && videoUrl) {
      app.locals.pendingVideos = app.locals.pendingVideos || {};
      app.locals.pendingVideos[jobId] = { videoUrl, thumbnailUrl, receivedAt: Date.now() };
    }
    res.json({ received: true });
  });

  // ── Prometheus Metrics ──────────────────────────────────────
  app.get('/metrics', (_req, res) => {
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(getMetricsText());
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });



  const auditRepo = new AuditLogRepository(db);
  repos.auditRepo = auditRepo;
  app.use(auditLog(auditRepo));

  createRouters({ app, repos, services });

  // Initialize Telegram bot (if TELEGRAM_BOT_TOKEN is set)
  initBot(app, { repos, services });

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

  app.locals.realtimeService = services.realtimeService;
  app.locals._services = {
    autonomousAgent: services.autonomousAgent,
    autoOptimizer: services.autoOptimizer,
    aiAgent: services.aiAgent,
    webhookProcessor: services.webhookProcessor,
    dataCleanup: services.dataCleanup,
    fatigueDetector: services.fatigueDetector,
    capiMonitor: services.capiMonitor,
    usersRepo: repos.usersRepo,
  };

  return app;
}

export function startServices(app) {
  const log = createLogger('app');
  const { autonomousAgent, autoOptimizer, aiAgent, webhookProcessor, dataCleanup, fatigueDetector, capiMonitor, usersRepo } = app.locals._services;

  autonomousAgent.runAutonomousMode();
  autoOptimizer.start();
  aiAgent.startScheduler(() => usersRepo.findAll().map(u => u.id));
  webhookProcessor.start();
  dataCleanup.start();
  fatigueDetector.start();
  capiMonitor.start(() => usersRepo.findAll().map(u => u.id));

  log.info('Background services started');
}
