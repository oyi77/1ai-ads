import config from '../config/index.js';

const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = LOG_LEVELS[config.logLevel] || LOG_LEVELS.info;

function formatMessage(level, module, message, meta) {
  const timestamp = new Date().toISOString();
  const base = `[${timestamp}] [${level.toUpperCase()}]${module ? ` [${module}]` : ''} ${message}`;
  if (meta !== undefined) return `${base} ${JSON.stringify(meta)}`;
  return base;
}

export function createLogger(module) {
  return {
    info: (msg, meta) => { if (currentLevel >= LOG_LEVELS.info) process.stdout.write(formatMessage('info', module, msg, meta) + '\n'); },
    warn: (msg, meta) => { if (currentLevel >= LOG_LEVELS.warn) process.stderr.write(formatMessage('warn', module, msg, meta) + '\n'); },
    error: (msg, meta) => { if (currentLevel >= LOG_LEVELS.error) process.stderr.write(formatMessage('error', module, msg, meta) + '\n'); },
    debug: (msg, meta) => { if (currentLevel >= LOG_LEVELS.debug) process.stdout.write(formatMessage('debug', module, msg, meta) + '\n'); },
  };
}

export const logger = createLogger('app');
