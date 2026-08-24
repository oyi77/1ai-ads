/**
 * Scale default resolution for AI Optimize budget adjustments.
 *
 * Single source of truth for the default multipliers used when an optimization
 * omits an explicit amount. Resolution order: settings DB → env → code default.
 */

const SCALE_DEFAULTS = {
  scale_up: 1.5,
  scale_down: 1.25,
};

const SCALE_SETTING_KEYS = {
  scale_up: 'optimize_scale_up_default',
  scale_down: 'optimize_scale_down_default',
};

const SCALE_ENV_KEYS = {
  scale_up: 'OPTIMIZE_SCALE_UP_DEFAULT',
  scale_down: 'OPTIMIZE_SCALE_DOWN_DEFAULT',
};

export function resolveScaleDefault(type, settingsRepo) {
  const codeDefault = SCALE_DEFAULTS[type];
  let dbValue = null;
  try {
    dbValue = settingsRepo?.get?.(SCALE_SETTING_KEYS[type]) ?? null;
  } catch {
    dbValue = null;
  }
  const envValue = process.env[SCALE_ENV_KEYS[type]];
  const raw = dbValue ?? envValue ?? codeDefault;
  const num = Number(raw);
  return Number.isFinite(num) && num > 0 ? num : codeDefault;
}
