import { Router } from 'express';
import { SchedulesRepository } from '../repositories/schedules.js';

export function createScheduleRouter(db) {
  const schedulesRepo = new SchedulesRepository(db);
  const router = Router();

  router.get('/', async (req, res) => {
    const { status, platform } = req.query;
    const userId = req.user?.id || 'system';
    const schedules = schedulesRepo.findAll({ status, platform, userId });
    res.json({ success: true, data: schedules });
  });

  router.post('/', async (req, res) => {
    const { name, schedule_time, platform, content, media_url } = req.body;
    if (!name || !schedule_time || !platform) {
      return res.status(400).json({ success: false, error: 'name, schedule_time, and platform are required' });
    }
    const id = schedulesRepo.create({
      user_id: req.user?.id || 'system',
      name, schedule_time, platform, content, media_url,
    });
    res.json({ success: true, data: { id, status: 'scheduled' } });
  });

  router.delete('/:id', async (req, res) => {
    const userId = req.user?.id || 'system';
    const deleted = schedulesRepo.remove(req.params.id, userId);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Schedule not found' });
    }
    res.json({ success: true });
  });

  return router;
}
