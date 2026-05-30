import { RateLimiter } from './rate-limiter.js';
import { createLogger } from './logger.js';

const log = createLogger('platform-client');

const platformLimiters = {
  meta: new RateLimiter(30, 1000),
  google: new RateLimiter(50, 1000),
  tiktok: new RateLimiter(20, 1000),
};

export async function safeFetch(platformName, apiUrl, fetchOptions = {}, retries = 3) {
  const platformLimiter = platformLimiters[platformName.toLowerCase()];
  if (platformLimiter) {
    await platformLimiter.throttle();
  }

  const requestStartTime = Date.now();
  try {
    const fetchResponse = await fetch(apiUrl, {
      ...fetchOptions,
      headers: {
        'User-Agent': '1ai-ads/1.0.0 (+https://1ai-ads.ai)',
        ...fetchOptions.headers,
      }
    });

    const requestDuration = Date.now() - requestStartTime;

    if (fetchResponse.status === 429 && retries > 0) {
      const retryAfter = parseInt(fetchResponse.headers.get('retry-after') || '5', 10);
      log.warn(`[${platformName.toUpperCase()}] Rate limited, retrying after ${retryAfter}s`, { url: apiUrl });
      await new Promise(r => setTimeout(r, retryAfter * 1000));
      return safeFetch(platformName, apiUrl, fetchOptions, retries - 1);
    }

    if (!fetchResponse.ok) {
      const errorText = await fetchResponse.text();
      let parsedError;
      try { parsedError = JSON.parse(errorText); } catch { parsedError = errorText; }

      log.error(`[${platformName.toUpperCase()} API ERROR] ${fetchResponse.status} ${apiUrl} (${requestDuration}ms)`, { error: parsedError });

      if (fetchResponse.status >= 500 && retries > 0) {
        const delay = Math.pow(2, 3 - retries) * 1000;
        log.warn(`[${platformName.toUpperCase()}] Server error, retrying in ${delay}ms`, { url: apiUrl });
        await new Promise(r => setTimeout(r, delay));
        return safeFetch(platformName, apiUrl, fetchOptions, retries - 1);
      }

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
