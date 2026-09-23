import { Router } from 'express';

// SUNSET (2026-09-23): endpoint ini CRUD ke tabel automation_rules yang TIDAK
// punya executor — rule yang dibuat di sini tersimpan tapi TIDAK PERNAH jalan
// (fitur mati, kelas bug "rule diam"). Jangan hidupkan lagi tanpa menyambung
// ke autonomous_rules + kuota + guard. Buat rule via bot: /monitor.
const GONE_MSG = 'Kelola aturan via bot Telegram: /monitor → Aturan Otomatis. Web rules dinonaktifkan karena tidak tereksekusi.';

export function createAutomationRulesRouter(_automationRepo) {
  const router = Router();
  router.get('/', async (_req, res) => {
    res.json({ success: true, data: [], sunset: GONE_MSG });
  });
  const gone = async (_req, res) => res.status(410).json({ success: false, error: GONE_MSG });
  router.get('/:id', gone);
  router.post('/', gone);
  router.put('/:id', gone);
  router.delete('/:id', gone);
  router.get('/:id/executions', gone);
  return router;
}
