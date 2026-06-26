import { api } from '../lib/api.js';
import { esc } from '../lib/escape.js';

export async function renderDrafts(el) {
  let drafts = [];
  let activeStatus = 'pending';

  const loadDrafts = async () => {
    try {
      const { data } = await api.get(`/drafts?status=${activeStatus}`);
      drafts = Array.isArray(data) ? data : [];
    } catch (e) {
      console.error('Failed to load drafts:', e);
      drafts = [];
    }
  };

  await loadDrafts();
  render();

  function render() {
    el.innerHTML = `
      <div class="max-w-[1200px] mx-auto p-8 animate-fadeIn space-y-8">
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-3xl font-black text-white uppercase tracking-tight">Draft Approvals</h1>
            <p class="text-slate-500 text-sm mt-1">Review and approve AI-proposed campaign changes.</p>
          </div>
          <div class="flex gap-2">
            ${['pending', 'approved', 'rejected'].map(s => `
              <button data-status="${s}" class="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                activeStatus === s ? 'bg-white text-black' : 'bg-[#161b22] border border-[#30363d] text-slate-400 hover:text-white'
              }">${s}</button>
            `).join('')}
          </div>
        </div>

        ${drafts.length === 0 ? `
          <div class="bg-[#161b22] border border-[#30363d] rounded-2xl p-12 text-center">
            <div class="text-4xl mb-4">📋</div>
            <p class="text-slate-500">No ${activeStatus} drafts.</p>
          </div>
        ` : `
          <div class="space-y-4">
            ${drafts.map(d => `
              <div class="bg-[#161b22] border border-[#30363d] rounded-2xl overflow-hidden" data-draft-id="${d.id}">
                <div class="p-6">
                  <div class="flex items-start justify-between mb-4">
                    <div class="flex items-center gap-3">
                      <span class="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                        d.status === 'pending' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                        d.status === 'approved' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                        'bg-red-500/10 text-red-400 border border-red-500/20'
                      }">${esc(d.status)}</span>
                      <span class="text-xs text-slate-500">${esc(d.type || 'campaign')}</span>
                      <span class="text-xs text-slate-600">by ${esc(d.proposed_by || 'ai')}</span>
                    </div>
                    <span class="text-xs text-slate-600">${d.created_at ? new Date(d.created_at).toLocaleString() : ''}</span>
                  </div>
                  <p class="text-white font-medium mb-3">${esc(d.summary || '')}</p>
                  ${d.details_json ? `<pre class="text-xs text-slate-400 bg-[#0d1117] rounded-lg p-4 overflow-auto max-h-40">${esc(typeof d.details_json === 'string' ? d.details_json : JSON.stringify(d.details_json, null, 2))}</pre>` : ''}
                  ${d.rejection_reason ? `<div class="mt-3 text-sm text-red-400">Rejection: ${esc(d.rejection_reason)}</div>` : ''}
                  ${d.execution_result ? `<div class="mt-3 text-sm text-emerald-400">Result: ${esc(d.execution_result)}</div>` : ''}
                </div>
                ${d.status === 'pending' ? `
                  <div class="px-6 py-4 bg-[#0d1117] border-t border-[#30363d] flex items-center gap-3">
                    <button data-approve="${d.id}" class="px-4 py-2 bg-[#238636] text-white rounded-lg text-sm font-bold hover:bg-[#2ea043] transition-all">✅ Approve</button>
                    <button data-reject="${d.id}" class="px-4 py-2 bg-[#da3633] text-white rounded-lg text-sm font-bold hover:bg-[#f85149] transition-all">❌ Reject</button>
                    <input type="text" data-reason="${d.id}" placeholder="Rejection reason (optional)" class="flex-1 px-3 py-2 bg-[#161b22] border border-[#30363d] rounded-lg text-sm text-white">
                  </div>
                ` : ''}
              </div>
            `).join('')}
          </div>
        `}
      </div>
    `;
    bind();
  }

  function bind() {
    el.querySelectorAll('[data-status]').forEach(btn => {
      btn.addEventListener('click', async () => {
        activeStatus = btn.dataset.status;
        await loadDrafts();
        render();
      });
    });

    el.querySelectorAll('[data-approve]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.approve;
        try {
          await api.post(`/drafts/${id}/approve`);
          await loadDrafts();
          render();
        } catch (e) { alert('Failed: ' + e.message); }
      });
    });

    el.querySelectorAll('[data-reject]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.reject;
        const reason = el.querySelector(`[data-reason="${id}"]`)?.value || '';
        try {
          await api.post(`/drafts/${id}/reject`, { rejectionReason: reason });
          await loadDrafts();
          render();
        } catch (e) { alert('Failed: ' + e.message); }
      });
    });
  }
}
