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

// Server-rendered legal pages (Meta/Google review crawlers need real text).
function legalPage(page) {
  const base = 'https://adforge.aitradepulse.com';
  const shell = (title, body) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title} — AdForge</title><style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.6;color:#1f2328;max-width:760px;margin:0 auto;padding:32px 20px;}h1{font-size:1.6em;border-bottom:2px solid #00a884;padding-bottom:8px;}h2{font-size:1.2em;margin-top:24px;color:#00a884;}p,li{margin:8px 0;}a{color:#00a884;}small{color:#656d76;}footer{margin-top:40px;border-top:1px solid #d8dee4;padding-top:12px;}</style></head><body>${body}</body></html>`;

  if (page === 'privacy') {
    return shell('Privacy Policy', `
      <h1>Privacy Policy</h1>
      <small>Last updated: 2026-08-31</small>
      <p>AdForge ("Adforge", "we") is a multi-platform ad management tool that helps businesses manage their Meta (Facebook/Instagram) advertising from a Telegram bot and web dashboard. This policy explains what data we access, how we use it, and your rights.</p>
      <h2>1. Data We Collect</h2>
      <p>We access, through your explicit OAuth authorization, the following data from your Meta account:</p>
      <ul><li>Ad accounts you connect and their campaigns, ad sets, and ads</li><li>Campaign performance data (spend, impressions, clicks, conversions, ROAS)</li><li>Facebook Pages you manage (for creating ad creatives)</li><li>Your Telegram user ID (used to identify you and deliver bot messages)</li></ul>
      <h2>2. How We Use Data</h2>
      <p>Your data is used solely to provide the features you request:</p>
      <ul><li>Displaying dashboards and performance reports</li><li>Executing your commands (create, pause, resume, scale campaigns)</li><li>Running automation rules you configure</li><li>Sending notifications to your Telegram account</li></ul>
      <h2>3. Data Storage &amp; Security</h2>
      <ul><li>Access tokens are encrypted at rest (AES-256) and never exposed in plain text</li><li>All data is stored per-user and scoped so no user can access another user's data</li><li>We do not sell, rent, or share your data with third parties</li></ul>
      <h2>4. Data Deletion</h2>
      <p>You can delete your account and all associated data at any time. To request deletion, contact us via Telegram (<a href="https://t.me/vilonaaiadsbot">@vilonaaiadsbot</a>) or email, and we will remove your data within 30 days. See our <a href="${base}/data-deletion-status">Data Deletion Status</a> page for the deletion callback.</p>
      <h2>5. Your Rights</h2>
      <p>You may request access, correction, or deletion of your personal data at any time. You may also revoke AdForge's access to your Meta account at any time via your Facebook Settings → Apps and websites.</p>
      <h2>6. Contact</h2>
      <p>Questions or requests: <a href="mailto:privacy@berkahkarya.org">privacy@berkahkarya.org</a> or Telegram <a href="https://t.me/vilonaaiadsbot">@vilonaaiadsbot</a>.</p>
    `);
  }

  if (page === 'terms') {
    return shell('Terms of Service', `
      <h1>Terms of Service</h1>
      <small>Last updated: 2026-08-31</small>
      <p>By using AdForge, you agree to these terms.</p>
      <h2>1. Service</h2>
      <p>AdForge provides ad management via a Telegram bot and web dashboard. You must own or have authorization to manage the ad accounts and Pages you connect.</p>
      <h2>2. Your Responsibility</h2>
      <p>You are responsible for the content of your ads and for complying with Meta's Advertising Policies and applicable law. AdForge is a management tool and does not guarantee ad performance.</p>
      <h2>3. No Warranty</h2>
      <p>The service is provided "as is" without warranty of any kind. AdForge is not liable for ad spend, lost revenue, or any indirect damages.</p>
      <h2>4. Termination</h2>
      <p>You may stop using the service at any time. We may suspend accounts that violate these terms.</p>
      <h2>5. Contact</h2>
      <p><a href="mailto:privacy@berkahkarya.org">privacy@berkahkarya.org</a> / Telegram <a href="https://t.me/vilonaaiadsbot">@vilonaaiadsbot</a></p>
    `);
  }

  // data-deletion-status
  return shell('Data Deletion Status', `
    <h1>Data Deletion Request</h1>
    <p>AdForge supports user data deletion in accordance with Meta and Google platform policies.</p>
    <h2>How to Request Deletion</h2>
    <ol><li>Send us a message via Telegram (<a href="https://t.me/vilonaaiadsbot">@vilonaaiadsbot</a>) or email <a href="mailto:privacy@berkahkarya.org">privacy@berkahkarya.org</a>.</li><li>Include your account identifier (Telegram username or connected email).</li><li>We will delete your account and all associated data within 30 days.</li></ol>
    <h2>Confirmation</h2>
    <p>Once processed, you will receive a confirmation. This page is also the callback target for platform-initiated data deletion requests.</p>
    <p><a href="${base}/privacy">Privacy Policy</a> · <a href="${base}/terms">Terms of Service</a></p>
  `);
}

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

  // Correlation ID middleware — extract or generate X-Correlation-ID
  app.use((req, res, next) => {
    const corrId = req.headers['x-correlation-id'] || crypto.randomUUID();
    req.correlationId = corrId;
    res.setHeader('X-Correlation-ID', corrId);
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
      // Primary path: normalized event forwarded by the 1ai-payment service
      // (X-Payment-Signature = HMAC-SHA256 of raw body with our merchant webhook secret).
      const forwarded = await services.paymentService.processPaymentCallback(
        req.rawBody || Buffer.from(JSON.stringify(body)),
        req.headers['x-payment-signature'],
      );
      if (forwarded) {
        if (!forwarded.success && forwarded.status) {
          return res.status(forwarded.status).json({ error: forwarded.error });
        }
        repos.webhookEventsRepo.create({
          source: '1ai-payment',
          eventType: body.event || body.status || 'payment',
          payload: body,
        });
        return res.status(200).json({ ok: true });
      }

      // Legacy direct-Scalev callback (x-scalev-signature).
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
      log.error('Payment notify error', { error: err.message });
      return res.status(500).json({ error: 'Processing failed' });
    }
  });

  app.post('/api/webhooks/video-complete', (req, res) => {
    const signature = req.headers['x-webhook-signature'];
    if (!signature) {
      return res.status(401).json({ error: 'Missing signature' });
    }
    const secret = config.webhookSecret || config.scalevWebhookSecret;
    if (!secret) {
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

  // Server-rendered legal pages — Meta/Google review crawlers must see real
  // policy text (the SPA shell alone fails review), and /data-deletion-status
  // is the callback target for both facebook and google deauthorize endpoints.
  app.get(['/privacy', '/terms', '/data-deletion-status'], (req, res) => {
    const page = req.path.replace('/', '');
    const html = legalPage(page);
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  });



  createRouters({ app, repos, services });

  // Initialize Telegram bot (if TELEGRAM_BOT_TOKEN is set)
  const bot = initBot(app, { repos, services });
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
    alertingService: services.alertingService,
    usersRepo: repos.usersRepo,
    platformAccountsRepo: repos.platformAccountsRepo,
    settingsRepo: repos.settingsRepo,
    bot,
  };

  return app;
}

export function startServices(app) {
  const log = createLogger('app');
  const { autonomousAgent, autoOptimizer, aiAgent, webhookProcessor, dataCleanup, fatigueDetector, capiMonitor, alertingService, usersRepo, platformAccountsRepo, settingsRepo, bot } = app.locals._services;

  // Initialize alerting service with bot for notifications
  if (alertingService && bot) {
    alertingService.bot = bot;
    log.info('Alerting service initialized with bot');
  }

  autonomousAgent.runAutonomousMode();
  autoOptimizer.start();
  aiAgent.startScheduler(() => usersRepo.findAll().map(u => u.id));
  webhookProcessor.start();
  dataCleanup.start();
  fatigueDetector.start();
  // CAPI health checks each Meta AD ACCOUNT (act_<id> / numeric id) using its
  // OWNER's bound token (multi-tenant). The real Meta node id is stored in
  // credentials.ad_account_id — NOT platform_accounts.id (an internal UUID).
  // Passing the internal UUID to the Graph API is what produced the repeated
  // `Object with ID '<uuid>' does not exist` 400s. Skip rows with no
  // ad_account_id and seeded demo rows (demo-meta-token-*) which aren't real
  // Meta accounts.
  capiMonitor.start(() => {
    const accounts = platformAccountsRepo.getAccounts('meta');
    return accounts
      .filter(a => a.platform === 'meta' && a.user_id && a.is_active !== 0 && a.credentials?.ad_account_id)
      .map(a => {
        const raw = String(a.credentials.ad_account_id);
        const accountId = raw.startsWith('act_') ? raw : `act_${raw}`;
        const token = resolveOwnerPlatformToken('meta', a.user_id, { platformAccountsRepo, settingsRepo });
        // Skip placeholder/demo tokens (e.g. demo-meta-token-*) — not real
        // Meta connections, so their Graph calls always 400 with bad-token.
        if (!token || /^(demo|test|fake|placeholder)/i.test(token)) return null;
        return { accountId, token };
      })
      .filter(Boolean);
  });

  log.info('Background services started');
}
