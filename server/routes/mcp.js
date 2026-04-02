import { Router } from 'express';
import { mcpManager } from '../services/mcp.js';

const router = Router();

router.get('/status', (req, res) => {
  res.json({ success: true, data: { connected: mcpManager.connected } });
});

router.post('/connect', async (req, res) => {
  try {
    const result = await mcpManager.connect(req.body);
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/accounts/:platform', async (req, res) => {
  const accounts = await mcpManager.listAccounts(req.params.platform);
  res.json({ success: true, data: accounts });
});

export default router;
