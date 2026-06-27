import crypto from 'crypto';
import { createLogger } from '../lib/logger.js';

const log = createLogger('white-label');

export class WhiteLabelService {
  /**
   * @param {Object} db - better-sqlite3 database instance
   * @param {Object} llmClient - LLMClient instance
   */
  constructor(db, llmClient) {
    this.db = db;
    this.llm = llmClient;
    this._ensureTables();
  }

  // ── Schema Bootstrap ─────────────────────────────────────────

  _ensureTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS clients (
        id TEXT PRIMARY KEY,
        agency_id TEXT NOT NULL,
        name TEXT NOT NULL,
        company TEXT,
        email TEXT,
        logo_url TEXT,
        brand_color TEXT DEFAULT '#3b82f6',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        agency_id TEXT NOT NULL,
        type TEXT DEFAULT 'weekly',
        data TEXT NOT NULL DEFAULT '{}',
        pdf_url TEXT,
        sent_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_clients_agency ON clients(agency_id);
      CREATE INDEX IF NOT EXISTS idx_reports_client ON reports(client_id);
      CREATE INDEX IF NOT EXISTS idx_reports_agency ON reports(agency_id);
    `);
  }

  // ── Client CRUD ──────────────────────────────────────────────

  getClients(agencyId) {
    return this.db.prepare(
      'SELECT * FROM clients WHERE agency_id = ? ORDER BY created_at DESC'
    ).all(agencyId);
  }

  getClient(clientId) {
    return this.db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);
  }

  createClient({ agencyId, name, company, email, logoUrl, brandColor }) {
    if (!agencyId || !name) throw new Error('agencyId and name are required');
    const id = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO clients (id, agency_id, name, company, email, logo_url, brand_color)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, agencyId, name, company || null, email || null, logoUrl || null, brandColor || '#3b82f6');
    return this.getClient(id);
  }

  updateClient(clientId, updates) {
    const client = this.getClient(clientId);
    if (!client) throw new Error(`Client ${clientId} not found`);

    const fields = [];
    const values = [];
    for (const [key, val] of Object.entries(updates)) {
      const col = key === 'logoUrl' ? 'logo_url' : key === 'brandColor' ? 'brand_color' : key;
      if (['name', 'company', 'email', 'logo_url', 'brand_color'].includes(col)) {
        fields.push(`${col} = ?`);
        values.push(val);
      }
    }
    if (!fields.length) return client;

    values.push(clientId);
    this.db.prepare(`UPDATE clients SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.getClient(clientId);
  }

  deleteClient(clientId) {
    this.db.prepare('DELETE FROM reports WHERE client_id = ?').run(clientId);
    this.db.prepare('DELETE FROM clients WHERE id = ?').run(clientId);
  }

  // ── Report Generation ────────────────────────────────────────

