import { api } from '../lib/api.js';
import { esc } from '../lib/escape.js';

export async function renderAdminUsers(el) {
  let users = [];
  let stats = {};

  const loadData = async () => {
    try {
      const [usersRes, statsRes] = await Promise.all([
        api.get('/admin/users'),
        api.get('/admin/stats'),
      ]);
      users = usersRes.data || [];
      stats = statsRes.data || {};
    } catch (e) {
      console.error('Failed to load admin data:', e);
      if (e.message?.includes('403') || e.message?.includes('Admin')) {
        el.innerHTML = `<div class="max-w-lg mx-auto p-8 text-center"><h1 class="text-2xl font-bold text-red-400 mb-4">Access Denied</h1><p class="text-slate-500">Admin privileges required.</p></div>`;
        return;
      }
    }
  };

  await loadData();
  if (!el.querySelector('[data-admin]')) render();

  function render() {
    el.innerHTML = `
      <div class="max-w-[1200px] mx-auto p-8 animate-fadeIn space-y-8" data-admin>
        <div>
          <h1 class="text-3xl font-black text-white uppercase tracking-tight">User Management</h1>
          <p class="text-slate-500 text-sm mt-1">Manage platform users and permissions.</p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          ${renderStatCard('Total Users', stats.totalUsers || users.length, '👥')}
          ${renderStatCard('Active', stats.activeUsers || users.filter(u => u.is_active).length, '✅')}
          ${renderStatCard('Admins', users.filter(u => u.role === 'admin').length, '🔑')}
          ${renderStatCard('Campaigns', stats.totalCampaigns || 0, '📊')}
        </div>

        <div class="bg-[#161b22] border border-[#30363d] rounded-2xl overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead>
                <tr class="border-b border-[#30363d]">
                  <th class="text-left p-4 text-xs font-bold text-slate-500 uppercase">User</th>
                  <th class="text-left p-4 text-xs font-bold text-slate-500 uppercase">Email</th>
                  <th class="text-left p-4 text-xs font-bold text-slate-500 uppercase">Role</th>
                  <th class="text-left p-4 text-xs font-bold text-slate-500 uppercase">Status</th>
                  <th class="text-left p-4 text-xs font-bold text-slate-500 uppercase">Joined</th>
                  <th class="text-right p-4 text-xs font-bold text-slate-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-[#30363d]">
                ${users.map(u => `
                  <tr class="hover:bg-[#1c2128] transition-colors" data-user-id="${u.id}">
                    <td class="p-4 text-sm font-medium text-white">${esc(u.username)}</td>
                    <td class="p-4 text-sm text-slate-400">${esc(u.email || '—')}</td>
                    <td class="p-4">
                      <span class="px-2 py-1 rounded text-[10px] font-bold uppercase ${
                        u.role === 'admin' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                        'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                      }">${esc(u.role || 'user')}</span>
                    </td>
                    <td class="p-4">
                      <span class="px-2 py-1 rounded text-[10px] font-bold uppercase ${
                        u.is_active ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                        'bg-red-500/10 text-red-400 border border-red-500/20'
                      }">${u.is_active ? 'Active' : 'Inactive'}</span>
                    </td>
                    <td class="p-4 text-sm text-slate-500">${u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
                    <td class="p-4 text-right">
                      <div class="flex items-center justify-end gap-2">
                        <select data-role-select="${u.id}" class="bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 text-xs text-white">
                          <option value="user" ${u.role !== 'admin' ? 'selected' : ''}>User</option>
                          <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
                        </select>
                        ${u.is_active ?
                          `<button data-deactivate="${u.id}" class="text-xs text-red-400 hover:text-red-300 px-2">Deactivate</button>` :
                          `<button data-activate="${u.id}" class="text-xs text-emerald-400 hover:text-emerald-300 px-2">Activate</button>`
                        }
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
    bind();
  }

  function renderStatCard(label, value, icon) {
    return `
      <div class="bg-[#161b22] border border-[#30363d] rounded-2xl p-5">
        <div class="text-xs font-bold uppercase text-slate-500 tracking-widest mb-2">${icon} ${label}</div>
        <div class="text-3xl font-black text-white">${value}</div>
      </div>
    `;
  }

  function bind() {
    el.querySelectorAll('[data-role-select]').forEach(select => {
      select.addEventListener('change', async () => {
        const id = select.dataset.roleSelect;
        try {
          await api.put(`/admin/users/${id}`, { role: select.value });
          await loadData();
          render();
        } catch (e) { alert('Failed: ' + e.message); }
      });
    });

    el.querySelectorAll('[data-deactivate]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Deactivate this user?')) return;
        const id = btn.dataset.deactivate;
        try {
          await api.del(`/admin/users/${id}`);
          await loadData();
          render();
        } catch (e) { alert('Failed: ' + e.message); }
      });
    });

    el.querySelectorAll('[data-activate]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.activate;
        try {
          await api.put(`/admin/users/${id}`, { is_active: 1 });
          await loadData();
          render();
        } catch (e) { alert('Failed: ' + e.message); }
      });
    });
  }
}
