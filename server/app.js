import fs from 'fs';
import crypto from 'crypto';
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
import { resolveOwnerPlatformToken } from './lib/resolve-owner-platform.js';

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
        scriptSrc: ["'self'", "'unsafe-inline'", "https://static.cloudflareinsights.com", "https://www.googletagmanager.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "wss:", "ws:", "https://www.google-analytics.com", "https://analytics.google.com", "https://*.google-analytics.com", "https://stats.g.doubleclick.net", "https://www.google.com"],
      },
    },
  }));
  app.use(metricsMiddleware);
  app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));
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

  // NOTE: /webhook/telegram is handled locally by the Telegraf bot mounted in initBot()
  // (bot.webhookCallback('/webhook/telegram')). No upstream proxy — the previous
  // forward to config.hermesBotUrl (:8443) pointed at a non-existent service.

  // Audit log must be mounted BEFORE route handlers so all API mutations are recorded.
  const auditRepo = new AuditLogRepository(db);
  repos.auditRepo = auditRepo;
  app.use(auditLog(auditRepo));

  // Scalev payment callback — handled locally (no upstream proxy).
  // Signature: x-scalev-signature = HMAC-SHA256(hex) of the raw body.
  app.post('/api/payments/notify', async (req, res) => {
    const signature = req.headers['x-scalev-signature'];
    if (!signature) {
      return res.status(401).json({ error: 'Missing signature' });
    }
    const secret = config.scalevWebhookSecret;
    if (!secret) {
      log.error('SCALEV_WEBHOOK_SECRET not configured — rejecting Scalev payment webhook (fail-closed)');
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }
    const raw = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
    const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
    const provided = String(signature).replace(/^sha256=/, '');
    const valid = expected.length === provided.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
    if (!valid) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
    try {
      const body = req.body || {};
      const orderId = body.orderId || body.order_id;
      if (orderId) {
        const payment = repos.paymentsRepo.findByOrderId(orderId);
        if (payment) {
          const status = body.status || body.payment_status || payment.status;
          repos.paymentsRepo.updateStatus(payment.id, String(status));
        }
      }
      repos.webhookEventsRepo.create({
        source: 'scalev',
        eventType: body.type || 'payment',
        payload: body,
      });
      return res.status(200).json({ ok: true });
    } catch (err) {
      log.error('Scalev notify error', { error: err.message });
      return res.status(500).json({ error: 'Processing failed' });
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
    platformAccountsRepo: repos.platformAccountsRepo,
    settingsRepo: repos.settingsRepo,
  };

  return app;
}

export function startServices(app) {
  const log = createLogger('app');
  const { autonomousAgent, autoOptimizer, aiAgent, webhookProcessor, dataCleanup, fatigueDetector, capiMonitor, usersRepo, platformAccountsRepo, settingsRepo } = app.locals._services;

  autonomousAgent.runAutonomousMode();
  autoOptimizer.start();
  aiAgent.startScheduler(() => usersRepo.findAll().map(u => u.id));
  webhookProcessor.start();
  dataCleanup.start();
  fatigueDetector.start();
  // CAPI health checks Meta ad accounts (act_<id> or numeric id), not platform
  // user rows. Filter out UUIDs and seeded demo users to avoid Graph API 400s.
  // CAPI health checks each Meta ad account using its OWNER's token (multi-tenant).
  // platformAccountsRepo.getAccounts('meta') returns rows keyed by Meta ad account id
  // with user_id; resolveOwnerPlatformToken fetches that owner's bound Meta access token.
  capiMonitor.start(() => {
    const accounts = platformAccountsRepo.getAccounts('meta');
    return accounts
      .filter(a => a.platform === 'meta' && a.user_id)
      .map(a => ({
        accountId: a.id,
        token: resolveOwnerPlatformToken('meta', a.user_id, { platformAccountsRepo, settingsRepo }),
      }))
      .filter(x => x.token);
  });

  log.info('Background services started');
}
