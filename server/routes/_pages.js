import { Router } from 'express';
import { createPagesRouter } from './pages.js';

export function createPagesGroupRouter() {
  const router = Router();
  router.use('/', createPagesRouter());
  return router;
}
