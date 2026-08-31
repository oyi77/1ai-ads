import { Router } from 'express';
import { TokenService } from '../services/token-service.js';

export function createTokenRouter() {
  const router = Router();
  const svc = new TokenService();

  router.get('/', (_req, res) => {
    res.json({ service: 'tokens', endpoints: ['POST /exchange', 'POST /debug', 'POST /info'] });
  });

  router.post('/exchange', async (req, res) => {
    try {
      const { short_token } = req.body;
      if (!short_token) return res.status(400).json({ error: 'short_token required' });
      res.json(await svc.exchangeForLongLived(short_token));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/debug', async (req, res) => {
    try {
      const { token } = req.body;
      if (!token) return res.status(400).json({ error: 'token required' });
      res.json(await svc.debugToken(token));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/info', async (req, res) => {
    try {
      const { token } = req.body;
      if (!token) return res.status(400).json({ error: 'token required' });
      res.json(await svc.getTokenInfo(token));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}