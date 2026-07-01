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

async function handleRateLimit(platformName, apiUrl, response, fetchOptions, retries) {
  const retryAfter = parseInt(response.headers.get('retry-after') || '5', 10);
  log.warn(`[${platformName.toUpperCase()}] Rate limited, retrying after ${retryAfter}s`, { url: apiUrl });
  await new Promise(r => setTimeout(r, retryAfter * 1000));
  return safeFetch(platformName, apiUrl, fetchOptions, retries - 1);
}

async function handleServerError(platformName, apiUrl, fetchOptions, retries, attempt) {
  const delay = Math.pow(2, 3 - attempt) * 1000;
  log.warn(`[${platformName.toUpperCase()}] Server error, retrying in ${delay}ms`, { url: apiUrl });
  await new Promise(r => setTimeout(r, delay));
  return safeFetch(platformName, apiUrl, fetchOptions, retries - 1);
}

function throwApiError(platformName, status, parsedError) {
  const apiError = new Error(`${platformName} API returned ${status}`);
  apiError.status = status;
  apiError.data = parsedError;
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
      log.error(`[${platformName.toUpperCase()} API ERROR] ${response.status} ${apiUrl} (${duration}ms)`, { error: parsedError });

      if (response.status >= 500 && retries > 0) {
        return handleServerError(platformName, apiUrl, fetchOptions, retries, 3 - retries + 1);
      }
      throwApiError(platformName, response.status, parsedError);
    }
    return response;
  } catch (originalError) {
    if (originalError.status) throw originalError;
    log.error(`[${platformName.toUpperCase()} FETCH ERROR] ${apiUrl}`, { message: originalError.message });
    throw originalError;
  }
}