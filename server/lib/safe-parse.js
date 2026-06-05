/**
 * Safe JSON.parse with fallback.
 * Used across repositories and services to parse stored JSON fields.
 * @param {*} value - String to parse, or any value to return as-is on failure
 * @param {*} fallback - Default value if parsing fails (default: null)
 * @returns {*} Parsed value or fallback
 */
export function safeParse(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}