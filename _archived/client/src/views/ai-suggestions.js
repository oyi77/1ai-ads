import { api } from '../lib/api.js';
import { esc } from '../lib/escape.js';

export async function renderAiSuggestions(el) {
  let state = {
    suggestions: [],
    loading: true,
    applying: {},
    dismissing: {},
  };

  const loadData = async () => {
    try {
      const res = await api.get('/ai-agent/suggestions?status=pending');
      state.suggestions = res.data || [];
    } catch (e) {
      state.suggestions = [];
    }
    state.loading = false;
  };

  await loadData();

  const TYPE_LABELS = {
    ad_copy: 'Ad Copy',
    landing_page: 'Landing Page',
    bid: 'Bid Strategy',
    pause_ad: 'Pause Ad',
    creative: 'Creative',
  };

  const TYPE_COLORS = {
    ad_copy: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
    landing_page: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    bid: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    pause_ad: 'bg-red-500/10 text-red-400 border-red-500/20',
    creative: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  };

  function renderSuggestion(s) {
    let changes = [];
    try { changes = JSON.parse(s.suggestion)?.changes || []; } catch {}
    const typeColor = TYPE_COLORS[s.type] || 'bg-slate-700/50 text-slate-400 border-slate-600/30';

    return `
      <div class="bg-[#161b22] border border-[#30363d] rounded-xl p-5 space-y-3" data-suggestion-id="${s.id}">
        <div class="flex items-start justify-between gap-4">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-xs px-2 py-0.5 rounded-full border ${typeColor} font-medium">${TYPE_LABELS[s.type] || s.type}</span>
            ${s.target_id ? `<span class="text-xs text-slate-500">Target: ${esc(s.target_id)}</span>` : ''}
          </div>
          <div class="flex items-center gap-2 flex-shrink-0">
            <button data-apply="${s.id}" ${state.applying[s.id] ? 'disabled' : ''} class="text-xs bg-[#238636] text-white px-3 py-1.5 rounded-md font-medium hover:bg-[#2ea043] transition-colors disabled:opacity-50">
              ${state.applying[s.id] ? 'Applying...' : 'Apply'}
            </button>
            <button data-dismiss="${s.id}" ${state.dismissing[s.id] ? 'disabled' : ''} class="text-xs bg-[#21262d] text-slate-300 border border-[#30363d] px-3 py-1.5 rounded-md font-medium hover:bg-red-900/20 hover:text-red-400 transition-colors disabled:opacity-50">
              ${state.dismissing[s.id] ? '...' : 'Dismiss'}
            </button>
          </div>
        </div>
        ${s.rationale ? `<p class="text-sm text-slate-400">${esc(s.rationale)}</p>` : ''}
        ${changes.length > 0 ? `
          <div class="bg-[#0d1117] rounded-lg p-3 border border-[#30363d]">
            <p class="text-xs font-bold text-slate-500 uppercase mb-2">Suggested Changes</p>
            <div class="space-y-1">
              ${changes.map(c => `
                <div class="flex items-start gap-2 text-xs">
                  <span class="text-slate-500 font-medium min-w-[80px]">${esc(String(c.field))}:</span>
                  <span class="text-slate-300">${esc(String(c.value))}</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  function render() {
    const hasSuggestions = state.suggestions.length > 0;
    el.innerHTML = `
      <div class="max-w-4xl mx-auto p-4 sm:p-8">
        <div class="flex items-center justify-between mb-6">
          <div>
            <h1 class="text-2xl font-bold text-white">AI Suggestions</h1>
            <p class="text-sm text-slate-400 mt-1">Review and apply AI-generated improvements to your campaigns</p>
          </div>
          ${hasSuggestions ? `
            <button id="apply-all-btn" class="text-sm bg-[#238636] text-white px-4 py-2 rounded-lg font-medium hover:bg-[#2ea043] transition-colors">
              Apply All (${state.suggestions.length})
            </button>
          ` : ''}
        </div>

        ${state.loading ? `
          <div class="text-center py-16 text-slate-500">Loading suggestions...</div>
        ` : hasSuggestions ? `
          <div class="space-y-4" id="suggestions-list">
            ${state.suggestions.map(renderSuggestion).join('')}
          </div>
        ` : `
          <div class="bg-[#161b22] border border-[#30363d] rounded-xl p-12 text-center">
            <div class="text-4xl mb-4">🤖</div>
            <h3 class="text-lg font-bold text-white mb-2">No pending suggestions</h3>
            <p class="text-sm text-slate-400 mb-6">AI Mode will analyze your campaigns and generate improvement suggestions here.</p>
            <div class="flex items-center justify-center gap-3">
              <button id="run-analysis-btn" class="text-sm bg-sky-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-sky-500 transition-colors">
                Run Analysis Now
              </button>
              <a href="#/settings" class="text-sm text-slate-400 hover:text-white">Configure AI Mode →</a>
            </div>
          </div>
        `}
      </div>
    `;

    // Attach handlers
    el.querySelector('#apply-all-btn')?.addEventListener('click', async () => {
      if (!confirm(`Apply all ${state.suggestions.length} suggestions?`)) return;
      for (const s of [...state.suggestions]) {
        try {
          await api.post(`/ai-agent/suggestions/${s.id}/apply`);
        } catch {}
      }
      await loadData();
      render();
    });

    el.querySelector('#run-analysis-btn')?.addEventListener('click', async () => {
      const btn = el.querySelector('#run-analysis-btn');
      btn.disabled = true;
      btn.textContent = 'Analyzing...';
      try {
        const res = await api.post('/ai-agent/run');
        if (res.data.created > 0) {
          await loadData();
          render();
        } else {
          btn.disabled = false;
          btn.textContent = 'Run Analysis Now';
          alert('No new suggestions generated. Try adding campaigns and ads first.');
        }
      } catch (err) {
        btn.disabled = false;
        btn.textContent = 'Run Analysis Now';
        alert('Analysis failed: ' + err.message);
      }
    });

    el.querySelectorAll('[data-apply]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.apply;
        state.applying[id] = true;
        render();
        try {
          await api.post(`/ai-agent/suggestions/${id}/apply`);
          state.suggestions = state.suggestions.filter(s => s.id !== id);
        } catch (err) {
          alert('Failed to apply: ' + err.message);
        }
        delete state.applying[id];
        render();
      });
    });

    el.querySelectorAll('[data-dismiss]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.dismiss;
        state.dismissing[id] = true;
        render();
        try {
          await api.post(`/ai-agent/suggestions/${id}/dismiss`);
          state.suggestions = state.suggestions.filter(s => s.id !== id);
        } catch (err) {
          alert('Failed to dismiss: ' + err.message);
        }
        delete state.dismissing[id];
        render();
      });
    });
  }

  render();
}
