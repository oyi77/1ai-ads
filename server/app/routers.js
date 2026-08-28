import fs from 'fs';
import path from 'path';
import config from '../config/index.js';
import rateLimit from 'express-rate-limit';
import { createTrackRouter } from '../routes/track.js';
import { requireAuth } from '../middleware/auth.js';

// ── Group Wrappers ──────────────────────────────────────────────
import { createPagesGroupRouter } from '../routes/_pages.js';
import { createAuthGroupRouter } from '../routes/_auth.js';
import { createSettingsGroupRouter } from '../routes/_settings.js';
import { createCampaignsGroupRouter } from '../routes/_campaigns.js';
import { createPlatformsGroupRouter } from '../routes/_platforms.js';
import { createCreativeGroupRouter } from '../routes/_creative.js';
import { createAiGroupRouter } from '../routes/_ai.js';
import { createReportingGroupRouter } from '../routes/_reporting.js';
import { createAutomationGroupRouter } from '../routes/_automation.js';
import { createMcpGroupRouter } from '../routes/_mcp.js';
import { createPaymentsWebhookRouter } from '../routes/webhooks-payments.js';
import { createWebhookRouter } from '../routes/webhooks.js';
import { createUserWebhookRouter } from '../routes/webhooks-user.js';
import { createApiKeysRouter } from '../routes/api-keys.js';
import { createMetaAppRouter } from '../routes/meta-app.js';
import { createApprovalsRouter } from '../routes/approvals.js';
import { createTeamRouter } from '../routes/team.js';
import { createUsageRouter } from '../routes/usage.js';
import { createOAuthRouter } from '../routes/oauth.js';
import { createMilestonesRouter } from '../routes/milestones.js';
import { createWhatsappIntelligenceGroupRouter } from '../routes/_whatsapp-intelligence.js';
import { createBoostRouter } from '../routes/boost.js';
import { handleListMetaAccounts } from '../routes/_handlers/settings-handlers.js';
export function createRouters({ app, repos, services }) {
  const publicRateLimit = rateLimit({
    windowMs: config.rateLimitWindowMs,
    max: config.rateLimitMax,
    message: { success: false, error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false },
  });

  const mcpClient = services.mcpClient;

  const deps = { repos, services, publicRateLimit, mcpClient };

  // ── Server-Rendered Dashboard Pages (BEFORE API routes) ───
  // Only serve EJS pages when React SPA dist doesn't exist.
  // When dist/index.html exists, the SPA handles all non-API routes.
  const spaIndexPath = path.join(process.cwd(), 'dist', 'index.html');
  const spaExists = fs.existsSync(spaIndexPath);

  if (!spaExists) {
    app.use('/', createPagesGroupRouter());
  }

  // ── Auth & Core ──────────────────────────────────────────────
  app.use('/api', createAuthGroupRouter(deps));
  app.use('/api', createSettingsGroupRouter(deps));

  // ── Campaigns & Ads ──────────────────────────────────────────
  app.use('/api', createCampaignsGroupRouter(deps));

  // ── Platform Integrations ────────────────────────────────────
  app.use('/api', createPlatformsGroupRouter(deps));

  // ── Intelligence & Research + Creative Suite ─────────────────
  app.use('/api', createCreativeGroupRouter(deps));
  app.use('/api', createAiGroupRouter(deps));

  // ── Reporting & Analytics ────────────────────────────────────
  app.use('/api', createReportingGroupRouter(deps));

  // ── Operations & Automation ──────────────────────────────────
  app.use('/api', createAutomationGroupRouter(deps));

  // ── E-commerce & Payments ────────────────────────────────────
  // (settings group already includes payments)

  // ── Infrastructure ───────────────────────────────────────────
  app.use('/api', createMcpGroupRouter(deps));

  // ── API Keys (customer self-serve) ────────────────────────
  app.use('/api/api-keys', requireAuth, createApiKeysRouter(repos.paymentsRepo));
  // ── Team (customer self-serve) ────────────────────────────
  app.use('/api/team', requireAuth, createTeamRouter(repos.paymentsRepo, repos.usersRepo, services.mailer));

  // ── OAuth (platform connections) ──────────────────────────
  app.use('/api/oauth', requireAuth, createOAuthRouter(repos.settingsRepo, repos.platformAccountsRepo));

  // ── Usage Meters (customer self-serve) ────────────────────
  app.use('/api/usage', requireAuth, createUsageRouter(repos.paymentsRepo));

  // ── Milestones (customer self-serve) ──────────────────────
  app.use('/api/milestones', requireAuth, createMilestonesRouter(repos.paymentsRepo));
  // ── Boost Recommendations ────────────────────────────────────
  app.use('/api/boost', createBoostRouter({ services }));
  // ── Per-user Meta ad-accounts (Saved Audiences builder) ──
  app.use('/api/meta/accounts', requireAuth, handleListMetaAccounts(repos.settingsRepo));
  // ── WhatsApp Intelligence ─────────────────────────────────────
  app.use('/', createWhatsappIntelligenceGroupRouter(deps));
  // ── Meta webhook (public, no auth) ───────────────────────
  app.use('/webhooks', createWebhookRouter(repos.webhookEventsRepo));
  // ── Payment webhook (public, signature verified) ─────────
  app.use('/api/payments/notify', createPaymentsWebhookRouter(services.paymentService));
  // ── Per-user Meta webhook (verify token = userId, signed w/ user app_secret) ──
  app.use('/webhooks/u', createUserWebhookRouter(repos.userMetaAppsRepo));
  // ── Per-user Meta App Creds (REST) ──────────────────────────
  app.use('/api/meta-app', createMetaAppRouter(repos.userMetaAppsRepo));

  // ── Tracking (public) ────────────────────────────────────────
  app.use('/t', createTrackRouter(repos.adUtmMapRepo, services.utmTagger));

  // ── Approvals (API + server-rendered page; works even with SPA present) ──
  app.use('/', createApprovalsRouter({ repos, services }));
}