let _campaigns = {};
let _wsConnected = false;
let _ws = null;
let _container = null;

function fmt(n) {
  if (n == null) return '-';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function renderCards() {
  if (!_container) return;
  const entries = Object.values(_campaigns);
  const grid = _container.querySelector('#rt-grid');
  const status = _container.querySelector('#ws-status');
  if (!grid) return;

  grid.innerHTML = entries.map(c => `
    <div style="background:#1a1a2e;border-radius:12px;padding:20px;color:#e0e0e0">
      <h3 style="color:#00d4ff;margin:0 0 12px;font-size:14px;text-transform:uppercase">${c.name || c.campaign_id}</h3>
      <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;background:${c.status === 'ACTIVE' ? '#1b5e20' : '#4a1a1a'};color:${c.status === 'ACTIVE' ? '#4caf50' : '#ff5252'}">${c.status || 'UNKNOWN'}</span>
      <div style="margin-top:12px">
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #2a2a3e"><span style="color:#888;font-size:13px">Spend</span><span style="color:#fff;font-weight:600">$${fmt(c.spend)}</span></div>
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #2a2a3e"><span style="color:#888;font-size:13px">Clicks</span><span style="color:#fff;font-weight:600">${c.clicks || 0}</span></div>
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #2a2a3e"><span style="color:#888;font-size:13px">Impressions</span><span style="color:#fff;font-weight:600">${c.impressions || 0}</span></div>
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #2a2a3e"><span style="color:#888;font-size:13px">Conversions</span><span style="color:#fff;font-weight:600">${c.conversions || 0}</span></div>
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #2a2a3e"><span style="color:#888;font-size:13px">CTR</span><span style="color:#fff;font-weight:600">${fmt(c.ctr)}%</span></div>
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #2a2a3e"><span style="color:#888;font-size:13px">CPC</span><span style="color:#fff;font-weight:600">$${fmt(c.cpc)}</span></div>
        <div style="display:flex;justify-content:space-between;padding:8px 0"><span style="color:#888;font-size:13px">ROAS</span><span style="color:${(c.roas || 0) >= 1 ? '#00e676' : '#ff5252'};font-weight:600">${c.roas ? fmt(c.roas) + 'x' : '-'}</span></div>
      </div>
    </div>
  `).join('') || '<div style="background:#1a1a2e;border-radius:12px;padding:20px;color:#e0e0e0"><h3 style="color:#00d4ff;margin:0">No Active Campaigns</h3><p style="color:#888">Waiting for metric updates...</p></div>';

  if (status) {
    status.className = '';
    status.style.cssText = `position:fixed;bottom:20px;right:20px;padding:8px 16px;border-radius:20px;font-size:12px;background:${_wsConnected ? '#1b5e20' : '#4a1a1a'};color:${_wsConnected ? '#4caf50' : '#ff5252'}`;
    status.textContent = _wsConnected ? '● Live' : '○ Disconnected';
  }
}

function connect() {
  if (_ws) { try { _ws.close(); } catch {} }
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  _ws = new WebSocket(`${protocol}//${location.host}/ws/realtime`);
  _ws.onopen = () => { _wsConnected = true; renderCards(); };
  _ws.onclose = () => { _wsConnected = false; renderCards(); setTimeout(connect, 5000); };
  _ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'metric_update') {
      _campaigns = { ..._campaigns, [msg.data.campaign_id]: msg.data };
      renderCards();
    } else if (msg.type === 'snapshot') {
      _campaigns = msg.data || {};
      renderCards();
    }
  };
}

export function renderRealtimeView() {
  _container = document.createElement('div');
  _container.style.cssText = 'padding:20px;font-family:system-ui;';
  _container.innerHTML = `
    <h2 style="color:#00d4ff;margin:0 0 20px">Real-Time Dashboard</h2>
    <div id="rt-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px"></div>
    <div id="ws-status" style="position:fixed;bottom:20px;right:20px;padding:8px 16px;border-radius:20px;font-size:12px;background:#4a1a1a;color:#ff5252">○ Disconnected</div>
  `;
  connect();
  renderCards();
  return _container;
}

export function disconnectRealtime() {
  if (_ws) { try { _ws.close(); } catch {} _ws = null; }
  _container = null;
}
