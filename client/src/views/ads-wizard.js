import { api } from '../lib/api.js';
import { esc } from '../lib/escape.js';

export async function renderAdWizard(el) {
  let state = {
    mode: 'simple', // 'simple' or 'wizard'
    sessionId: null,
    step: 1, // 1-6
    formData: {},
    previewHtml: null
  };

  const steps = [
    { id: 1, title: 'Campaign Goal', description: 'What do you want to achieve?' },
    { id: 2, title: 'Target Audience', description: 'Who are you targeting?' },
    { id: 3, title: 'Content Model', description: 'Choose AI content framework' },
    { id: 4, title: 'Generate Hook', description: 'AI creates your attention-grabber' },
    { id: 5, title: 'Customize Body', description: 'Edit the AI-generated content' },
    { id: 6, title: 'Add CTA', description: 'What should they do next?' }
  ];

  function render() {
    el.innerHTML = `
      <div class="min-h-[calc(100vh-64px)] bg-gradient-to-br from-slate-900 to-slate-800 p-4 sm:p-8">
        <div class="max-w-4xl mx-auto">
          <!-- Progress Steps -->
          <div class="mb-6">
            ${steps.slice(0, 6).map(s => `
              <div class="flex items-center gap-3 ${s.id <= state.step ? 'text-emerald-400' : 'text-slate-500'}">
                <div class="w-8 h-8 rounded-full ${s.id < state.step ? 'bg-emerald-100' : 'bg-slate-700'} flex items-center justify-center font-bold text-white">${s.id}</div>
                <div class="flex-1">
                  ${[...Array(s.id).fill(0).map(() => '<div class="w-2 h-2 rounded-full bg-slate-600"></div>')}
                  ${[...Array(6 - s.id).fill(0).map(() => '<div class="w-2 h-2 rounded-full ${s.id < state.step ? 'bg-emerald-300' : 'bg-slate-500'}"></div>')}
                </div>
              </div>
            `).join('')}
          </div>

          <!-- Split Screen Layout -->
          <div class="flex gap-6">
            <!-- Form Section (Left) -->
            <div class="flex-1 w-full md:w-1/2 lg:w-7/12 ${state.mode === 'wizard' ? 'border-l border-slate-300' : 'p-4'}">
              <div class="p-4">
                <button class="flex items-center gap-2 text-slate-400 hover:text-white mb-4" data-action="simple">
                  <svg class="w-5 h-5" fill="none" viewBox="0 0 20 20"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 12l-3-3h18a4 9 19 5"></path></svg>
                  <span>Quick Create</span>
                </button>
                <div class="h-px bg-slate-700 my-1 rounded"></div>
                <button class="flex items-center gap-2 text-sky-400 hover:text-sky-300 ${state.mode === 'wizard' ? 'text-white' : 'text-slate-300'}" data-action="wizard">
                  <svg class="w-5 h-5" fill="none" viewBox="0 0 20 20"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18l-6.66c-3.66c-3.66-12 12 9 11"></path></svg>
                  <span>Wizard Mode</span>
                </button>
              </div>

              ${renderStepContent()}
            </div>

            <!-- Preview Section (Right) -->
            <div class="flex-1 w-full md:w-1/2 lg:w-5/12 ${state.mode === 'wizard' ? 'p-4 bg-white' : 'border-l border-slate-300 bg-white'}">
              <div class="p-4">
                <div class="flex items-center justify-between mb-4">
                  <h2 class="text-xl font-bold text-slate-900">Preview</h2>
                  <button class="text-slate-400 hover:text-white text-sm">✕ Close</button>
                </div>
                <div id="preview-container" class="bg-slate-50 rounded-lg p-4 min-h-[500px] overflow-auto">
                  ${state.previewHtml || '<div class="text-slate-400">Preview will appear here</div>'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    attachEventListeners();
  }

  function renderStepContent() {
    const currentStep = steps.find(s => s.id === state.step);
    if (!currentStep) return '<div class="text-slate-400">Invalid step</div>';

    switch (state.step) {
      case 1: // Campaign Goal
        return `
          <h3 class="text-lg font-bold text-white mb-2">Step 1 of 6: ${currentStep.title}</h3>
          <p class="text-slate-300 mb-4">${currentStep.description}</p>
          <div class="space-y-4">
            <label class="block text-sm text-slate-400 mb-2">What do you want to achieve?</label>
            <div class="flex gap-2">
              <button data-option="brand-awareness" class="flex-1 items-center gap-3 px-4 py-3 rounded-lg border border-slate-600 ${state.formData.goal === 'brand-awareness' ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-slate-800 text-slate-300 hover:border-emerald-400 hover:bg-slate-700'}">
                <div class="w-4 h-4"></div>
                </button>
              <button data-option="lead-generation" class="flex-1 items-center gap-3 px-4 py-3 rounded-lg border border-slate-600 ${state.formData.goal === 'lead-generation' ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-slate-800 text-slate-300 hover:border-emerald-400 hover:bg-slate-700'}">
                <div class="w-4 h-4"></div>
              </button>
              <button data-option="sales-conversion" class="flex-1 items-center gap-3 px-4 py-3 rounded-lg border border-slate-600 ${state.formData.goal === 'sales-conversion' ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-slate-800 text-slate-300 hover:border-emerald-400 hover:bg-slate-700'}">
                <div class="w-4 h-4"></div>
              </button>
            </div>
            <button data-step-action="next" class="w-full mt-4 bg-sky-500 hover:bg-sky-600 text-white py-3 rounded-lg font-medium">Next</button>
          </div>
        `;
      case 2: // Target Audience
        return `
          <h3 class="text-lg font-bold text-white mb-2">Step 2 of 6: ${currentStep.title}</h3>
          <p class="text-slate-300 mb-4">${currentStep.description}</p>
          <div class="space-y-4">
            <label class="block text-sm text-slate-400 mb-2">Age Range</label>
            <div class="flex gap-2">
              <button data-audience-option="18-24" class="flex-1 items-center gap-3 px-4 py-3 rounded-lg border border-slate-600 ${state.formData.ageRange === '18-24' ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-slate-800 text-slate-300 hover:border-emerald-400 hover:bg-slate-700'}">
                <div class="w-4 h-4"></div>
                <span class="text-sm">18-24</span>
              </button>
              <button data-audience-option="25-34" class="flex-1 items-center gap-3 px-4 py-3 rounded-lg border border-slate-600 ${state.formData.ageRange === '25-34' ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-slate-800 text-slate-300 hover:border-emerald-400 hover:bg-slate-700'}">
                <div class="w-4 h-4"></div>
                <span class="text-sm">25-34</span>
              </button>
              <button data-audience-option="35-49" class="flex-1 items-center gap-3 px-4 py-3 rounded-lg border border-slate-600 ${state.formData.ageRange === '35-49' ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-slate-800 text-slate-300 hover:border-emerald-400 hover:bg-slate-700'}">
                <div class="w-4 h-4"></div>
                <span class="text-sm">35-49</span>
              </button>
              <button data-audience-option="50+" class="flex-1 items-center gap-3 px-4 py-3 rounded-lg border border-slate-600 ${state.formData.ageRange === '50+' ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-slate-800 text-slate-300 hover:border-emerald-400 hover:bg-slate-700'}">
                <div class="w-4 h-4"></div>
                <span class="text-sm">50+</span>
              </button>
            </div>
            <button data-step-action="next" class="w-full mt-4 bg-sky-500 hover:bg-sky-600 text-white py-3 rounded-lg font-medium">Next</button>
          </div>
        `;
      case 3: // Content Model
        return `
          <h3 class="text-lg font-bold text-white mb-2">Step 3 of 6: ${currentStep.title}</h3>
          <p class="text-slate-300 mb-4">${currentStep.description}</p>
          <div class="space-y-4">
            <label class="block text-sm text-slate-400 mb-2">Choose AI Framework</label>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button data-framework-option="pas" class="flex-1 items-center gap-3 px-4 py-3 rounded-lg border border-slate-600 ${state.formData.framework === 'pas' ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-slate-800 text-slate-300 hover:border-emerald-400 hover:bg-slate-700'}">
                <div class="w-4 h-4"></div>
                <span class="text-sm font-bold">PAS</span>
                <span class="text-xs text-slate-400">Problem-Agitation-Solution</span>
              </button>
              <button data-framework-option="aida" class="flex-1 items-center gap-3 px-4 py-3 rounded-lg border border-slate-600 ${state.formData.framework === 'aida' ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-slate-800 text-slate-300 hover:border-emerald-400 hover:bg-slate-700'}">
                <div class="w-4 h-4"></div>
                <span class="text-sm font-bold">AIDA</span>
                <span class="text-xs text-slate-400">Attention-Interest-Desire-Action</span>
              </button>
              <button data-framework-option="storybridge" class="flex-1 items-center gap-3 px-4 py-3 rounded-lg border border-slate-600 ${state.formData.framework === 'storybridge' ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-slate-800 text-slate-300 hover:border-emerald-400 hover:bg-slate-700'}">
                <div class="w-4 h-4"></div>
                <span class="text-sm font-bold">StoryBridge</span>
                <span class="text-xs text-slate-400">Hero-Villain-Antagonist</span>
              </button>
            </div>
            <button data-step-action="next" class="w-full mt-4 bg-sky-500 hover:bg-sky-600 text-white py-3 rounded-lg font-medium">Next</button>
          </div>
        `;
      case 4: // Generate Hook
        return `
          <h3 class="text-lg font-bold text-white mb-2">Step 4 of 6: ${currentStep.title}</h3>
          <p class="text-slate-300 mb-4">${currentStep.description}</p>
          <div class="space-y-4">
            <label class="block text-sm text-slate-400 mb-2">Product Name</label>
            <input type="text" data-field="product" value="${esc(state.formData.product || '')}" class="w-full p-3 bg-slate-800 rounded-lg border border-slate-600 text-white placeholder="e.g., Kursus Digital Marketing" />
            <button data-step-action="generate-hook" class="w-full mt-4 bg-sky-500 hover:bg-sky-600 text-white py-3 rounded-lg font-medium">Generate Hook</button>
          </div>
        `;
      case 5: // Customize Body
        return `
          <h3 class="text-lg font-bold text-white mb-2">Step 5 of 6: ${currentStep.title}</h3>
          <p class="text-slate-300 mb-4">${currentStep.description}</p>
          <div class="space-y-4">
            <label class="block text-sm text-slate-400 mb-2">Body Content</label>
            <textarea data-field="body" rows="6" class="w-full p-3 bg-slate-800 rounded-lg border border-slate-600 text-white placeholder="AI-generated body will appear here...">${esc(state.formData.body || '')}</textarea>
          </div>
          <div class="flex gap-3">
            <button data-step-action="next" class="w-full mt-4 bg-sky-500 hover:bg-sky-600 text-white py-3 rounded-lg font-medium">Next</button>
            <button data-step-action="back" class="w-full mt-4 bg-slate-700 hover:bg-slate-600 text-white py-3 rounded-lg font-medium">Back</button>
          </div>
        `;
      case 6: // Add CTA
        return `
          <h3 class="text-lg font-bold text-white mb-2">Step 6 of 6: ${currentStep.title}</h3>
          <p class="text-slate-300 mb-4">${currentStep.description}</p>
          <div class="space-y-4">
            <label class="block text-sm text-slate-400 mb-2">Call to Action (CTA)</label>
            <input type="text" data-field="cta" value="${esc(state.formData.cta || '')}" class="w-full p-3 bg-slate-800 rounded-lg border border-slate-600 text-white placeholder="e.g., Daftar Sekarang - Diskon 50%" />
            <label class="block text-sm text-slate-400 mb-2">Or URL</label>
            <input type="url" data-field="url" value="${esc(state.formData.url || '')}" class="w-full p-3 bg-slate-800 rounded-lg border border-slate-600 text-white placeholder="https://wa.me/yourlink" />
          </div>
          <button data-step-action="complete" class="w-full mt-4 bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-lg font-bold">Complete</button>
          </div>
        `;
      default:
        return `<div class="text-slate-400">Invalid step</div>`;
    }
  }

  function attachEventListeners() {
    // Mode toggle
    el.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const action = btn.dataset.action;
        if (action === 'simple') {
          state.mode = 'simple';
          el.querySelector('button[data-action="wizard"]')?.classList.add('hidden');
        } else if (action === 'wizard') {
          state.mode = 'wizard';
          el.querySelector('button[data-action="simple"]')?.classList.add('hidden');
          startWizard();
        }
      });
    });

    // Step options
    el.querySelectorAll('[data-option]').forEach(btn => {
      btn.addEventListener('click', () => {
        const group = btn.closest('.grid');
        const optionType = btn.dataset.option;
        const field = btn.dataset.field;

        if (group) {
          // For single-value options
          group.querySelectorAll('button').forEach(b => b.classList.remove('bg-emerald-500', 'border-emerald-500', 'text-white'));
          btn.classList.add('bg-emerald-500', 'border-emerald-500', 'text-white');
          state.formData[field] = btn.dataset[option];
        }
      });
    });

    // Step actions
    el.querySelector('[data-step-action="next"]')?.addEventListener('click', async () => {
      await nextStep();
    });
    el.querySelector('[data-step-action="back"]')?.addEventListener('click', () => {
      if (state.step > 1) {
        state.step--;
        render();
      }
    });
    el.querySelector('[data-step-action="generate-hook"]')?.addEventListener('click', async () => {
      await generateHook();
    });
    el.querySelector('[data-step-action="complete"]')?.addEventListener('click', async () => {
      await completeWizard();
    });
    el.querySelector('[data-step-action="close-preview"]')?.addEventListener('click', () => {
      el.querySelector('#preview-container').innerHTML = '<div class="text-slate-400">Preview will appear here</div>';
    });
  }

  async function startWizard() {
    try {
      const res = await api.post('/ads/wizard/start', {});
      if (res.success) {
        state.sessionId = res.data.wizardSessionId;
        state.step = 1;
        state.formData = {};
        render();
      }
    } catch (e) {
      console.error('Failed to start wizard:', e);
    }
  }

  async function nextStep() {
    try {
      const res = await api.post('/ads/wizard/step', {
        sessionId: state.sessionId,
        step: state.step,
        data: state.formData
      });
      if (res.success && res.data.acknowledged) {
        state.step++;
        render();
      }
    } catch (e) {
      console.error('Failed to save step:', e);
    }
  }

  async function generateHook() {
    try {
      state.formData.hook = 'Generating hook...';
      const res = await api.post('/ads/wizard/step', {
        sessionId: state.sessionId,
        step: state.step,
        data: state.formData
      });
      if (res.success && res.data.acknowledged) {
        state.previewHtml = `
          <div class="p-4 text-emerald-400 mb-2">Hook Generated:</div>
          <p class="text-white text-lg font-bold">${esc(state.formData.hook || '')}</p>
        `;
        render();
      }
    } catch (e) {
      console.error('Failed to generate hook:', e);
    }
  }

  async function completeWizard() {
    try {
      const adData = {
        ...state.formData,
        status: 'draft'
      };
      const res = await api.post('/ads/wizard/complete', {
        sessionId: state.sessionId,
        finalData: adData
      });
      if (res.success) {
        window.location.hash = `#/ads/create?edit=${res.data.id}`;
      }
    } catch (e) {
      console.error('Failed to complete wizard:', e);
    }
  }

  render();
}
