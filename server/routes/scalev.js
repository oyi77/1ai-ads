import { Router } from 'express';

export function createScalevRouter(scalevService) {
  const router = Router();

  // Check Scalev connection
  router.get('/status', async (req, res) => {
    try {
      const status = await scalevService.checkConnection();
      res.json({ success: true, data: status });
    } catch (err) {
      res.json({ success: true, data: { connected: false, error: err.message } });
    }
  });

  // List products from Scalev store
  router.get('/products', async (req, res) => {
    try {
      const products = await scalevService.listProducts();
      res.json({ success: true, data: products });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Create checkout order
  router.post('/orders', async (req, res) => {
    const { store_unique_id, customer_name, customer_phone, customer_email, variant_unique_id, quantity } = req.body;

    if (!store_unique_id || !variant_unique_id) {
      return res.status(400).json({ success: false, error: 'store_unique_id and variant_unique_id are required' });
    }

    try {
      const order = await scalevService.createOrder({
        storeUniqueId: store_unique_id,
        customerName: customer_name,
        customerPhone: customer_phone,
        customerEmail: customer_email,
        variantUniqueId: variant_unique_id,
        quantity: quantity || 1,
      });
      res.json({ success: true, data: order });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get embed URL for a Scalev checkout form
  router.get('/embed-url', (req, res) => {
    const { store_slug, page_slug } = req.query;
    if (!store_slug) {
      return res.status(400).json({ success: false, error: 'store_slug is required' });
    }
    try {
      const url = scalevService.getEmbedUrl(store_slug, page_slug);
      res.json({ success: true, data: { url } });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Webhook endpoint for Scalev order notifications (public - no auth required)
  // This will be mounted separately outside requireAuth
  router.post('/webhook', (req, res) => {
    const event = req.body;
    console.log('Scalev webhook received:', JSON.stringify(event).substring(0, 200));
    // TODO: Process order events (paid, shipped, etc.)
    // Store in database for analytics
    res.json({ success: true });
  });

  return router;
}
