import { Router } from 'express';

export function createAiAgentRouter(aiAgent, settingsRepo) {
  const router = Router();

  function getStatus() {
    const level = aiAgent.getAutonomyLevel();
    return {
      autonomy_level: level,
      ai_mode: level !== 'off',
      auto_mode: level === 'fully_auto',
    };
  }

  // GET /status — returns current AI mode settings
  router.get('/status', (req, res) => {
    res.json({ success: true, data: getStatus() });
  });

  // POST /toggle — backward-compat toggle; maps ai_mode/auto_mode to ai_autonomy_level
  router.post('/toggle', (req, res) => {
    const { ai_mode, auto_mode } = req.body;
    const current = aiAgent.getAutonomyLevel();

    if (ai_mode !== undefined) {
      if (!ai_mode) {
        settingsRepo.set('ai_autonomy_level', 'off');
      } else if (current === 'off') {
        settingsRepo.set('ai_autonomy_level', auto_mode === true ? 'fully_auto' : 'manual');
      }
    }

    if (auto_mode !== undefined) {
      const level = aiAgent.getAutonomyLevel();
      if (auto_mode && level !== 'off') {
        settingsRepo.set('ai_autonomy_level', 'fully_auto');
      } else if (!auto_mode && level === 'fully_auto') {
        settingsRepo.set('ai_autonomy_level', 'manual');
      }
    }

    res.json({ success: true, data: getStatus() });
  });

  // POST /autonomy — set AI autonomy level
  router.post('/autonomy', (req, res) => {
    const VALID = ['off', 'manual', 'semi_auto', 'fully_auto'];
    const { level } = req.body;
    if (!VALID.includes(level)) {
      return res.status(400).json({ success: false, error: `Invalid level. Must be one of: ${VALID.join(', ')}` });
    }
    settingsRepo.set('ai_autonomy_level', level);
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
