/**
 * Idempotency key middleware (DEF phase 3).
 *
 * Reads `Idempotency-Key` header, hashes it together with `userId` and the
 * raw request body (`action_hash`). On a successful mutation we store the
 * response body; replays within the 24h window return the stored response
 * without calling the handler. Prevents duplicate spend on retries.
 *
 * Mount as a route-level wrapper around mutating endpoints (campaign
 * creation, ad creation, budget wizards). Non-2xx responses are never
 * cached — a retry should reach the handler again.
 *
 * Persistence: `idempotency_keys` table (migration 057) via
 * IdempotencyKeysRepository. A memory cache mirrors successful writes for
 * fast reads; a cold cache misses to the DB.
 */

import crypto from 'crypto';

export function createIdempotencyMiddleware(options = {}) {
  const { keyHeader = 'idempotency-key', idempotencyKeysRepo } = options;
  const cache = new Map(); // action_hash -> { statusCode, result_json, expires_at }

  function keyHash(key, userId, body) {
    const raw = JSON.stringify({ key, userId, body });
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  function now() {
    return Date.now();
  }

  return async (req, res, next) => {
    const key = req.headers[keyHeader];
    if (!key || (req.method !== 'POST' && req.method !== 'PUT' && req.method !== 'PATCH')) {
      return next();
    }

    const userId = (req.user && req.user.id) || req.body?.userId || 'anonymous';
    const bodyHash = keyHash(key, userId, req.body);

    // 1. memory cache hit — fastest path
    const cached = cache.get(bodyHash);
    if (cached && cached.expires_at > now()) {
      return res.status(cached.statusCode).json(JSON.parse(cached.result_json));
    }

    // 2. DB hit — survives restarts
    const row = await idempotencyKeysRepo.find(key, userId, bodyHash);
    if (row) {
      cache.set(bodyHash, {
        statusCode: row.status_code,
        result_json: row.result_json,
        expires_at: now() + 24 * 60 * 60 * 1000,
      });
      return res.status(row.status_code).json(JSON.parse(row.result_json));
    }

    // 3. miss — intercept the response and persist on success
    const origJson = res.json.bind(res);
    res.json = async (body) => {
      const result = origJson(body);
      if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
        return result;
      }
      try {
        const result_json = JSON.stringify(body);
        const expires_at = now() + 24 * 60 * 60 * 1000;
        cache.set(bodyHash, { statusCode: res.statusCode, result_json, expires_at });
        await idempotencyKeysRepo.create({
          key,
          user_id: userId,
          action_hash: bodyHash,
          status_code: res.statusCode,
          result: body,
        });
      } catch { /* best effort only */ }
      return result;
    };

    next();
  };
}

export default createIdempotencyMiddleware;
