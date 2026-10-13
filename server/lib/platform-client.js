import { RateLimiter } from './rate-limiter.js';
import { createLogger } from './logger.js';

const log = createLogger('platform-client');

const platformLimiters = {
  meta: new RateLimiter(5, 1000),       // Meta Marketing API: ~200 calls/user/hour → 5 req/sec safe
  google: new RateLimiter(8, 1000),     // Google Ads API: 10 req/sec developer token → 8 safe margin
  tiktok: new RateLimiter(10, 1000),    // TikTok Business API: 10 req/sec per app
  linkedin: new RateLimiter(5, 1000),   // LinkedIn Marketing API: ~100 calls/day/partner → 5/sec conservative
  twitter: new RateLimiter(5, 1000),    // X Ads API: varies by endpoint, 5/sec safe
  snapchat: new RateLimiter(10, 1000),  // Snapchat Marketing API: 10 req/sec per org
  pinterest: new RateLimiter(2, 1000),   // Pinterest Ads API: 1000 req/day → ~0.012/sec avg; 2/sec burst with natural pauses
  microsoft: new RateLimiter(5, 1000),  // Microsoft Ads API: 10 req/sec → 5 safe margin
};

function buildHeaders(fetchOptions) {
  return { 'User-Agent': '1ai-ads/1.0.0 (+https://1ai-ads.ai)', ...fetchOptions.headers };
}

function parseErrorResponse(errorText) {
  try { return JSON.parse(errorText); }
  catch { return errorText; }
}

