import { Router } from 'express';

export function createAiAgentRouter(aiAgent, settingsRepo) {
  const router = Router();

  function getStatus() {
    const aiRaw = settingsRepo.get('ai_mode_enabled');
    const autoRaw = settingsRepo.get('ai_auto_mode_enabled');
    return {
      ai_mode: aiRaw === true || aiRaw === 'true' || aiRaw === 1,
      auto_mode: autoRaw === true || autoRaw === 'true' || autoRaw === 1,
    };
  }

  // GET /status — returns current AI mode settings
  router.get('/status', (req, res) => {
    res.json({ success: true, data: getStatus() });
  });

  // POST /toggle — toggle ai_mode and/or auto_mode
  router.post('/toggle', (req, res) => {
    const { ai_mode, auto_mode } = req.body;
    if (ai_mode !== undefined) settingsRepo.set('ai_mode_enabled', Boolean(ai_mode));
    if (auto_mode !== undefined) settingsRepo.set('ai_auto_mode_enabled', Boolean(auto_mode));
    res.json({ success: true, data: getStatus() });
  });

  // GET /suggestions — list suggestions for authenticated user
  router.get('/suggestions', (req, res) => {
    const { status } = req.query;
    const suggestions = aiAgent.suggestionsRepo.listByUser(req.user.id, status || null);
    res.json({ success: true, data: suggestions });
  });

  // POST /suggestions/:id/apply — manually apply a pending suggestion
  router.post('/suggestions/:id/apply', async (req, res) => {
    try {
      const updated = await aiAgent.applySuggestion(req.user.id, req.params.id);
      res.json({ success: true, data: updated });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 400;
      res.status(status).json({ success: false, error: err.message });
    }
  });

  // POST /suggestions/:id/dismiss — dismiss a pending suggestion
  router.post('/suggestions/:id/dismiss', (req, res) => {
    try {
      const row = aiAgent.suggestionsRepo.getById(req.params.id);
      if (!row || row.user_id !== req.user.id) {
        return res.status(404).json({ success: false, error: 'Suggestion not found' });
      }
      const updated = aiAgent.suggestionsRepo.updateStatus(req.params.id, 'dismissed');
      res.json({ success: true, data: updated });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /run — trigger AI analysis on demand
  router.post('/run', async (req, res) => {
    try {
      const ids = await aiAgent.analyzeAndSuggest(req.user.id);
      res.json({ success: true, data: { created: ids.length, ids } });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
