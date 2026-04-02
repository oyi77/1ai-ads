const PLATFORMS = ['meta', 'google', 'tiktok', 'x'];
const FORMATS = ['single_image', 'carousel', 'video'];
const STATUSES = ['draft', 'active', 'archived'];
const THEMES = ['dark', 'slate', 'obsidian', 'light'];

export function validateRequired(data, fields) {
  for (const field of fields) {
    if (!data[field] && data[field] !== 0) {
      return { valid: false, error: `${field} is required` };
    }
  }
  return { valid: true };
}

export function validateEnum(value, allowed, fieldName) {
  if (!value) return { valid: true };
  if (!allowed.includes(value)) {
    return { valid: false, error: `${fieldName} must be one of: ${allowed.join(', ')}` };
  }
  return { valid: true };
}

export function validateAd(data) {
  const req = validateRequired(data, ['name']);
  if (!req.valid) return req;

  const platform = validateEnum(data.platform, PLATFORMS, 'platform');
  if (!platform.valid) return platform;

  const format = validateEnum(data.format, FORMATS, 'format');
  if (!format.valid) return format;

  const status = validateEnum(data.status, STATUSES, 'status');
  if (!status.valid) return status;

  return { valid: true };
}

export function validateLandingPage(data) {
  const req = validateRequired(data, ['name']);
  if (!req.valid) return req;

  const theme = validateEnum(data.theme, THEMES, 'theme');
  if (!theme.valid) return theme;

  return { valid: true };
}
