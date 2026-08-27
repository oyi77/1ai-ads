import { Router } from 'express';
import crypto from 'crypto';
import { createLogger } from '../lib/logger.js';
import { requireAuth } from '../middleware/auth.js';

const log = createLogger('api-keys');

// Scopes available for API keys
const AVAILABLE_SCOPES = [
  'campaigns:read',
  'campaigns:write',
  'reports:read',
  'accounts:read',
  'rules:read',
  'rules:write',
  'webhooks:read',
  'webhooks:write',
];

// Rate limit tiers
const RATE_LIMIT_TIERS = {
  standard: { requestsPerMinute: 60, requestsPerDay: 10000 },
  elevated: { requestsPerMinute: 300, requestsPerDay: 100000 },
  enterprise: { requestsPerMinute: 1000, requestsPerDay: 1000000 },
};

function generateApiKey() {
  const prefix = 'ak_live_';
  const random = crypto.randomBytes(24).toString('base64url');
  return prefix + random;
}

function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export function createApiKeysRouter(paymentsRepo) {
  const router = Router();

  // All routes require authentication
  router.use(requireAuth);

  // GET /api/api-keys — list user's API keys
  router.get('/', async (req, res) => {
    try {
      const keys = paymentsRepo.findApiKeysByUserId(req.user.id);
      // Never return the full hash
      const safeKeys = keys.map(k => ({
        id: k.id,
        name: k.name,
        prefix: k.key_prefix,
        scopes: typeof k.scopes === 'string' ? JSON.parse(k.scopes) : k.scopes,
        rateLimitTier: k.rate_limit_tier,
        lastUsedAt: k.last_used_at,
        expiresAt: k.expires_at,
        revokedAt: k.revoked_at,
        createdAt: k.created_at,
      }));
      res.json({ success: true, data: safeKeys });
    } catch (err) {
      log.error('Failed to list API keys', { error: err.message, userId: req.user.id });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/api-keys/scopes — list available scopes
  router.get('/scopes', (_req, res) => {
    res.json({ success: true, data: AVAILABLE_SCOPES });
  });

  // GET /api/api-keys/tiers — list rate limit tiers
  router.get('/tiers', (_req, res) => {
    res.json({ success: true, data: RATE_LIMIT_TIERS });
  });

  // POST /api/api-keys — create new API key
  router.post('/', async (req, res) => {
    try {
      const { name, scopes, rateLimitTier, expiresAt } = req.body;
      if (!name || name.trim().length < 3) {
        return res.status(400).json({ success: false, error: 'Name must be at least 3 characters' });
      }

      // Validate scopes
      const requestedScopes = scopes || ['campaigns:read', 'reports:read'];
      const invalidScopes = requestedScopes.filter(s => !AVAILABLE_SCOPES.includes(s));
      if (invalidScopes.length > 0) {
        return res.status(400).json({ success: false, error: `Invalid scopes: ${invalidScopes.join(', ')}` });
      }

      // Validate rate limit tier
      const tier = rateLimitTier || 'standard';
      if (!RATE_LIMIT_TIERS[tier]) {
        return res.status(400).json({ success: false, error: `Invalid rate limit tier: ${tier}` });
      }

      // Generate key and hash
      const fullKey = generateApiKey();
      const keyPrefix = fullKey.slice(0, 12) + '...';
      const keyHash = hashKey(fullKey);

      const key = paymentsRepo.createApiKey({
        userId: req.user.id,
        name: name.trim(),
        keyHash,
        keyPrefix,
        scopes: requestedScopes,
        rateLimitTier: tier,
        expiresAt: expiresAt || null,
      });

      // Return the full key ONLY ONCE
      res.status(201).json({
        success: true,
        data: {
          ...key,
          key: fullKey, // Only returned once!
        },
      });
    } catch (err) {
      log.error('Failed to create API key', { error: err.message, userId: req.user.id });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // PATCH /api/api-keys/:id — update API key (name, scopes, tier, expiry)
  router.patch('/:id', async (req, res) => {
    try {
      const { name, scopes, rateLimitTier, expiresAt } = req.body;
      const key = paymentsRepo.updateApiKey(req.params.id, req.user.id, { name, scopes, rateLimitTier, expiresAt });
      if (!key) {
        return res.status(404).json({ success: false, error: 'API key not found' });
      }
      const safeKey = {
        id: key.id,
        name: key.name,
        prefix: key.key_prefix,
        scopes: typeof key.scopes === 'string' ? JSON.parse(key.scopes) : key.scopes,
        rateLimitTier: key.rate_limit_tier,
        expiresAt: key.expires_at,
        revokedAt: key.revoked_at,
        createdAt: key.created_at,
      };
      res.json({ success: true, data: safeKey });
    } catch (err) {
      log.error('Failed to update API key', { error: err.message, userId: req.user.id });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // DELETE /api/api-keys/:id — revoke API key
  router.delete('/:id', async (req, res) => {
    try {
      const key = paymentsRepo.revokeApiKey(req.params.id, req.user.id);
      if (!key) {
        return res.status(404).json({ success: false, error: 'API key not found' });
      }
      res.json({ success: true, message: 'API key revoked' });
    } catch (err) {
      log.error('Failed to revoke API key', { error: err.message, userId: req.user.id });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}