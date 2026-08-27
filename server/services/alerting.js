import { createLogger } from '../lib/logger.js';

const log = createLogger('alerting');

// Alert thresholds
const THRESHOLDS = {
  scheduler: {
    maxFailuresPerWindow: 3,
    windowMs: 10 * 60 * 1000, // 10 minutes
  },
  webhook: {
    maxErrorRate: 0.1, // 10%
    minRequestsPerWindow: 20,
    windowMs: 5 * 60 * 1000, // 5 minutes
  },
  sync: {
    maxLatencyMs: 60000, // 60 seconds
    maxFailuresPerWindow: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
  },
};

// In-memory metrics storage (per tenant)
const metrics = {
  scheduler: new Map(), // tenantId -> { failures: [], lastAlert: timestamp }
  webhook: new Map(),   // tenantId -> { requests: [], errors: [], lastAlert: timestamp }
  sync: new Map(),      // tenantId -> { latencies: [], failures: [], lastAlert: timestamp }
};

function getTenantKey(tenantId) {
  return tenantId || 'global';
}

function pruneWindow(arr, windowMs) {
  const now = Date.now();
  return arr.filter(item => now - item.timestamp < windowMs);
}

function shouldAlert(lastAlert, cooldownMs) {
  if (!lastAlert) return true;
  return Date.now() - lastAlert > cooldownMs;
}

export class AlertingService {
  constructor(bot) {
    this.bot = bot;
    this.alertCooldownMs = 15 * 60 * 1000; // 15 minutes between same alert
  }

  // Record a scheduler job result
  recordSchedulerJob(tenantId, jobName, success, error) {
    const key = getTenantKey(tenantId);
    const state = metrics.scheduler.get(key) || { failures: [], lastAlert: 0 };
    const now = Date.now();
    const windowMs = THRESHOLDS.scheduler.windowMs;

    if (!success) {
      state.failures.push({ jobName, error, timestamp: now });
    }

    state.failures = pruneWindow(state.failures, windowMs);

    if (state.failures.length >= THRESHOLDS.scheduler.maxFailuresPerWindow) {
      if (shouldAlert(state.lastAlert, this.alertCooldownMs)) {
        this.sendAlert(tenantId, 'scheduler', {
          message: `🚨 <b>Scheduler Alert</b>\n${state.failures.length} job failures in last ${windowMs / 60000} min for tenant ${tenantId}`,
          details: state.failures.slice(-5),
        });
        state.lastAlert = now;
      }
    }

    metrics.scheduler.set(key, state);
  }

  // Record a webhook request result
  recordWebhookRequest(tenantId, success) {
    const key = getTenantKey(tenantId);
    const state = metrics.webhook.get(key) || { requests: [], errors: [], lastAlert: 0 };
    const now = Date.now();
    const windowMs = THRESHOLDS.webhook.windowMs;

    state.requests.push({ success, timestamp: now });
    if (!success) {
      state.errors.push({ timestamp: now });
    }

    state.requests = pruneWindow(state.requests, windowMs);
    state.errors = pruneWindow(state.errors, windowMs);

    // Check error rate
    if (state.requests.length >= THRESHOLDS.webhook.minRequestsPerWindow) {
      const errorRate = state.errors.length / state.requests.length;
      if (errorRate > THRESHOLDS.webhook.maxErrorRate) {
        if (shouldAlert(state.lastAlert, this.alertCooldownMs)) {
          this.sendAlert(tenantId, 'webhook', {
            message: `🚨 <b>Webhook Error Rate Alert</b>\n${(errorRate * 100).toFixed(1)}% error rate (${state.errors.length}/${state.requests.length}) for tenant ${tenantId}`,
            details: { errorRate: (errorRate * 100).toFixed(1) + '%', requests: state.requests.length, errors: state.errors.length },
          });
          state.lastAlert = now;
        }
      }
    }

    metrics.webhook.set(key, state);
  }

  // Record a sync operation
  recordSync(tenantId, platform, latencyMs, success, error) {
    const key = getTenantKey(tenantId);
    const state = metrics.sync.get(key) || { latencies: [], failures: [], lastAlert: 0 };
    const now = Date.now();
    const windowMs = THRESHOLDS.sync.windowMs;

    if (success) {
      state.latencies.push({ platform, latencyMs, timestamp: now });
    } else {
      state.failures.push({ platform, error, timestamp: now });
    }

    state.latencies = pruneWindow(state.latencies, windowMs);
    state.failures = pruneWindow(state.failures, windowMs);

    // Check latency
    const avgLatency = state.latencies.length > 0
      ? state.latencies.reduce((sum, l) => sum + l.latencyMs, 0) / state.latencies.length
      : 0;

    if (avgLatency > THRESHOLDS.sync.maxLatencyMs) {
      if (shouldAlert(state.lastAlert, this.alertCooldownMs)) {
        this.sendAlert(tenantId, 'sync', {
          message: `🚨 <b>Sync Latency Alert</b>\nAvg sync latency ${(avgLatency / 1000).toFixed(1)}s exceeds ${THRESHOLDS.sync.maxLatencyMs / 1000}s for tenant ${tenantId}`,
          details: { avgLatencyMs: Math.round(avgLatency), samples: state.latencies.length },
        });
        state.lastAlert = now;
      }
    }

    // Check failures
    if (state.failures.length >= THRESHOLDS.sync.maxFailuresPerWindow) {
      if (shouldAlert(state.lastAlert, this.alertCooldownMs)) {
        this.sendAlert(tenantId, 'sync', {
          message: `🚨 <b>Sync Failures Alert</b>\n${state.failures.length} sync failures in last ${windowMs / 60000} min for tenant ${tenantId}`,
          details: state.failures.slice(-5),
        });
        state.lastAlert = now;
      }
    }

    metrics.sync.set(key, state);
  }

  // Send alert via Telegram bot
  sendAlert(tenantId, type, alert) {
    // Try to get admin bot instance
    if (this.bot) {
      try {
        // Send to admin chat (configured via ADMIN_CHAT_ID env var)
        const adminChatId = process.env.ADMIN_CHAT_ID;
        if (adminChatId) {
          this.bot.telegram.sendMessage(adminChatId, alert.message, {
            parse_mode: 'HTML',
          });
        }

        // Also log for audit
        log.warn(`ALERT [${type.toUpperCase()}]`, {
          tenantId,
          type,
          message: alert.message,
          details: alert.details,
        });
      } catch (err) {
        log.error('Failed to send alert', { error: err.message, tenantId, type });
      }
    }
  }

  // Get current metrics for admin panel
  getMetrics(tenantId) {
    const key = getTenantKey(tenantId);
    return {
      scheduler: metrics.scheduler.get(key) || { failures: [], lastAlert: 0 },
      webhook: metrics.webhook.get(key) || { requests: [], errors: [], lastAlert: 0 },
      sync: metrics.sync.get(key) || { latencies: [], failures: [], lastAlert: 0 },
    };
  }

  // Get all tenant metrics (admin only)
  getAllMetrics() {
    const allTenants = new Set([
      ...metrics.scheduler.keys(),
      ...metrics.webhook.keys(),
      ...metrics.sync.keys(),
    ]);

    const result = {};
    for (const tenant of allTenants) {
      result[tenant] = this.getMetrics(tenant);
    }
    return result;
  }
}

export const alertingService = null; // Initialized in app.js with bot instance