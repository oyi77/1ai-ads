/**
 * @deprecated Re-export shim. Use the canonical locations instead:
 *   - ANTI_HALLUCINATION_RULES → server/config/prompts.js (exported as LANDING_PAGE_PROMPT)
 *   - parseJsonResponse → server/domain/creative.js (exported)
 */
export { parseJsonResponse } from '../domain/creative.js';
export { LANDING_PAGE_PROMPT as ANTI_HALLUCINATION_RULES } from '../config/prompts.js';
