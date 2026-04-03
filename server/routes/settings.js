import { Router } from 'express';
import { v4 as uuid } from 'uuid';

export function createSettingsRouter(settingsRepo) {
  const router = Router();

  // Get all general settings
  router.get('/', (req, res) => {
    const all = settingsRepo.getAll();
    const safe = {};
    for (const [key, value] of Object.entries(all)) {
      if (key.startsWith('credentials_')) continue; // Skip legacy creds in general list
      safe[key] = value;
    }
    res.json({ success: true, data: safe });
  });

  // --- Multi-account API ---

  router.get('/accounts', (req, res) => {
    const { platform } = req.query;
    const accounts = settingsRepo.getAccounts(platform);
    // Mask sensitive fields
    const safe = accounts.map(acc => {
      const maskedCreds = {};
      for (const [k, v] of Object.entries(acc.credentials)) {
        maskedCreds[k] = v ? `${String(v).slice(0, 4)}****` : null;
      }
      return { ...acc, credentials: maskedCreds };
    });
    res.json({ success: true, data: safe });
  });

  router.post('/accounts', (req, res) => {
    const { platform, account_name, credentials } = req.body;
    if (!platform || !account_name || !credentials) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const id = uuid();
    settingsRepo.addAccount({
      id,
      user_id: req.user?.id || 'admin', // Default to admin for MVP
      platform,
      account_name,
      credentials
    });

    res.json({ success: true, data: { id } });
  });

  router.put('/accounts/:id', (req, res) => {
    const { id } = req.params;
    settingsRepo.updateAccount(id, req.body);
    res.json({ success: true });
  });

  router.delete('/accounts/:id', (req, res) => {
    settingsRepo.deleteAccount(req.params.id);
    res.json({ success: true });
  });

  // --- Legacy Support (for existing frontend calls) ---

  router.get('/credentials/:platform', (req, res) => {
    const accounts = settingsRepo.getAccounts(req.params.platform);
    const acc = accounts.find(a => a.is_active) || accounts[0];
    
    if (!acc) {
      return res.json({ success: true, data: { configured: false, platform: req.params.platform } });
    }

    const fields = {};
    for (const [k, v] of Object.entries(acc.credentials)) {
      fields[k] = v ? `${String(v).slice(0, 4)}****` : null;
    }
    res.json({ success: true, data: { configured: true, platform: req.params.platform, fields, account_id: acc.id } });
  });

  router.post('/credentials/:platform', (req, res) => {
    const { platform } = req.params;
    const credentials = req.body;

    // Create or update "Default" account for legacy calls
    const accounts = settingsRepo.getAccounts(platform);
    const existingDefault = accounts.find(a => a.account_name === 'Default');

    if (existingDefault) {
      settingsRepo.updateAccount(existingDefault.id, { credentials });
    } else {
      settingsRepo.addAccount({
        id: uuid(),
        user_id: req.user?.id || 'admin',
        platform,
        account_name: 'Default',
        credentials,
        is_active: 1
      });
    }

    res.json({ success: true, data: { platform, configured: true } });
  });

  // Save a general setting
  router.put('/:key', (req, res) => {
    const { value } = req.body;
    if (value === undefined) return res.status(400).json({ success: false, error: 'value is required' });
    settingsRepo.set(req.params.key, value);
    res.json({ success: true });
  });

  return router;
}
