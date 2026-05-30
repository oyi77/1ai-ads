import { Router } from 'express';
import { TokenService } from '../services/token-service.js';

export default function createTokenRouter() {
  const router = Router();
  const svc = new TokenService();

  router.get('/', (req, res) => {
    res.json({ service: 'tokens', endpoints: ['POST /exchange', 'POST /debug', 'POST /info'] });
  });

  router.post('/exchange', async (req, res) => {
    const { short_token } = req.body;
    if (!short_token) return res.status(400).json({ error: 'short_token required' });
    res.json(await svc.exchangeForLongLived(short_token));
  });

  router.post('/debug', async (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'token required' });
    res.json(await svc.debugToken(token));
  });

  router.post('/info', async (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'token required' });
    res.json(await svc.getTokenInfo(token));
  });

  return router;
}
