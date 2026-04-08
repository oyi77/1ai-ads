import { RateLimiter } from './rate-limiter.js';
import { createLogger } from './logger.js';

const log = createLogger('platform-client');

const platformLimiters = {
  meta: new RateLimiter(30, 1000),
  google: new RateLimiter(50, 1000),
  tiktok: new RateLimiter(20, 1000),
};

export async function safeFetch(platformName, apiUrl, fetchOptions = {}) {
  const platformLimiter = platformLimiters[platformName.toLowerCase()];
  if (platformLimiter) {
    await platformLimiter.throttle();
  }

  const requestStartTime = Date.now();
  try {
    const fetchResponse = await fetch(apiUrl, {
      ...fetchOptions,
      headers: {
        'User-Agent': 'AdForge/1.0.0 (+https://adforge.ai)',
        ...fetchOptions.headers,
      }
    });

    const requestDuration = Date.now() - requestStartTime;
    if (!fetchResponse.ok) {
      const errorText = await fetchResponse.text();
      let parsedError;
      try { parsedError = JSON.parse(errorText); } catch { parsedError = errorText; }

      log.error(`[${platformName.toUpperCase()} API ERROR] ${fetchResponse.status} ${apiUrl} (${requestDuration}ms)`, { error: parsedError });

      const apiError = new Error(`${platformName} API returned ${fetchResponse.status}`);
      apiError.status = fetchResponse.status;
      apiError.data = parsedError;
      throw apiError;
    }

    return fetchResponse;
  } catch (originalError) {
    if (originalError.status) throw originalError;
    log.error(`[${platformName.toUpperCase()} FETCH ERROR] ${apiUrl}`, { message: originalError.message });
    throw originalError;
  }
}
