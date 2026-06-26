import config from '../config/index.js';
import rateLimit from 'express-rate-limit';
import { createTrackRouter } from '../routes/track.js';

import { requireAuth, requireAdmin } from '../middleware/auth.js';

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
  app.use('/', createPagesGroupRouter());

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

  // ── Tracking (public) ────────────────────────────────────────
  app.use('/t', createTrackRouter(repos.adUtmMapRepo, services.utmTagger));
}
