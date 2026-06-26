import { Router } from 'express';
import { bus, EVENTS } from '../lib/event-bus.js';

export function createEventsRouter() {
  const router = Router();

  // SSE stream for real-time events
  router.get('/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const handler = (event) => (data) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // Subscribe to all events
    const unsubscribers = Object.values(EVENTS).map(event => {
      const h = handler(event);
      bus.on(event, h);
      return () => bus.off(event, h);
    });

    // Heartbeat every 30s
    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 30000);

    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribers.forEach(unsub => unsub());
    });
  });

  // List available events
  router.get('/', (_req, res) => {
    res.json({ events: Object.values(EVENTS) });
  });

  return router;
}
