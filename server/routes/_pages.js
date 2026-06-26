import { Router } from 'express';
import { createPagesRouter } from './pages.js';
import { createTaglinksRouter } from './taglinks.js';

export function createPagesGroupRouter() {
  const router = Router();
  router.use('/', createPagesRouter({}));
  router.use('/taglinks', createTaglinksRouter({ userDb: null }));
  return router;
}