export function redactSecretsForLogs(value) {
  if (Array.isArray(value)) return value.map(redactSecretsForLogs);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, entry] of Object.entries(value)) out[key] = redactSecretsForLogs(entry);
    return out;
  }
  if (typeof value !== 'string') return value;
  return value
    .replace(/((?:access_token|input_token|client_secret|appsecret_proof)=)[^&\s"']+/g, '$1[REDACTED]')
    .replace(/\bEAA[A-Za-z0-9_-]{10,}\b/g, 'EAA[REDACTED]');
}

/** Full-jitter backoff so parallel callers don't retry in lockstep. */
function withJitter(baseMs) {
  return Math.floor(Math.random() * baseMs);
}

async function handleRateLimit(platformName, apiUrl, response, fetchOptions, retries) {
  // Meta often returns a far-future X-App-Usage reset hint; clamp to a sane
  // ceiling so a single 403 can't stall a request for minutes.
  const retryAfter = Math.min(parseInt(response.headers.get('retry-after') || '5', 10) || 5, 30);
  log.warn(`[${platformName.toUpperCase()}] Rate limited, retrying after ${retryAfter}s`, { url: redactSecretsForLogs(apiUrl) });
  await new Promise(r => setTimeout(r, retryAfter * 1000 + withJitter(1000)));
  return safeFetch(platformName, apiUrl, fetchOptions, retries - 1);
}

async function handleServerError(platformName, apiUrl, fetchOptions, retries, attempt) {
  const delay = Math.pow(2, 3 - attempt) * 1000;
  log.warn(`[${platformName.toUpperCase()}] Server error, retrying in ${delay}ms`, { url: redactSecretsForLogs(apiUrl) });
  await new Promise(r => setTimeout(r, delay + withJitter(500)));
  return safeFetch(platformName, apiUrl, fetchOptions, retries - 1);
}

/**
 * Retry a Meta app-level call-load limit (403 + code 4 / subcode 1504022,
 * is_transient:true) with backoff. Without this the limit fell straight into
 * the error path — detected but never waited out — so every caller kept
 * hitting the wall (7 platform-client errors / 3h live).
 */
async function handleMetaAppRateLimit(platformName, apiUrl, fetchOptions, retries, response) {
  const retryAfter = Math.min(parseInt(response.headers.get('retry-after') || '0', 10) || 0, 30);
  const delay = Math.max(retryAfter * 1000, 1000 * Math.pow(2, 4 - retries)) + withJitter(1000);
  log.warn(`[${platformName.toUpperCase()}] App-level call load limit (code 4/1504022), backing off ${delay}ms`, { url: redactSecretsForLogs(apiUrl) });
  await new Promise(r => setTimeout(r, delay));
  return safeFetch(platformName, apiUrl, fetchOptions, retries - 1);
}

/**
 * True when Meta reports its APP-level call-load limit — returned as HTTP 403
 * with code 4 / subcode 1504022 and `is_transient: true`, not as 429. Without
 * this the limit was indistinguishable from a permission failure and every
 * caller retried straight into it.
 */
export function isMetaAppRateLimit(parsedError) {
  const e = parsedError?.error || {};
  return e.code === 4 || e.error_subcode === 1504022;
}

function throwApiError(platformName, status, parsedError) {
  const apiError = new Error(`${platformName} API returned ${status}`);
  apiError.status = status;
  apiError.data = parsedError;

  // Extract Meta error details for user-friendly messaging
  const metaErr = parsedError?.error || {};
  const subcode = metaErr.error_subcode;
  const code = metaErr.code;
  const userMsg = metaErr.error_user_msg || metaErr.message || '';

  // Map known Meta errors to actionable guidance
  if (code === 100 && subcode === 1885183) {
    // Dev mode: EITHER our app OR the app that published the SOURCE POST is in
    // development mode — both surface as 1885183. Only the post case is fixed by
    // using a different post rather than toggling our own app's Live state, so
    // the guidance must not send the user to the wrong switch.
    apiError.userMessage = /postingan|created by an app/i.test(userMsg)
      ? 'Kreatif tidak bisa dibuat — postingan sumber dibuat oleh aplikasi yang masih mode pengembangan. Campaign & ad set tetap dibuat (PAUSED). Posting ulang materi lewat aplikasi yang sudah Live (atau pakai postingan lain), lalu tambahkan kreatif dari Creative Library.'
      : 'Kreatif tidak bisa dibuat — Meta App masih dalam mode pengembangan. Campaign & ad set berhasil dibuat (PAUSED). Tambahkan kreatif dari Creative Library setelah App Review selesai.';
    apiError.code = 'META_DEV_MODE';
  } else if (code === 100 && subcode === 4834011) {
    apiError.userMessage = 'Parameter campaign tidak lengkap — hubungi support.';
    apiError.code = 'META_PARAM_ERROR';
  } else if (code === 100 && subcode === 4834002) {
    apiError.userMessage = 'Budget conflict — campaign tidak bisa punya budget di level campaign dan ad set bersamaan.';
    apiError.code = 'META_BUDGET_CONFLICT';
  } else if (code === 3) {
    // App capability missing
    apiError.userMessage = 'Fitur belum tersedia — Meta App membutuhkan izin tambahan. Campaign & ad set berhasil dibuat, tambahkan kreatif dari library.';
    apiError.code = 'META_APP_CAPABILITY';
  } else if (code === 190) {
    apiError.userMessage = 'Token Meta tidak valid atau sudah expired — hubungkan ulang akun Meta kamu.';
    apiError.code = 'META_TOKEN_EXPIRED';
  } else if (status === 429 || isMetaAppRateLimit(parsedError)) {
    // Meta signals app-level call-load limits as 403 + code 4 / subcode
    // 1504022 (is_transient: true) rather than 429 — proven live 2026-09-29
    // on the per-ad insights calls. Callers must see this as throttling.
    apiError.userMessage = 'Terlalu banyak request ke Meta — coba lagi dalam 30 detik.';
    apiError.code = 'META_RATE_LIMIT';
  } else {
    apiError.userMessage = userMsg || `Meta API error (${code || status})`;
    apiError.code = 'META_API_ERROR';
  }

  throw apiError;
}

export async function safeFetch(platformName, apiUrl, fetchOptions = {}, retries = 3) {
  const platformLimiter = platformLimiters[platformName.toLowerCase()];
  if (platformLimiter) await platformLimiter.throttle();

  const requestStartTime = Date.now();
  try {
    const response = await fetch(apiUrl, { ...fetchOptions, headers: buildHeaders(fetchOptions) });
    const duration = Date.now() - requestStartTime;

    if (response.status === 429 && retries > 0) {
      return handleRateLimit(platformName, apiUrl, response, fetchOptions, retries);
    }

    if (!response.ok) {
      const parsedError = await response.text().then(parseErrorResponse);
      log.error(`[${platformName.toUpperCase()} API ERROR] ${response.status} ${redactSecretsForLogs(apiUrl)} (${duration}ms)`, { error: redactSecretsForLogs(parsedError) });

      if (response.status >= 500 && retries > 0) {
        return handleServerError(platformName, apiUrl, fetchOptions, retries, 3 - retries + 1);
      }
      // Meta app-level call-load limit (403 + code 4 / subcode 1504022) is
      // throttling, not a permission error — back off and retry before throwing.
      if (isMetaAppRateLimit(parsedError) && retries > 0) {
        return handleMetaAppRateLimit(platformName, apiUrl, fetchOptions, retries, response);
      }
      throwApiError(platformName, response.status, parsedError);
    }
    return response;
  } catch (originalError) {
    if (originalError.status) throw originalError;
    log.error(`[${platformName.toUpperCase()} FETCH ERROR] ${redactSecretsForLogs(apiUrl)}`, { message: redactSecretsForLogs(originalError.message) });
    throw originalError;
  }
}