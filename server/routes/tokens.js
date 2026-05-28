import { Router } from 'express';
import { TokenService } from '../services/token-service.js';

export default function createTokenRouter() {
  const router = Router();
  const svc = new TokenService();

  router.get('/', (req, res) => {
    res.json({ service: 'tokens', endpoints: ['POST /exchange', 'POST /debug', 'POST /info'] });
  });

  router.post('/exchange', async (req, res) => {
    try {
      const { short_token } = req.body;
      if (!short_token) return res.status(400).json({ error: 'short_token required' });
      const result = await svc.exchangeForLongLived(short_token);
      res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/debug', async (req, res) => {
    try {
      const { token } = req.body;
      if (!token) return res.status(400).json({ error: 'token required' });
      const result = await svc.debugToken(token);
      res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/info', async (req, res) => {
    try {
      const { token } = req.body;
      if (!token) return res.status(400).json({ error: 'token required' });
      const result = await svc.getTokenInfo(token);
      res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
}
