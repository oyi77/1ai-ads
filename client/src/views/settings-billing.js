import { api } from '../lib/api.js';
import { esc } from '../lib/escape.js';

export function renderBillingSection(state) {
  if (!state.planDetails) {
    return `
      <h2 class="text-2xl font-bold mb-6 text-white">Subscription</h2>
      <div class="bg-[#161b22] border border-[#30363d] rounded-xl p-6">
        <div class="text-center text-slate-400">Loading subscription details...</div>
      </div>
    `;
  }

  const { plan, features, limits } = state.planDetails;
  const isFree = plan.tier === 'free';
  const isPro = plan.tier === 'pro';
  const isEnterprise = plan.tier === 'enterprise';

  return `
    <h2 class="text-2xl font-bold mb-6 text-white">Subscription</h2>
    <div class="text-sm text-slate-400 mb-4">Current plan: <span class="font-bold ${isFree ? 'text-amber-400' : isPro ? 'text-sky-400' : 'text-emerald-400'}">${esc(plan.name)}</span></div>
    <div id="billing-error" class="hidden bg-red-500/10 text-red-400 p-3 rounded-lg mb-6 border border-red-500/20"></div>

    <div class="bg-[#161b22] border border-[#30363d] rounded-xl p-6 mb-8">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div>
          <h3 class="text-lg font-bold text-white mb-4">Plan Details</h3>
          <div class="space-y-2 text-sm">
            <div class="flex justify-between"><span class="text-slate-400">Plan</span><span class="font-medium text-white">${esc(plan.name)}</span></div>
            <div class="flex justify-between"><span class="text-slate-400">Status</span><span class="font-medium text-emerald-400">Active</span></div>
            <div class="flex justify-between"><span class="text-slate-400">Renewal</span><span class="font-medium text-white">${esc(plan.renewalDate || 'N/A')}</span></div>
          </div>
        </div>

        <div>
          <h3 class="text-lg font-bold text-white mb-4">Features</h3>
          <div class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            ${features.map(feature => `
              <div class="flex items-center gap-2">
                <span class="text-emerald-400">✓</span>
                <span class="text-slate-300 ${!feature.enabled ? 'opacity-50' : ''}">${esc(feature.label)}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <div>
          <h3 class="text-lg font-bold text-white mb-4">Usage Limits</h3>
          <div class="space-y-3 text-sm">
            ${limits.map(limit => {
              const value = limit.value === -1 ? 'Unlimited' : limit.value;
              const progress = limit.value === -1 ? 0 : Math.min(100, (limit.usage / limit.value) * 100);
              return `
                <div>
                  <div class="flex justify-between items-center mb-1">
                    <span class="text-slate-400">${esc(limit.label)}</span>
                    <span class="font-medium text-white">${value}</span>
                  </div>
                  <div class="w-full bg-[#21262d] rounded-full h-2">
                    <div class="bg-${progress > 80 ? 'amber' : 'emerald'}-500 h-2 rounded-full" style="width: ${progress}%"></div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    </div>

    ${!plan.isAdmin ? '' : `
    <div class="bg-[#161b22] border border-[#30363d] rounded-xl p-6">
      <h3 class="text-lg font-bold text-white mb-4">Admin Actions</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button id="upgrade-plan" class="bg-[#238636] text-white px-6 py-3 rounded-lg font-bold hover:bg-[#2ea043] transition-colors">Upgrade Plan</button>
        <button id="manage-payments" class="bg-[#21262d] text-slate-300 border border-[#30363d] px-6 py-3 rounded-lg font-bold hover:bg-[#30363d] transition-colors">Manage Payment Methods</button>
      </div>
    </div>
    `}
  `;
}

export function bindBillingSection(el, state, { loadData, render }) {
  const attachBillingHandlers = () => {
    // Upgrade Plan
    el.querySelector('#upgrade-plan')?.addEventListener('click', async () => {
      const errorEl = el.querySelector('#billing-error');
      errorEl.classList.add('hidden');
      try {
        const res = await fetch('/api/payments/create-checkout-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('1ai-ads_token')}`
          },
          body: JSON.stringify({ plan: 'pro' })
        });
        const data = await res.json();
        if (data.success && data.sessionUrl) {
          window.location.href = data.sessionUrl;
        } else {
          errorEl.textContent = data.error || 'Failed to create checkout session';
          errorEl.classList.remove('hidden');
        }
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.classList.remove('hidden');
      }
    });

    // Manage Payments
    el.querySelector('#manage-payments')?.addEventListener('click', async () => {
      const errorEl = el.querySelector('#billing-error');
      errorEl.classList.add('hidden');
      try {
        const res = await fetch('/api/payments/customer-portal', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('1ai-ads_token')}`
          }
        });
        const data = await res.json();
        if (data.success && data.portalUrl) {
          window.location.href = data.portalUrl;
        } else {
          errorEl.textContent = data.error || 'Failed to create customer portal session';
          errorEl.classList.remove('hidden');
        }
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.classList.remove('hidden');
      }
    });
  };

  attachBillingHandlers();
}