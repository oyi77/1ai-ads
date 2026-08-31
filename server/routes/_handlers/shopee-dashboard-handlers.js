/**
 * Shopee Dashboard Handlers — Extracted from shopee-dashboard.js god function.
 * Each handler is a pure function that takes its deps and returns a middleware.
 * Helpers (parseMultipart, detectAccountFromFilename) preserved module-level.
 * Behavior preserved byte-for-byte vs the inline router definitions.
 */
import { randomUUID } from 'crypto';
import { createLogger } from '../../lib/logger.js';
import { ShopeeCSVParser } from '../../services/shopee-csv-parser.js';

const SHOPEE_ACCOUNTS_KEY = 'shopee_accounts';
const SHOPEE_UPLOADS_KEY = 'shopee_uploads';
const csvParser = new ShopeeCSVParser();
const log = createLogger('shopee-dashboard');

// Settings table is global (no user_id column) — scope these keys per user so
// one tenant can't read/write another's Shopee data. Preserve the global key
// when no user is bound (legacy/system calls).
function keyFor(req, base) {
  const uid = req?.user?.id;
  return uid ? `${base}:${uid}` : base;
}

/**
 * settingsRepo.get() returns either a parsed value (the real repo JSON.parses the
 * stored row) or a raw JSON string (test mocks / legacy callers). Coerce safely so
 * both call shapes yield an array.
 */
function coerceArray(raw) {
  if (raw === null || raw === undefined) return [];
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw); } catch { return []; }
}

// GET /accounts — list configured Shopee seller accounts
export function handleListAccounts(settingsRepo) {
  return (req, res) => {
    try {
      const raw = settingsRepo.get(keyFor(req, SHOPEE_ACCOUNTS_KEY));
      const accounts = coerceArray(raw);
      res.json({ success: true, accounts });
    } catch (err) {
      log.error('Failed to list Shopee accounts', { error: err.message });
      res.json({ success: true, accounts: [] });
    }
  };
}

// GET /accounts/:accountId/orders — fetch orders for an account
export function handleListOrders(shopeeAdapter, settingsRepo) {
  return async (req, res) => {
    const { accountId } = req.params;
    try {
      const raw = settingsRepo.get(keyFor(req, SHOPEE_ACCOUNTS_KEY));
      const accounts = coerceArray(raw);
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
  };
}

// GET /accounts/:accountId/summary — order summary (total, revenue, commission)
export function handleGetSummary(shopeeAdapter, settingsRepo, commissionsRepo) {
  return async (req, res) => {
    const { accountId } = req.params;
    try {
      const raw = settingsRepo.get(keyFor(req, SHOPEE_ACCOUNTS_KEY));
      const accounts = coerceArray(raw);
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
  };
}

// POST /upload — accept CSV file upload, parse, and store
export function handleUpload(settingsRepo, commissionsRepo) {
  return (req, res) => {
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
          const raw = settingsRepo.get(keyFor(req, SHOPEE_UPLOADS_KEY));
          uploads = coerceArray(raw);
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
        settingsRepo.set(keyFor(req, SHOPEE_UPLOADS_KEY), JSON.stringify(uploads));

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
  };
}

// GET /uploads — list uploaded files
export function handleListUploads(settingsRepo) {
  return (req, res) => {
    try {
      const raw = settingsRepo.get(keyFor(req, SHOPEE_UPLOADS_KEY));
      const uploads = coerceArray(raw);
      // Strip embedded data from list response
      const list = uploads.map(({ data: _data, ...meta }) => meta);
      res.json({ success: true, uploads: list });
    } catch (err) {
      log.error('Failed to list uploads', { error: err.message });
      res.json({ success: true, uploads: [] });
    }
  };
}

// DELETE /uploads/:fileId — delete uploaded file
export function handleDeleteUpload(settingsRepo) {
  return (req, res) => {
    const { fileId } = req.params;
    try {
      const raw = settingsRepo.get(keyFor(req, SHOPEE_UPLOADS_KEY));
      const uploads = coerceArray(raw);
      const idx = uploads.findIndex(u => u.id === fileId);
      if (idx === -1) {
        return res.status(404).json({ success: false, error: 'File not found' });
      }

      uploads.splice(idx, 1);
      settingsRepo.set(keyFor(req, SHOPEE_UPLOADS_KEY), JSON.stringify(uploads));
      log.info('Shopee upload deleted', { fileId });
      res.json({ success: true });
    } catch (err) {
      log.error('Failed to delete upload', { fileId, error: err.message });
      res.status(500).json({ success: false, error: 'Failed to delete file' });
    }
  };
}

/**
 * Parse a multipart/form-data buffer into parts.
 * @param {Buffer} buffer
 * @param {string} boundary
 * @returns {Array<{name:string, filename?:string, data:Buffer}>}
 */
function parseMultipart(buffer, boundary) {
  const parts = [];
  const delimiter = `--${boundary}`;
  const segments = buffer.toString('binary').split(delimiter);

  segments.forEach((segment) => {
    if (segment.trim() === '' || segment.startsWith('--')) return;

    const headerEnd = segment.indexOf('\r\n\r\n');
    if (headerEnd === -1) return;

    const header = segment.slice(0, headerEnd);
    const content = segment.slice(headerEnd + 4, segment.lastIndexOf('\r\n'));

    const nameMatch = header.match(/name="([^"]+)"/);
    const filenameMatch = header.match(/filename="([^"]+)"/);

    if (nameMatch) {
      parts.push({
        name: nameMatch[1],
        filename: filenameMatch ? filenameMatch[1] : undefined,
        data: Buffer.from(content, 'binary'),
      });
    }
  });

  return parts;
}

/**
 * Attempt to infer the Shopee account id from the uploaded filename.
 * @param {string} filename
 * @param {object} settingsRepo
 * @returns {string|null}
 */
function detectAccountFromFilename(filename, settingsRepo) {
  try {
    const raw = settingsRepo.get(SHOPEE_ACCOUNTS_KEY);
    const accounts = coerceArray(raw);
    const lower = filename.toLowerCase();
    const match = accounts.find(a => lower.includes(String(a.id).toLowerCase()));
    return match ? match.id : null;
  } catch {
    return null;
  }
}

// Re-export the constants in case the factory needs them (kept stable for behavior parity).
export { SHOPEE_ACCOUNTS_KEY, SHOPEE_UPLOADS_KEY };
