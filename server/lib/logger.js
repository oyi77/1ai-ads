import config from '../config/index.js';
import { randomUUID } from 'crypto';

const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = LOG_LEVELS[config.logLevel] || LOG_LEVELS.info;

// In-memory error budget tracking (per module per tenant)
const errorBudgets = new Map(); // key: "module:tenantId" -> { errors: count, windowStart: timestamp }
const ERROR_BUDGET_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const ERROR_BUDGET_THRESHOLD = 50; // max errors per window

function formatMessage(level, module, message, meta, correlationId, tenantId) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    module,
    message,
    correlationId: correlationId || randomUUID(),
    tenantId: tenantId || null,
  };
  if (meta !== undefined) {
    entry.meta = typeof meta === 'string' ? meta : meta;
  }
  return JSON.stringify(entry);
}

function checkErrorBudget(module, tenantId) {
  const key = `${module}:${tenantId || 'global'}`;
  const now = Date.now();
  const budget = errorBudgets.get(key) || { errors: 0, windowStart: now };

  if (now - budget.windowStart > ERROR_BUDGET_WINDOW_MS) {
    budget.errors = 0;
    budget.windowStart = now;
  }

  budget.errors++;
  errorBudgets.set(key, budget);

  return {
    exhausted: budget.errors > ERROR_BUDGET_THRESHOLD,
    errors: budget.errors,
    threshold: ERROR_BUDGET_THRESHOLD,
    windowMs: ERROR_BUDGET_WINDOW_MS,
  };
}

export function createLogger(module, tenantId) {
  const logMethods = {
    info: (msg, meta, corrId) => {
      if (currentLevel >= LOG_LEVELS.info) {
        process.stdout.write(formatMessage('info', module, msg, meta, corrId, tenantId) + '\n');
      }
    },
    warn: (msg, meta, corrId) => {
      if (currentLevel >= LOG_LEVELS.warn) {
        process.stderr.write(formatMessage('warn', module, msg, meta, corrId, tenantId) + '\n');
      }
    },
    error: (msg, meta, corrId) => {
      if (currentLevel >= LOG_LEVELS.error) {
        const budget = checkErrorBudget(module, tenantId);
        process.stderr.write(formatMessage('error', module, msg, meta, corrId, tenantId) + '\n');
        if (budget.exhausted) {
          process.stderr.write(formatMessage('error', 'error-budget', `Error budget exhausted for ${module}:${tenantId || 'global'}`, { errors: budget.errors, threshold: budget.threshold }, corrId, tenantId) + '\n');
        }
      }
    },
    debug: (msg, meta, corrId) => {
      if (currentLevel >= LOG_LEVELS.debug) {
        process.stdout.write(formatMessage('debug', module, msg, meta, corrId, tenantId) + '\n');
      }
    },
    // Child logger with additional context
    child: (context) => createLogger(`${module}:${context}`, tenantId),
  };
  return logMethods;
}

export const logger = createLogger('app');
