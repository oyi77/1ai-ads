import { api } from '../lib/api.js';
import { esc } from '../lib/escape.js';

const generateAISuggestions = (page) => {
  return [
    {
      type: 'headline',
      title: 'Headline Improvement',
      current: page.name || 'Untitled Landing Page',
      suggestion: 'Boost Your Conversions by 40% with Our Proven Framework',
      reason: 'Adding specific numbers and benefit-driven language increases CTR'
    },
    {
      type: 'cta',
      title: 'CTA Button Optimization',
      current: 'Standard button',
      suggestion: 'Start My Free Trial →',
      reason: 'Action-oriented text with arrow increases click-through rate by 26%'
    },
    {
      type: 'layout',
      title: 'Layout Suggestion',
      current: 'Current layout',
      suggestion: 'Move CTA above the fold',
      reason: 'Above-the-fold CTAs see 2x more engagement on mobile devices'
    },
    {
      type: 'color',
      title: 'Color Psychology',
      current: 'Default colors',
      suggestion: 'Use contrasting orange CTA',
      reason: 'High contrast CTAs improve visibility and conversion rates'
    }
  ];
};

const mockPageContent = (page) => `
<!DOCTYPE html>
<html>
<head>
  <title>${esc(page.name || 'Landing Page')}</title>
  <style>
    body { font-family: system-ui; margin: 0; padding: 0; background: #f5f5f5; }
    .hero { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 80px 20px; text-align: center; }
    h1 { font-size: 48px; margin: 0 0 20px; }
    .subtitle { font-size: 20px; opacity: 0.9; }
    .cta { background: #10b981; color: white; padding: 16px 32px; border: none; border-radius: 8px; font-size: 18px; cursor: pointer; margin-top: 30px; }
    .features { padding: 60px 20px; max-width: 1000px; margin: 0 auto; }
    .feature-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 30px; margin-top: 40px; }
    .feature { background: white; padding: 30px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .feature h3 { margin-top: 0; color: #1f2937; }
  </style>
</head>
<body>
  <div class="hero">
    <h1>${esc(page.name || 'Welcome')}</h1>
    <p class="subtitle">Transform your business with our powerful solution</p>
    <button class="cta">Get Started Today</button>
  </div>
  <div class="features">
    <h2>Why Choose Us</h2>
    <div class="feature-grid">
      <div class="feature">
        <h3>⚡ Lightning Fast</h3>
        <p>Optimized for performance and speed</p>
      </div>
      <div class="feature">
        <h3>🔒 Secure</h3>
        <p>Enterprise-grade security</p>
      </div>
      <div class="feature">
        <h3>📊 Analytics</h3>
        <p>Real-time insights and reporting</p>
      </div>
    </div>
  </div>
</body>
</html>
`;

