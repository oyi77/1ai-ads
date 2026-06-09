import { Router } from 'express';
import { createLogger } from '../lib/logger.js';
import { randomUUID } from 'crypto';

const log = createLogger('shopee-dashboard');

const SHOPEE_ACCOUNTS_KEY = 'shopee_accounts';
const SHOPEE_UPLOADS_KEY = 'shopee_uploads';

export function createShopeeDashboardRouter(shopeeAdapter, settingsRepo) {
  const router = Router();

  // GET /api/shopee/accounts — list configured Shopee seller accounts
  router.get('/accounts', (req, res) => {
    try {
      const raw = settingsRepo.get(SHOPEE_ACCOUNTS_KEY);
      const accounts = raw ? JSON.parse(raw) : [];
      res.json({ success: true, accounts });
    } catch (err) {
      log.error('Failed to list Shopee accounts', { error: err.message });
      res.json({ success: true, accounts: [] });
    }
  });

  // GET /api/shopee/accounts/:accountId/orders — fetch orders for an account
  router.get('/accounts/:accountId/orders', async (req, res) => {
    const { accountId } = req.params;
    try {
      const raw = settingsRepo.get(SHOPEE_ACCOUNTS_KEY);
      const accounts = raw ? JSON.parse(raw) : [];
      const account = accounts.find(a => a.id === accountId);
      if (!account) {
        return res.status(404).json({ success: false, error: 'Account not found' });
      }

      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 50;

      const orders = await shopeeAdapter.fetchOrders({ page, limit, sellerId: account.seller_id });
      res.json({ success: true, orders: orders || [], accountId });
    } catch (err) {
      log.error('Failed to fetch Shopee orders', { accountId, error: err.message });
      res.status(500).json({ success: false, error: 'Failed to fetch orders' });
    }
  });

  // GET /api/shopee/accounts/:accountId/summary — order summary (total, revenue, commission)
  router.get('/accounts/:accountId/summary', async (req, res) => {
    const { accountId } = req.params;
    try {
      const raw = settingsRepo.get(SHOPEE_ACCOUNTS_KEY);
      const accounts = raw ? JSON.parse(raw) : [];
      const account = accounts.find(a => a.id === accountId);
      if (!account) {
        return res.status(404).json({ success: false, error: 'Account not found' });
      }

      const orders = await shopeeAdapter.fetchOrders({ sellerId: account.seller_id }) || [];

      let totalRevenue = 0;
      let totalCommission = 0;
      for (const order of orders) {
        totalRevenue += Number(order.total) || 0;
        totalCommission += Number(order.commission) || 0;
      }

      res.json({
        success: true,
        accountId,
        summary: {
          totalOrders: orders.length,
          totalRevenue,
          totalCommission,
        },
      });
    } catch (err) {
      log.error('Failed to compute Shopee summary', { accountId, error: err.message });
      res.status(500).json({ success: false, error: 'Failed to compute summary' });
    }
  });

  // POST /api/shopee/upload — accept CSV file upload
  router.post('/upload', (req, res) => {
    try {
      const chunks = [];
      let totalSize = 0;
      const MAX_SIZE = 10 * 1024 * 1024; // 10MB

      req.on('data', (chunk) => {
        totalSize += chunk.length;
        if (totalSize > MAX_SIZE) {
          res.status(413).json({ success: false, error: 'File too large (max 10MB)' });
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });

      req.on('end', () => {
        if (res.headersSent) return;

        const buffer = Buffer.concat(chunks);
        const contentType = req.headers['content-type'] || '';

        let filename = 'upload.csv';
        let fileData = buffer.toString('utf-8');

        // Parse multipart if present
        if (contentType.includes('multipart/form-data')) {
          const boundary = contentType.split('boundary=')[1];
          if (boundary) {
            const parts = parseMultipart(buffer, boundary);
            if (parts.length > 0) {
              filename = parts[0].filename || filename;
              fileData = parts[0].data.toString('utf-8');
            }
          }
        }

        const fileId = randomUUID();
        let uploads = [];
        try {
          const raw = settingsRepo.get(SHOPEE_UPLOADS_KEY);
          uploads = raw ? JSON.parse(raw) : [];
        } catch {
          uploads = [];
        }

        const upload = {
          id: fileId,
          filename,
          size: buffer.length,
          rows: fileData.split('\n').filter(l => l.trim()).length,
          uploadedAt: new Date().toISOString(),
          data: fileData,
        };

        uploads.push(upload);
        settingsRepo.set(SHOPEE_UPLOADS_KEY, JSON.stringify(uploads));

        log.info('Shopee CSV uploaded', { fileId, filename, rows: upload.rows });
        res.json({ success: true, file: { id: fileId, filename, rows: upload.rows } });
      });

      req.on('error', (err) => {
        log.error('Upload stream error', { error: err.message });
        if (!res.headersSent) {
          res.status(500).json({ success: false, error: 'Upload failed' });
        }
      });
    } catch (err) {
      log.error('Shopee upload failed', { error: err.message });
      res.status(500).json({ success: false, error: 'Upload failed' });
    }
  });

  // GET /api/shopee/uploads — list uploaded files
  router.get('/uploads', (req, res) => {
    try {
      const raw = settingsRepo.get(SHOPEE_UPLOADS_KEY);
      const uploads = raw ? JSON.parse(raw) : [];
      // Strip embedded data from list response
      const list = uploads.map(({ data, ...meta }) => meta);
      res.json({ success: true, uploads: list });
    } catch (err) {
      log.error('Failed to list uploads', { error: err.message });
      res.json({ success: true, uploads: [] });
    }
  });

  // DELETE /api/shopee/uploads/:fileId — delete uploaded file
  router.delete('/uploads/:fileId', (req, res) => {
    const { fileId } = req.params;
    try {
      const raw = settingsRepo.get(SHOPEE_UPLOADS_KEY);
      const uploads = raw ? JSON.parse(raw) : [];
      const idx = uploads.findIndex(u => u.id === fileId);
      if (idx === -1) {
        return res.status(404).json({ success: false, error: 'File not found' });
      }

      uploads.splice(idx, 1);
      settingsRepo.set(SHOPEE_UPLOADS_KEY, JSON.stringify(uploads));
      log.info('Shopee upload deleted', { fileId });
      res.json({ success: true });
    } catch (err) {
      log.error('Failed to delete upload', { fileId, error: err.message });
      res.status(500).json({ success: false, error: 'Failed to delete file' });
    }
  });

  return router;
}

/**
 * Minimal multipart/form-data parser for CSV file uploads.
 */
function parseMultipart(buffer, boundary) {
  const parts = [];
  const boundaryBuf = Buffer.from(`--${boundary}`);
  const str = buffer.toString('latin1');
  const sections = str.split(`--${boundary}`);

  for (const section of sections) {
    if (section === '--' || section === '--\r\n' || section.trim() === '') continue;

    const headerEnd = section.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;

    const headerSection = section.slice(0, headerEnd);
    const bodySection = section.slice(headerEnd + 4);

    const nameMatch = headerSection.match(/name="([^"]+)"/);
    const filenameMatch = headerSection.match(/filename="([^"]+)"/);

    // Strip trailing \r\n from body
    const body = bodySection.endsWith('\r\n')
      ? bodySection.slice(0, -2)
      : bodySection;

    parts.push({
      name: nameMatch ? nameMatch[1] : null,
      filename: filenameMatch ? filenameMatch[1] : null,
      data: Buffer.from(body, 'latin1'),
    });
  }

  return parts;
}
