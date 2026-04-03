import { Router } from 'express';

export function createSettingsRouter(settingsRepo) {
  const router = Router();

  // Get all settings (excluding sensitive credential values)
  router.get('/', (req, res) => {
    const all = settingsRepo.getAll();
    // Mask credential values
    const safe = {};
    for (const [key, value] of Object.entries(all)) {
      if (key.startsWith('credentials_')) {
        const platform = key.replace('credentials_', '');
        safe[key] = { platform, configured: true, keys: Object.keys(value) };
      } else {
        safe[key] = value;
      }
    }
    res.json({ success: true, data: safe });
  });

  // Get credentials status for a platform (not the actual secrets)
  router.get('/credentials/:platform', (req, res) => {
    const creds = settingsRepo.getCredentials(req.params.platform);
    if (!creds) {
      return res.json({ success: true, data: { configured: false, platform: req.params.platform } });
    }
    // Return which fields are configured, not the values
    const fields = {};
    for (const [key, value] of Object.entries(creds)) {
      fields[key] = value ? `${String(value).slice(0, 4)}****` : null;
    }
    res.json({ success: true, data: { configured: true, platform: req.params.platform, fields } });
  });

  // Save credentials for a platform
  router.post('/credentials/:platform', (req, res) => {
    const { platform } = req.params;
    const credentials = req.body;

    if (!credentials || Object.keys(credentials).length === 0) {
      return res.status(400).json({ success: false, error: 'Credentials object is required' });
    }

    // Validate required fields per platform
    const required = {
      meta: ['access_token'],
      google: ['developer_token'],
      tiktok: ['access_token'],
      scalev: ['api_token'],
      x: ['access_token'],
    };

    const requiredFields = required[platform];
    if (requiredFields) {
      for (const field of requiredFields) {
        if (!credentials[field]) {
          return res.status(400).json({ success: false, error: `${field} is required for ${platform}` });
        }
      }
    }

    settingsRepo.setCredentials(platform, credentials);
    res.json({ success: true, data: { platform, configured: true } });
  });

  // Delete credentials for a platform
  router.delete('/credentials/:platform', (req, res) => {
    settingsRepo.deleteCredentials(req.params.platform);
    res.json({ success: true, data: { platform: req.params.platform, configured: false } });
  });

  // Save a general setting
  router.put('/:key', (req, res) => {
    const { value } = req.body;
    if (value === undefined) {
      return res.status(400).json({ success: false, error: 'value is required' });
    }
    settingsRepo.set(req.params.key, value);
    res.json({ success: true });
  });

  return router;
}
