import { api } from '../lib/api.js';

let _matches = [];
let _dashboard = {};

export async function renderAttributionView() {
  const container = document.createElement('div');
  container.style.cssText = 'padding:20px;font-family:system-ui;';

  container.innerHTML = `
    <h2 style="color:#00d4ff;margin:0 0 20px">Meta → Shopee Attribution</h2>
    <button id="sync-btn" style="background:#00d4ff;color:#000;border:none;padding:10px 24px;border-radius:8px;cursor:pointer;font-weight:600;margin-bottom:20px">Sync Orders</button>
    <div id="summary" style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px"></div>
    <table style="width:100%;border-collapse:collapse;background:#1a1a2e;border-radius:12px;overflow:hidden">
      <thead><tr style="background:#16213e">
        <th style="color:#00d4ff;padding:12px 16px;text-align:left;font-size:12px;text-transform:uppercase">Ad</th>
        <th style="color:#00d4ff;padding:12px 16px;text-align:left;font-size:12px;text-transform:uppercase">Campaign</th>
        <th style="color:#00d4ff;padding:12px 16px;text-align:left;font-size:12px;text-transform:uppercase">Order</th>
        <th style="color:#00d4ff;padding:12px 16px;text-align:left;font-size:12px;text-transform:uppercase">Revenue</th>
        <th style="color:#00d4ff;padding:12px 16px;text-align:left;font-size:12px;text-transform:uppercase">Method</th>
        <th style="color:#00d4ff;padding:12px 16px;text-align:left;font-size:12px;text-transform:uppercase">Date</th>
      </tr></thead>
      <tbody id="matches-body"></tbody>
    </table>
  `;

  const syncBtn = container.querySelector('#sync-btn');
  syncBtn.addEventListener('click', async () => {
    syncBtn.disabled = true;
    syncBtn.textContent = 'Syncing...';
    try {
      await api.post('/attribution/sync');
      await loadData(container);
    } catch (e) {
      console.error('Sync failed:', e);
    }
    syncBtn.disabled = false;
    syncBtn.textContent = 'Sync Orders';
  });

  await loadData(container);
  return container;
}

async function loadData(container) {
  try {
    const [dashRes, matchRes] = await Promise.all([
      api.get('/attribution/dashboard').catch(() => ({ data: {} })),
      api.get('/attribution/matches').catch(() => ({ data: { matches: [] } })),
    ]);
    _dashboard = dashRes.data || {};
    _matches = matchRes.data?.matches || matchRes.data || [];
  } catch (e) {
    console.error('Load failed:', e);
  }

  const d = _dashboard;
  const summary = container.querySelector('#summary');
  if (summary) {
    summary.innerHTML = `
      <div style="background:#1a1a2e;border-radius:12px;padding:20px;text-align:center">
        <div style="color:#888;font-size:12px;text-transform:uppercase">Total Spend</div>
        <div style="color:#fff;font-size:28px;font-weight:700;margin-top:8px">$${(d.total_ad_spend || 0).toFixed(2)}</div>
      </div>
      <div style="background:#1a1a2e;border-radius:12px;padding:20px;text-align:center">
        <div style="color:#888;font-size:12px;text-transform:uppercase">Shopee Revenue</div>
        <div style="color:#fff;font-size:28px;font-weight:700;margin-top:8px">$${(d.total_revenue || 0).toFixed(2)}</div>
      </div>
      <div style="background:#1a1a2e;border-radius:12px;padding:20px;text-align:center">
        <div style="color:#888;font-size:12px;text-transform:uppercase">ROAS</div>
        <div style="color:${d.roas >= 1 ? '#00e676' : '#ff5252'};font-size:28px;font-weight:700;margin-top:8px">${(d.roas || 0).toFixed(2)}x</div>
      </div>
      <div style="background:#1a1a2e;border-radius:12px;padding:20px;text-align:center">
        <div style="color:#888;font-size:12px;text-transform:uppercase">Attributions</div>
        <div style="color:#fff;font-size:28px;font-weight:700;margin-top:8px">${d.total_attributions || 0}</div>
      </div>
    `;
  }

  const tbody = container.querySelector('#matches-body');
  if (tbody) {
    if (_matches.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#888;padding:16px">No attributions yet. Click Sync Orders to fetch.</td></tr>';
    } else {
      tbody.innerHTML = _matches.map(m => `
        <tr>
          <td style="padding:12px 16px;border-bottom:1px solid #2a2a3e;color:#e0e0e0">${m.ad_id || '-'}</td>
          <td style="padding:12px 16px;border-bottom:1px solid #2a2a3e;color:#e0e0e0">${m.campaign_id || '-'}</td>
          <td style="padding:12px 16px;border-bottom:1px solid #2a2a3e;color:#e0e0e0">${m.shopee_order_id || '-'}</td>
          <td style="padding:12px 16px;border-bottom:1px solid #2a2a3e;color:${m.shopee_revenue >= 0 ? '#00e676' : '#ff5252'}">$${(m.shopee_revenue || 0).toFixed(2)}</td>
          <td style="padding:12px 16px;border-bottom:1px solid #2a2a3e;color:#e0e0e0">${m.match_method || '-'}</td>
          <td style="padding:12px 16px;border-bottom:1px solid #2a2a3e;color:#e0e0e0">${m.matched_at ? new Date(m.matched_at).toLocaleDateString() : '-'}</td>
        </tr>
      `).join('');
    }
  }
}