  /**
   * Generate a report for a client.
   * @param {{ clientId: string, agencyId: string, type?: string, data?: Object }} opts
   * @returns {Object} report record
   */
  async generateReport({ clientId, agencyId, type = 'weekly', data = {} }) {
    if (!clientId || !agencyId) throw new Error('clientId and agencyId are required');

    const client = this.getClient(clientId);
    if (!client) throw new Error(`Client ${clientId} not found`);

    const id = crypto.randomUUID();

    // If LLM available, generate summary text
    const reportData = { ...data };
    if (this.llm && !data.summary) {
      try {
        const summary = await this.llm.call(
          'You are a marketing analyst. Write a concise performance summary.',
          `Client: ${client.name}. Period: ${type}. Data: ${JSON.stringify(data)}. Write a 3-5 sentence executive summary.`,
          { temperature: 0.3 }
        );
        reportData.summary = summary;
      } catch (err) {
        log.warn('generateReport: LLM summary failed', { error: err.message });
      }
    }

    const html = this.renderReportHTML({ client, type, data: reportData });

    this.db.prepare(`
      INSERT INTO reports (id, client_id, agency_id, type, data)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, clientId, agencyId, type, JSON.stringify(reportData));

    return {
      id,
      clientId,
      agencyId,
      type,
      data: reportData,
      html,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Get reports for a client or agency.
   */
  getReports({ clientId, agencyId, limit = 50 } = {}) {
    if (clientId) {
      return this.db.prepare(
        'SELECT * FROM reports WHERE client_id = ? ORDER BY created_at DESC LIMIT ?'
      ).all(clientId, limit);
    }
    if (agencyId) {
      return this.db.prepare(
        'SELECT * FROM reports WHERE agency_id = ? ORDER BY created_at DESC LIMIT ?'
      ).all(agencyId, limit);
    }
    return [];
  }

  getReport(reportId) {
    return this.db.prepare('SELECT * FROM reports WHERE id = ?').get(reportId);
  }

  markReportSent(reportId) {
    this.db.prepare('UPDATE reports SET sent_at = CURRENT_TIMESTAMP WHERE id = ?').run(reportId);
    return this.getReport(reportId);
  }

  // ── HTML Rendering ───────────────────────────────────────────

  /**
   * Render a branded HTML report document.
   * @param {{ client: Object, type: string, data: Object }} opts
   * @returns {string} full HTML document
   */
  renderReportHTML({ client, type, data }) {
    const brandColor = client.brand_color || '#3b82f6';
    const logo = client.logo_url
      ? `<img src="${client.logo_url}" alt="${client.name}" style="max-height:48px;" />`
      : `<span style="font-size:24px;font-weight:bold;color:${brandColor};">${client.name}</span>`;

    const periodLabel = type === 'daily' ? 'Daily' : type === 'monthly' ? 'Monthly' : 'Weekly';
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const metrics = data.metrics || data;
    const summary = data.summary || 'Performance report for the period.';

    const metricRows = Object.entries(metrics)
      .filter(([k]) => !['summary', 'campaigns', 'notes'].includes(k))
      .map(([key, val]) => `
        <tr>
          <td style="padding:8px 16px;border-bottom:1px solid #e5e7eb;font-weight:500;">${this._humanize(key)}</td>
          <td style="padding:8px 16px;border-bottom:1px solid #e5e7eb;text-align:right;">${this._formatValue(val, key)}</td>
        </tr>
      `).join('');

    const campaigns = data.campaigns || [];
    const campaignRows = campaigns.map(c => `
      <tr>
        <td style="padding:8px 16px;border-bottom:1px solid #e5e7eb;">${c.name || c.id || '—'}</td>
        <td style="padding:8px 16px;border-bottom:1px solid #e5e7eb;text-align:right;">${c.spend ? `$${c.spend.toFixed(2)}` : '—'}</td>
        <td style="padding:8px 16px;border-bottom:1px solid #e5e7eb;text-align:right;">${c.roas ? `${c.roas.toFixed(2)}x` : '—'}</td>
        <td style="padding:8px 16px;border-bottom:1px solid #e5e7eb;text-align:right;">${c.conversions ?? '—'}</td>
      </tr>
    `).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${periodLabel} Report — ${client.name}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; color:#1f2937; background:#f9fafb; }
    .container { max-width:800px; margin:0 auto; padding:32px 24px; }
    .header { display:flex; justify-content:space-between; align-items:center; margin-bottom:32px; padding-bottom:16px; border-bottom:3px solid ${brandColor}; }
    h1 { font-size:20px; color:${brandColor}; }
    .summary { background:#fff; border-radius:8px; padding:20px; margin-bottom:24px; box-shadow:0 1px 3px rgba(0,0,0,0.08); line-height:1.6; }
    table { width:100%; border-collapse:collapse; background:#fff; border-radius:8px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.08); margin-bottom:24px; }
    th { background:${brandColor}; color:#fff; text-align:left; padding:10px 16px; font-size:13px; text-transform:uppercase; letter-spacing:0.05em; }
    .footer { text-align:center; font-size:12px; color:#9ca3af; margin-top:32px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>${logo}</div>
      <div style="text-align:right;">
        <h1>${periodLabel} Report</h1>
        <span style="color:#6b7280;font-size:14px;">${dateStr}</span>
      </div>
    </div>

    <div class="summary">
      <h2 style="margin-bottom:8px;font-size:16px;">Executive Summary</h2>
      <p>${summary}</p>
    </div>

    ${metricRows ? `
    <table>
      <thead>
        <tr>
          <th>Metric</th>
          <th style="text-align:right;">Value</th>
        </tr>
      </thead>
      <tbody>${metricRows}</tbody>
    </table>` : ''}

    ${campaignRows ? `
    <h2 style="margin-bottom:12px;font-size:16px;">Campaign Performance</h2>
    <table>
      <thead>
        <tr>
          <th>Campaign</th>
          <th style="text-align:right;">Spend</th>
          <th style="text-align:right;">ROAS</th>
          <th style="text-align:right;">Conversions</th>
        </tr>
      </thead>
      <tbody>${campaignRows}</tbody>
    </table>` : ''}

    ${data.notes ? `<div class="summary"><h2 style="margin-bottom:8px;font-size:16px;">Notes</h2><p>${data.notes}</p></div>` : ''}

    <div class="footer">
      Powered by 1ai-ads &bull; Report generated ${dateStr}
    </div>
  </div>
</body>
</html>`;
  }

  // ── Helpers ──────────────────────────────────────────────────

  _humanize(key) {
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase())
      .trim();
  }

  _formatValue(val, key) {
    if (typeof val !== 'number') return String(val ?? '—');
    if (key.toLowerCase().includes('spend') || key.toLowerCase().includes('cost') || key.toLowerCase().includes('revenue')) {
      return `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (key.toLowerCase().includes('roas') || key.toLowerCase().includes('rate') || key.toLowerCase().includes('ctr')) {
      return `${val.toFixed(2)}${key.toLowerCase().includes('roas') ? 'x' : '%'}`;
    }
    if (key.toLowerCase().includes('percent')) {
      return `${val.toFixed(1)}%`;
    }
    return val.toLocaleString('en-US');
  }
}
