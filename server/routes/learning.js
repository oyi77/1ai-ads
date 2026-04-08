import { Router } from 'express';
import config from '../config/index.js';

export function createLearningRouter(learningService) {
  const router = Router();

  router.get('/status', async (req, res) => {
    try {
      const response = await fetch(`${config.bkHubUrl}/kb/status`);
      const kbStatus = await response.json();
      res.json({ success: true, data: { kb: kbStatus, connected: response.ok } });
    } catch (err) {
      res.json({ success: true, data: { kb: null, connected: false, error: err.message } });
    }
  });

  router.post('/sync', async (req, res) => {
    try {
      const result = await learningService.syncAllToKB();
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/sync/campaign', async (req, res) => {
    try {
      const result = await learningService.recordCampaignPerformance(req.body);
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/sync/landing', async (req, res) => {
    try {
      const result = await learningService.recordLandingPerformance(req.body);
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/inspire/creative', async (req, res) => {
    try {
      const { product, target, industry } = req.query;
      const results = await learningService.getCreativeInspiration(product, target, industry);
      res.json({ success: true, data: results });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/inspire/landing', async (req, res) => {
    try {
      const { template, theme, product } = req.query;
      const results = await learningService.getLandingInspiration(template, theme, product);
      res.json({ success: true, data: results });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