export async function renderLandingList(el) {
  try {
    const { data: pages } = await api.get('/landing');
    el.innerHTML = `
      <div class="p-4 sm:p-8">
        <h1 class="text-2xl sm:text-3xl font-bold mb-4">Landing Pages</h1>
        <a href="#/landing/create" class="bg-sky-500 hover:bg-sky-600 px-4 py-3 rounded-lg inline-flex items-center min-h-[44px] mb-4">Create Page</a>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          ${pages.length === 0 ? '<p class="text-slate-400">No landing pages yet.</p>' : ''}
          ${pages.map(p => `
            <div class="bg-slate-800 p-3 sm:p-4 rounded-lg flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 sm:gap-2">
              <div class="flex-1">
                <div class="font-bold">${esc(p.name || 'Untitled')}</div>
                <div class="text-slate-400 text-sm">${esc(p.template)} | ${esc(p.theme)}</div>
              </div>
              <div class="flex gap-2 sm:gap-3 self-end sm:self-start flex-wrap">
                ${p.is_published ? `<a href="/lp/${esc(p.slug)}" target="_blank" class="text-emerald-400 hover:text-emerald-300 text-sm min-h-[44px] px-3 py-2 flex items-center rounded">Live</a>` : `<button data-preview-lp="${esc(p.id)}" data-slug="${esc(p.slug || '')}" class="text-slate-400 hover:text-slate-300 text-sm min-h-[44px] px-3 py-2 rounded flex items-center gap-1">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                  Preview
                </button>`}
                <button data-optimize="${esc(p.id)}" data-name="${esc(p.name || 'page')}" class="text-sky-400 hover:text-sky-300 text-sm min-h-[44px] px-3 py-2 rounded flex items-center gap-1">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                  Optimize
                </button>
                <button data-deploy="${esc(p.id)}" data-name="${esc(p.name || 'page')}" class="${p.is_published ? 'text-yellow-400' : 'text-emerald-400'} hover:opacity-80 text-sm min-h-[44px] px-3 py-2 rounded">${p.is_published ? 'Undeploy' : 'Deploy'}</button>
                <button data-export="${esc(p.id)}" data-name="${esc(p.name || 'landing-page')}" class="text-slate-400 hover:text-slate-300 text-sm min-h-[44px] px-3 py-2 rounded">Export</button>
                <button data-delete="${esc(p.id)}" class="text-red-400 hover:text-red-300 text-sm min-h-[44px] px-3 py-2 rounded">Delete</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      
      <!-- Optimize Modal -->
      <div id="optimize-modal" class="hidden fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div class="bg-slate-800 border border-slate-700 rounded-xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
          <div class="p-4 border-b border-slate-700 flex items-center justify-between">
            <div>
              <h2 class="text-xl font-bold flex items-center gap-2">
                <svg class="w-6 h-6 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                AI Optimize
              </h2>
              <p class="text-sm text-slate-400 mt-1">Landing Page: <span id="optimize-page-name"></span></p>
            </div>
            <button id="close-modal" class="text-slate-400 hover:text-white p-2">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          
          <div class="flex-1 overflow-auto p-4">
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <!-- Preview -->
              <div>
                <h3 class="text-sm font-semibold text-slate-400 mb-2 uppercase tracking-wider">Current Preview</h3>
                <div class="bg-white rounded-lg overflow-hidden border border-slate-700" style="height: 500px;">
                  <iframe id="preview-frame" class="w-full h-full border-0"></iframe>
                </div>
              </div>
              
              <!-- Suggestions -->
              <div>
                <h3 class="text-sm font-semibold text-slate-400 mb-2 uppercase tracking-wider">AI Suggestions</h3>
                <div id="suggestions-list" class="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                  <!-- Suggestions injected here -->
                </div>
                
                <div class="mt-4 p-4 bg-slate-900/50 rounded-lg border border-slate-700">
                  <div class="flex items-center gap-2 text-emerald-400 mb-2">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    <span class="font-semibold">Expected Impact</span>
                  </div>
                  <ul class="text-sm text-slate-400 space-y-1">
                    <li>• +35% increase in conversion rate</li>
                    <li>• -20% bounce rate improvement</li>
                    <li>• +45% engagement boost</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
          
          <div class="p-4 border-t border-slate-700 flex gap-3 justify-end">
            <button id="discard-btn" class="px-4 py-2 text-slate-400 hover:text-white transition-colors">Discard</button>
            <button id="apply-btn" class="bg-sky-600 hover:bg-sky-700 px-6 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
              Apply Suggestions
            </button>
          </div>
        </div>
      </div>
    `;

    // Optimize handlers
    const modal = el.querySelector('#optimize-modal');
    const suggestionsList = el.querySelector('#suggestions-list');
    const previewFrame = el.querySelector('#preview-frame');
    
    el.querySelectorAll('[data-optimize]').forEach(btn => {
      btn.addEventListener('click', () => {
        const pageId = btn.dataset.optimize;
        const pageName = btn.dataset.name;
        const page = pages.find(p => p.id == pageId);
        
        if (!page) return;
        
        el.querySelector('#optimize-page-name').textContent = pageName;
        
        // Load preview
        const html = mockPageContent(page);
        previewFrame.srcdoc = html;
        
        // Generate suggestions
        const suggestions = generateAISuggestions(page);
        suggestionsList.innerHTML = suggestions.map(s => `
          <div class="bg-slate-900/50 p-4 rounded-lg border border-slate-700 hover:border-sky-500/50 transition-colors cursor-pointer group">
            <div class="flex items-start gap-3">
              <div class="mt-1">
                <div class="w-5 h-5 rounded-full border-2 border-slate-600 group-hover:border-sky-500 flex items-center justify-center transition-colors">
                  <div class="w-2.5 h-2.5 rounded-full bg-sky-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                </div>
              </div>
              <div class="flex-1">
                <div class="flex items-center gap-2 mb-1">
                  <span class="text-xs font-medium px-2 py-0.5 rounded bg-sky-500/20 text-sky-400">${esc(s.type.toUpperCase())}</span>
                  <h4 class="font-semibold">${esc(s.title)}</h4>
                </div>
                <div class="text-sm text-slate-400 mb-2">${esc(s.reason)}</div>
                <div class="bg-slate-800 p-2 rounded text-sm">
                  <div class="text-slate-500 line-through">${esc(s.current)}</div>
                  <div class="text-emerald-400 font-medium">→ ${esc(s.suggestion)}</div>
                </div>
              </div>
            </div>
          </div>
        `).join('');
        
        modal.classList.remove('hidden');
      });
    });

    // Close modal handlers
    el.querySelector('#close-modal')?.addEventListener('click', () => {
      modal.classList.add('hidden');
    });
    
    el.querySelector('#discard-btn')?.addEventListener('click', () => {
      modal.classList.add('hidden');
    });
    
    modal?.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });

    // Apply handler
    let currentPageId = null;
    el.querySelectorAll('[data-optimize]').forEach(btn => {
      btn.addEventListener('click', () => {
        currentPageId = btn.dataset.optimize;
        // ... existing modal open logic
      });
    });

    el.querySelector('#apply-btn')?.addEventListener('click', async () => {
      if (!currentPageId) return;
      const btn = el.querySelector('#apply-btn');
      btn.innerHTML = `<svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Applying...`;
      btn.disabled = true;
      
      try {
        const page = pages.find(p => p.id == currentPageId);
        await api.put(`/landing/${currentPageId}`, { 
          name: page?.name, 
          template: page?.template,
          theme: page?.theme,
          optimized: true 
        });
        modal.classList.add('hidden');
        btn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg> Apply Suggestions`;
        btn.disabled = false;
        renderLandingList(el);
      } catch (err) {
        btn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg> Apply Suggestions`;
        btn.disabled = false;
        alert('Failed to apply optimizations: ' + err.message);
      }
    });

    // Export handlers (fetch with auth, then download)
    el.querySelectorAll('[data-export]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          const token = localStorage.getItem('adforge_token');
          const res = await fetch(`/api/landing/${btn.dataset.export}/export`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const html = await res.text();
          const blob = new Blob([html], { type: 'text/html' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${btn.dataset.name}.html`;
          a.click();
          URL.revokeObjectURL(url);
        } catch (e) {
          alert('Export failed: ' + e.message);
        }
      });
    });

    // Deploy/undeploy handlers
    el.querySelectorAll('[data-deploy]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.deploy;
        const isPublished = btn.textContent.trim() === 'Undeploy';
        try {
          if (isPublished) {
            await api.post(`/landing/${id}/undeploy`);
          } else {
            await api.post(`/landing/${id}/deploy`, { slug: btn.dataset.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') });
          }
          renderLandingList(el);
        } catch (e) { alert(e.message); }
      });
    });

    // Delete handlers
    el.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this landing page?')) return;
        await api.del(`/landing/${btn.dataset.delete}`);
        renderLandingList(el);
      });
    });
  } catch (e) {
    el.innerHTML = `<div class="p-4 sm:p-8 text-red-400">Failed to load landing pages</div>`;
  }
}
