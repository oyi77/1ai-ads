import { Router } from 'express';

export function createPaymentsRouter() {
  const router = Router();

  router.post('/initiate', (req, res) => {
    res.status(501).json({
      success: false,
      error: 'Direct payment gateway integration not yet implemented. Use Scalev for checkout.',
      available: ['scalev'],
    });
  });

  router.get('/status/:orderId', (req, res) => {
    res.status(501).json({
      success: false,
      error: 'Payment status tracking not yet implemented',
    });
  });

  return router;
}