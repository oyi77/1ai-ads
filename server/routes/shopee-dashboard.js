import { Router } from 'express';
import { createLogger } from '../lib/logger.js';
import { randomUUID } from 'crypto';
import { ShopeeCSVParser } from '../services/shopee-csv-parser.js';

const log = createLogger('shopee-dashboard');

const SHOPEE_ACCOUNTS_KEY = 'shopee_accounts';
const SHOPEE_UPLOADS_KEY = 'shopee_uploads';

const csvParser = new ShopeeCSVParser();

export function createShopeeDashboardRouter(shopeeAdapter, settingsRepo, commissionsRepo) {
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

      // Try repository first (from CSV uploads)
      if (commissionsRepo) {
        const repoSummary = commissionsRepo.getSummaryByAccount(accountId);
        if (repoSummary.totalOrders > 0) {
          const dailySummary = commissionsRepo.getDailySummary(accountId, 30);
          const recentOrders = commissionsRepo.findByAccount(accountId, 20);
          return res.json({
            success: true,
            accountId,
            summary: {
              totalOrders: repoSummary.totalOrders,
              totalRevenue: repoSummary.totalRevenue,
              totalCommission: repoSummary.totalCommission,
              avgOrderValue: repoSummary.totalOrders > 0
                ? Math.round(repoSummary.totalRevenue / repoSummary.totalOrders)
                : 0,
            },
            dailySummary,
            recentOrders: recentOrders.map(o => ({
              orderId: o.order_id,
              productName: o.product_name,
              shopName: o.shop_name,
              commission: o.commission_amount,
              orderAmount: o.order_amount,
              status: o.status,
              orderDate: o.order_date,
            })),
          });
        }
      }

      // Fall back to live API
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

  // POST /api/shopee/upload — accept CSV file upload, parse, and store
  router.post('/upload', (req, res) => {
    try {
      const chunks = [];
      let totalSize = 0;
      let sizeExceeded = false;
      const MAX_SIZE = 10 * 1024 * 1024; // 10MB

      req.on('data', (chunk) => {
        if (sizeExceeded) return;
        totalSize += chunk.length;
        if (totalSize > MAX_SIZE) {
          sizeExceeded = true;
          res.status(413).json({ success: false, error: 'File too large (max 10MB)' });
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
        let accountId = req.query.accountId || req.headers['x-shopee-account-id'] || null;

        // Parse multipart if present
        if (contentType.includes('multipart/form-data')) {
          const boundary = contentType.split('boundary=')[1];
          if (boundary) {
            const parts = parseMultipart(buffer, boundary);
            if (parts.length > 0) {
              filename = parts[0].filename || filename;
              fileData = parts[0].data.toString('utf-8');
            }
            // Check for accountId field in multipart
            const accountPart = parts.find(p => p.name === 'accountId');
            if (accountPart) {
              accountId = accountPart.data.toString('utf-8').trim();
            }
          }
        }

        // Auto-detect account from filename if not provided
        if (!accountId) {
          accountId = detectAccountFromFilename(filename, settingsRepo);
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
          rows: fileData.split('\n').filter(l => l.trim()).length - 1, // exclude header
          uploadedAt: new Date().toISOString(),
          accountId,
          data: fileData,
        };

        uploads.push(upload);
        settingsRepo.set(SHOPEE_UPLOADS_KEY, JSON.stringify(uploads));

        // Parse CSV and store commission data
        let parseResult = { orders: [], summary: null };
        if (commissionsRepo) {
          try {
            const orders = csvParser.parseCSVString(fileData);
            if (orders.length > 0 && accountId) {
              // Clear previous data for this account before bulk insert
              commissionsRepo.deleteByAccount(accountId);
              commissionsRepo.bulkCreate(accountId, orders);
            }
            const summary = csvParser.calculateSummary(orders);
            parseResult = { orders: orders.length, summary };
          } catch (parseErr) {
            log.error('CSV parse failed', { fileId, error: parseErr.message });
            parseResult = { orders: 0, error: parseErr.message };
          }
        }

        log.info('Shopee CSV uploaded', {
          fileId, filename, rows: upload.rows,
          accountId, parsedOrders: parseResult.orders,
        });

        res.json({
          success: true,
          file: { id: fileId, filename, rows: upload.rows, accountId },
          parsed: parseResult,
        });
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
      const list = uploads.map(({ data: _data, ...meta }) => meta);
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

/**
 * Auto-detect account from filename by matching known account patterns.
 */
function detectAccountFromFilename(filename, settingsRepo) {
  try {
    const raw = settingsRepo.get(SHOPEE_ACCOUNTS_KEY);
    const accounts = raw ? JSON.parse(raw) : [];
    const fnameLower = filename.toLowerCase();

    for (const acc of accounts) {
      const patterns = acc.csv_patterns || [];
      for (const pattern of patterns) {
        if (fnameLower.includes(pattern.toLowerCase())) {
          return acc.id;
        }
      }
      // Also try matching account name/id in filename
      if (acc.name && fnameLower.includes(acc.name.toLowerCase())) {
        return acc.id;
      }
    }
  } catch {
    // ignore
  }
  return null;
}
