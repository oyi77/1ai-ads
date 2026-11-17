/**
 * AI Suggestion Schema Validation
 *
 * Validates LLM output before it's persisted or applied. Prevents
 * prompt-injection-style malformed suggestions from reaching the DB.
 * DEF-12 (audit 2026-11-17): previously JSON.parse'd LLM output went
 * straight to _applyChanges with no field allowlist or type checks.
 */

const VALID_TYPES = new Set(['ad_copy', 'landing_page', 'bid', 'pause_ad', 'creative']);
const VALID_TARGET_TYPES = new Set(['ad', 'campaign', 'landing_page']);
const VALID_BID_FIELDS = new Set(['bid_strategy', 'bid_amount', 'bid_cap']);
const VALID_AD_COPY_FIELDS = new Set(['headline', 'primary_text', 'description', 'cta', 'hook', 'body']);
const VALID_LANDING_PAGE_FIELDS = new Set(['product_name', 'price', 'pain_points', 'benefits', 'cta_primary', 'cta_secondary', 'wa_link', 'checkout_link', 'theme', 'html_output']);
const VALID_CREATIVE_FIELDS = new Set(['design_json', 'hook', 'body', 'cta', 'headline', 'primary_text', 'description']);
const VALID_PAUSE_AD_FIELDS = new Set(); // no fields expected

const TYPE_TO_FIELDS = new Map([
  ['ad_copy', VALID_AD_COPY_FIELDS],
  ['landing_page', VALID_LANDING_PAGE_FIELDS],
  ['bid', VALID_BID_FIELDS],
  ['pause_ad', VALID_PAUSE_AD_FIELDS],
  ['creative', VALID_CREATIVE_FIELDS],
]);

/**
 * Validates a single suggestion object.
 * @param {Object} s - raw suggestion from LLM
 * @returns {{valid: boolean, sanitized: Object|null, errors: string[]}}
 */
export function validateSuggestion(s) {
  const errors = [];
  if (!s || typeof s !== 'object') {
    return { valid: false, sanitized: null, errors: ['Suggestion must be an object'] };
  }

  // Required fields
  if (!VALID_TYPES.has(s.type)) {
    errors.push(`Invalid type: ${s.type}. Must be one of: ${Array.from(VALID_TYPES).join(', ')}`);
  }
  if (s.target_id && typeof s.target_id !== 'string') {
    errors.push('target_id must be a string if present');
  }
  if (!VALID_TARGET_TYPES.has(s.target_type)) {
    errors.push(`Invalid target_type: ${s.target_type}. Must be one of: ${Array.from(VALID_TARGET_TYPES).join(', ')}`);
  }

  // Changes validation
  const changes = s.changes;
  if (!Array.isArray(changes)) {
    errors.push('changes must be an array');
  } else {
    const allowedFields = TYPE_TO_FIELDS.get(s.type) || new Set();
    for (let i = 0; i < changes.length; i++) {
      const c = changes[i];
      if (!c || typeof c !== 'object') {
        errors.push(`changes[${i}] must be an object`);
        continue;
      }
      if (typeof c.field !== 'string' || !c.field.trim()) {
        errors.push(`changes[${i}].field must be a non-empty string`);
      } else if (!allowedFields.has(c.field)) {
        // Unknown field — reject rather than silently drop (defense in depth).
        // For types with an empty allowed set (pause_ad), ANY field is rejected.
        errors.push(`changes[${i}].field "${c.field}" not allowed for type "${s.type}"`);
      }
      // value can be any JSON-serializable; we trust repo.update to handle types
    }
  }

  // Rationale optional
  if (s.rationale !== undefined && typeof s.rationale !== 'string') {
    errors.push('rationale must be a string if present');
  }

  if (errors.length > 0) {
    return { valid: false, sanitized: null, errors };
  }

  // Build sanitized suggestion — only pass allowed fields forward
  const allowedFields = TYPE_TO_FIELDS.get(s.type) || new Set();
  const sanitizedChanges = (changes || [])
    .filter(c => c && typeof c === 'object' && typeof c.field === 'string' && (allowedFields.size === 0 || allowedFields.has(c.field)))
    .map(c => ({ field: c.field, value: c.value }));

  return {
    valid: true,
    sanitized: {
      type: s.type,
      target_id: s.target_id || null,
      target_type: s.target_type || null,
      changes: sanitizedChanges,
      rationale: s.rationale || '',
    },
    errors: [],
  };
}

/**
 * Validates an array of suggestions, returning only valid ones.
 * Invalid suggestions are logged and dropped.
 * @param {Array} suggestions - raw suggestions from LLM
 * @returns {Array} valid, sanitized suggestions
 */
export function validateSuggestions(suggestions) {
  if (!Array.isArray(suggestions)) return [];
  return suggestions
    .map(s => validateSuggestion(s))
    .filter(r => r.valid)
    .map(r => r.sanitized);
}