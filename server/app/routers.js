import fs from 'fs';
import path from 'path';
import config from '../config/index.js';
import rateLimit from 'express-rate-limit';
import { createTrackRouter } from '../routes/track.js';


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
import { createBoostRouter } from '../routes/boost.js';
import { createWebhookRouter } from '../routes/webhooks.js';
import { createWhatsappIntelligenceGroupRouter } from '../routes/_whatsapp-intelligence.js';
import { createApprovalsRouter } from '../routes/approvals.js';

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

  // ── Boost Recommendations ────────────────────────────────────
  app.use('/api/boost', createBoostRouter(deps));

  // ── WhatsApp Intelligence ─────────────────────────────
  app.use('/', createWhatsappIntelligenceGroupRouter(deps));
  // ── Meta webhook (public, no auth) ───────────────────────
  app.use('/webhooks', createWebhookRouter(repos.webhookEventsRepo));

  // ── Tracking (public) ────────────────────────────────────────
  app.use('/t', createTrackRouter(repos.adUtmMapRepo, services.utmTagger));

  // ── Approvals (API + server-rendered page; works even with SPA present) ──
  app.use('/', createApprovalsRouter({ repos, services }));

}
