/**
 * @deprecated This file is dead code. Use the canonical locations instead:
 *   - LANDING_PAGE_PROMPT → server/config/prompts.js
 *   - parseJsonResponse → server/domain/creative.js (exported)
 *   - extractLLMContent → unused, removed
 *   - parseHtmlResponse → unused, removed
 *
 * This file is kept only as a re-export shim until all references are updated.
 */

export { parseJsonResponse } from '../domain/creative.js';

// Re-export prompt constant for backward compatibility with tests
export { LANDING_PAGE_PROMPT as ANTI_HALLUCINATION_RULES } from '../config/prompts.js';
