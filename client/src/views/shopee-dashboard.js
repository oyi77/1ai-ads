import { api } from '../lib/api.js';
import { esc } from '../lib/escape.js';

export async function renderShopeeDashboard(el) {
  let accounts = [];
  let activeAccount = null;
  let orders = [];
  let summary = {};

  const loadAccounts = async () => {
    try {
      const { data } = await api.get('/shopee/accounts');
      accounts = Array.isArray(data) ? data : [];
      if (accounts.length > 0 && !activeAccount) {
        activeAccount = accounts[0].id;
      }
    } catch (e) {
      console.error('Failed to load Shopee accounts:', e);
    }
  };

  const loadOrders = async (accountId) => {
    if (!accountId) return;
    try {
      const [ordersRes, summaryRes] = await Promise.all([
        api.get(`/shopee/accounts/${accountId}/orders`),
        api.get(`/shopee/accounts/${accountId}/summary`),
      ]);
      orders = ordersRes.data || [];
      summary = summaryRes.data || {};
    } catch (e) {
      console.error('Failed to load orders:', e);
      orders = [];
      summary = {};
    }
  };

  await loadAccounts();
  if (activeAccount) await loadOrders(activeAccount);
  render();

  function render() {
    el.innerHTML = `
      <div class="max-w-[1400px] mx-auto p-8 animate-fadeIn space-y-8">
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-3xl font-black text-white uppercase tracking-tight">🛒 Shopee Dashboard</h1>
            <p class="text-slate-500 text-sm mt-1">Multi-account order tracking and commission management.</p>
          </div>
          <div class="flex gap-2">
            <button id="refresh-shopee" class="px-4 py-2 bg-[#161b22] border border-[#30363d] text-slate-300 rounded-xl text-xs font-bold hover:text-white transition-all">🔄 Refresh</button>
          </div>
        </div>

        ${accounts.length > 0 ? `
          <div class="flex gap-2 overflow-x-auto pb-2">
            ${accounts.map(a => `
              <button data-account="${a.id}" class="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all ${
                activeAccount === a.id ? 'bg-white text-black' : 'bg-[#161b22] border border-[#30363d] text-slate-400 hover:text-white'
              }">${esc(a.name || a.id)}</button>
            `).join('')}
          </div>
        ` : ''}

        ${activeAccount ? `
          <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div class="bg-[#161b22] border border-[#30363d] rounded-2xl p-5">
              <div class="text-xs font-bold uppercase text-slate-500 tracking-widest mb-2">📦 Total Orders</div>
              <div class="text-3xl font-black text-white">${summary.totalOrders || orders.length || 0}</div>
            </div>
            <div class="bg-[#161b22] border border-[#30363d] rounded-2xl p-5">
              <div class="text-xs font-bold uppercase text-slate-500 tracking-widest mb-2">💰 Revenue</div>
              <div class="text-3xl font-black text-emerald-400">Rp ${(summary.totalRevenue || 0).toLocaleString()}</div>
            </div>
            <div class="bg-[#161b22] border border-[#30363d] rounded-2xl p-5">
              <div class="text-xs font-bold uppercase text-slate-500 tracking-widest mb-2">📊 Commission</div>
              <div class="text-3xl font-black text-sky-400">Rp ${(summary.totalCommission || 0).toLocaleString()}</div>
            </div>
            <div class="bg-[#161b22] border border-[#30363d] rounded-2xl p-5">
              <div class="text-xs font-bold uppercase text-slate-500 tracking-widest mb-2">📈 Avg Order</div>
              <div class="text-3xl font-black text-amber-400">Rp ${(summary.avgOrderValue || 0).toLocaleString()}</div>
            </div>
          </div>

          <div class="bg-[#161b22] border border-[#30363d] rounded-2xl overflow-hidden">
            <div class="p-4 border-b border-[#30363d]">
              <h2 class="text-lg font-bold text-white">Recent Orders</h2>
            </div>
            ${orders.length === 0 ? `
              <div class="p-12 text-center text-slate-500">No orders found.</div>
            ` : `
              <div class="overflow-x-auto">
                <table class="w-full">
                  <thead>
                    <tr class="border-b border-[#30363d]">
                      <th class="text-left p-3 text-xs font-bold text-slate-500 uppercase">Order ID</th>
                      <th class="text-left p-3 text-xs font-bold text-slate-500 uppercase">Product</th>
                      <th class="text-right p-3 text-xs font-bold text-slate-500 uppercase">Amount</th>
                      <th class="text-left p-3 text-xs font-bold text-slate-500 uppercase">Status</th>
                      <th class="text-left p-3 text-xs font-bold text-slate-500 uppercase">Date</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-[#30363d]">
                    ${orders.slice(0, 50).map(o => `
                      <tr class="hover:bg-[#1c2128]">
                        <td class="p-3 text-sm text-slate-300 font-mono">${esc(o.order_id || o.id || '—')}</td>
                        <td class="p-3 text-sm text-white">${esc(o.product_name || o.product || '—')}</td>
                        <td class="p-3 text-sm text-emerald-400 text-right">Rp ${(o.amount || o.total || 0).toLocaleString()}</td>
                        <td class="p-3">
                          <span class="px-2 py-1 rounded text-[10px] font-bold uppercase ${
                            o.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400' :
                            o.status === 'pending' ? 'bg-amber-500/10 text-amber-400' :
                            'bg-slate-500/10 text-slate-400'
                          }">${esc(o.status || '—')}</span>
                        </td>
                        <td class="p-3 text-sm text-slate-500">${o.created_at ? new Date(o.created_at).toLocaleDateString() : '—'}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            `}
          </div>
        ` : `
          <div class="bg-[#161b22] border border-[#30363d] rounded-2xl p-12 text-center">
            <div class="text-4xl mb-4">🛒</div>
            <p class="text-slate-500 mb-4">No Shopee accounts configured.</p>
            <p class="text-xs text-slate-600">Add Shopee seller accounts in Settings to get started.</p>
          </div>
        `}
      </div>
    `;
    bind();
  }

  function bind() {
    el.querySelectorAll('[data-account]').forEach(btn => {
      btn.addEventListener('click', async () => {
        activeAccount = btn.dataset.account;
        await loadOrders(activeAccount);
        render();
      });
    });

    el.querySelector('#refresh-shopee')?.addEventListener('click', async () => {
      if (activeAccount) await loadOrders(activeAccount);
      await loadAccounts();
      render();
    });
  }
}
