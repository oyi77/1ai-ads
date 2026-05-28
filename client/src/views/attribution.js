import { LitElement, html, css } from 'lit';

export class AttributionDashboard extends LitElement {
  static styles = css`
    :host { display: block; padding: 20px; font-family: system-ui; }
    table { width: 100%; border-collapse: collapse; background: #1a1a2e; border-radius: 12px; overflow: hidden; }
    th { background: #16213e; color: #00d4ff; padding: 12px 16px; text-align: left; font-size: 12px; text-transform: uppercase; }
    td { padding: 12px 16px; border-bottom: 1px solid #2a2a3e; color: #e0e0e0; }
    tr:last-child td { border: none; }
    .positive { color: #00e676; }
    .negative { color: #ff5252; }
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
    .summary-card { background: #1a1a2e; border-radius: 12px; padding: 20px; text-align: center; }
    .summary-card .label { color: #888; font-size: 12px; text-transform: uppercase; }
    .summary-card .value { color: #fff; font-size: 28px; font-weight: 700; margin-top: 8px; }
    .sync-btn { background: #00d4ff; color: #000; border: none; padding: 10px 24px; border-radius: 8px; cursor: pointer; font-weight: 600; margin-bottom: 20px; }
    .sync-btn:hover { background: #00b8d4; }
  `;

  static properties = {
    dashboard: { type: Object },
    matches: { type: Array },
    loading: { type: Boolean },
  };

  constructor() {
    super();
    this.dashboard = {};
    this.matches = [];
    this.loading = false;
    this._loadData();
  }

  async _loadData() {
    const token = localStorage.getItem('token');
    const headers = { 'Authorization': `Bearer ${token}` };
    try {
      const [dashRes, matchRes] = await Promise.all([
        fetch('/api/attribution/dashboard', { headers }),
        fetch('/api/attribution/matches', { headers }),
      ]);
      if (dashRes.ok) this.dashboard = await dashRes.json();
      if (matchRes.ok) {
        const data = await matchRes.json();
        this.matches = data.matches || data.data || [];
      }
    } catch (e) { console.error('Load failed:', e); }
  }

  async _sync() {
    this.loading = true;
    const token = localStorage.getItem('token');
    try {
      await fetch('/api/attribution/sync', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });
      await this._loadData();
    } catch (e) { console.error('Sync failed:', e); }
    this.loading = false;
  }

  render() {
    const d = this.dashboard;
    return html`
      <h2 style="color:#00d4ff;margin:0 0 20px">Meta → Shopee Attribution</h2>
      <button class="sync-btn" @click=${this._sync} ?disabled=${this.loading}>
        ${this.loading ? 'Syncing...' : 'Sync Orders'}
      </button>
      <div class="summary">
        <div class="summary-card"><div class="label">Total Spend</div><div class="value">$${(d.total_ad_spend || 0).toFixed(2)}</div></div>
        <div class="summary-card"><div class="label">Shopee Revenue</div><div class="value">$${(d.total_revenue || 0).toFixed(2)}</div></div>
        <div class="summary-card"><div class="label">ROAS</div><div class="value ${d.roas >= 1 ? 'positive' : 'negative'}">${(d.roas || 0).toFixed(2)}x</div></div>
        <div class="summary-card"><div class="label">Attributions</div><div class="value">${d.total_attributions || 0}</div></div>
      </div>
      <table>
        <thead><tr><th>Ad</th><th>Campaign</th><th>Order</th><th>Revenue</th><th>Method</th><th>Date</th></tr></thead>
        <tbody>
          ${this.matches.map(m => html`
            <tr>
              <td>${m.ad_id || '-'}</td>
              <td>${m.campaign_id || '-'}</td>
              <td>${m.shopee_order_id || '-'}</td>
              <td class="${m.shopee_revenue >= 0 ? 'positive' : 'negative'}">$${(m.shopee_revenue || 0).toFixed(2)}</td>
              <td>${m.match_method || '-'}</td>
              <td>${m.matched_at ? new Date(m.matched_at).toLocaleDateString() : '-'}</td>
            </tr>
          `)}
          ${this.matches.length === 0 ? html`<tr><td colspan="6" style="text-align:center;color:#888">No attributions yet. Click Sync Orders to fetch.</td></tr>` : ''}
        </tbody>
      </table>
    `;
  }
}

customElements.define('attribution-dashboard', AttributionDashboard);
