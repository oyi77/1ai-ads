import { Router } from 'express';

export function createImagesRouter(imageGenerator) {
  const router = Router();

  router.post('/generate', async (req, res) => {
    try {
      const { product, style, platform, dimensions } = req.body;
      if (!product) return res.status(400).json({ success: false, error: 'product required' });
      const data = await imageGenerator.generateAdImage({ product, style, platform, dimensions });
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/variants', async (req, res) => {
    try {
      const { product, count, styles } = req.body;
      if (!product) return res.status(400).json({ success: false, error: 'product required' });
      const data = await imageGenerator.generateVariants({ product, count, styles });
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
