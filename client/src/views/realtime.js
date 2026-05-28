import { LitElement, html, css } from 'lit';

export class RealtimeDashboard extends LitElement {
  static styles = css`
    :host { display: block; padding: 20px; font-family: system-ui; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }
    .card { background: #1a1a2e; border-radius: 12px; padding: 20px; color: #e0e0e0; }
    .card h3 { color: #00d4ff; margin: 0 0 12px; font-size: 14px; text-transform: uppercase; }
    .metric { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #2a2a3e; }
    .metric:last-child { border: none; }
    .metric-label { color: #888; font-size: 13px; }
    .metric-value { color: #fff; font-weight: 600; }
    .metric-value.positive { color: #00e676; }
    .metric-value.negative { color: #ff5252; }
    .status { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; }
    .status.active { background: #1b5e20; color: #4caf50; }
    .status.paused { background: #4a1a1a; color: #ff5252; }
    .ws-status { position: fixed; bottom: 20px; right: 20px; padding: 8px 16px; border-radius: 20px; font-size: 12px; }
    .ws-status.connected { background: #1b5e20; color: #4caf50; }
    .ws-status.disconnected { background: #4a1a1a; color: #ff5252; }
  `;

  static properties = {
    campaigns: { type: Object },
    wsConnected: { type: Boolean },
  };

  constructor() {
    super();
    this.campaigns = {};
    this.wsConnected = false;
    this._ws = null;
    this._connect();
  }

  _connect() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this._ws = new WebSocket(`${protocol}//${location.host}/ws/realtime`);
    this._ws.onopen = () => { this.wsConnected = true; this.requestUpdate(); };
    this._ws.onclose = () => { this.wsConnected = false; this.requestUpdate(); setTimeout(() => this._connect(), 5000); };
    this._ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'metric_update') {
        this.campaigns = { ...this.campaigns, [msg.data.campaign_id]: msg.data };
        this.requestUpdate();
      } else if (msg.type === 'snapshot') {
        this.campaigns = msg.data || {};
        this.requestUpdate();
      }
    };
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._ws?.close();
  }

  _fmt(n) {
    if (n == null) return '-';
    return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  render() {
    const entries = Object.values(this.campaigns);
    return html`
      <h2 style="color:#00d4ff;margin:0 0 20px">Real-Time Dashboard</h2>
      <div class="grid">
        ${entries.map(c => html`
          <div class="card">
            <h3>${c.name || c.campaign_id}</h3>
            <span class="status ${c.status === 'ACTIVE' ? 'active' : 'paused'}">${c.status || 'UNKNOWN'}</span>
            <div style="margin-top:12px">
              <div class="metric"><span class="metric-label">Spend</span><span class="metric-value">$${this._fmt(c.spend)}</span></div>
              <div class="metric"><span class="metric-label">Clicks</span><span class="metric-value">${c.clicks || 0}</span></div>
              <div class="metric"><span class="metric-label">Impressions</span><span class="metric-value">${c.impressions || 0}</span></div>
              <div class="metric"><span class="metric-label">Conversions</span><span class="metric-value">${c.conversions || 0}</span></div>
              <div class="metric"><span class="metric-label">CTR</span><span class="metric-value">${this._fmt(c.ctr)}%</span></div>
              <div class="metric"><span class="metric-label">CPC</span><span class="metric-value">$${this._fmt(c.cpc)}</span></div>
              <div class="metric"><span class="metric-label">ROAS</span><span class="metric-value ${(c.roas || 0) >= 1 ? 'positive' : 'negative'}">${c.roas ? this._fmt(c.roas) + 'x' : '-'}</span></div>
            </div>
          </div>
        `)}
        ${entries.length === 0 ? html`<div class="card"><h3>No Active Campaigns</h3><p style="color:#888">Waiting for metric updates...</p></div>` : ''}
      </div>
      <div class="ws-status ${this.wsConnected ? 'connected' : 'disconnected'}">
        ${this.wsConnected ? '● Live' : '○ Disconnected'}
      </div>
    `;
  }
}

customElements.define('realtime-dashboard', RealtimeDashboard);
