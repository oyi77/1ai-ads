import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  handleGetMetaApp,
  handlePostMetaApp,
  handleDeleteMetaApp,
} from './_handlers/meta-app-handlers.js';

export function createMetaAppRouter(userMetaAppsRepo) {
  const router = Router();
  router.use(requireAuth);
  router.get('/', handleGetMetaApp(userMetaAppsRepo));
  router.post('/', handlePostMetaApp(userMetaAppsRepo));
  router.delete('/', handleDeleteMetaApp(userMetaAppsRepo));
  return router;
}
