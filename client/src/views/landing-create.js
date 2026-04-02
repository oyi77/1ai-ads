import { api } from '../lib/api.js';

export function renderLandingCreate(el) {
  el.innerHTML = `
    <div class="p-4 sm:p-8">
      <h1 class="text-2xl sm:text-3xl font-bold mb-4">Create Landing Page</h1>
      <form id="lp-form" class="space-y-4 max-w-lg">
        <div>
          <label class="block text-sm text-slate-400 mb-1">Page Name</label>
          <input type="text" name="name" class="w-full p-3 bg-slate-800 rounded-lg border border-slate-700 min-h-[44px]" required>
        </div>
        <div>
          <label class="block text-sm text-slate-400 mb-1">Product Name</label>
          <input type="text" name="product_name" class="w-full p-3 bg-slate-800 rounded-lg border border-slate-700 min-h-[44px]" required>
        </div>
        <div>
          <label class="block text-sm text-slate-400 mb-1">Price</label>
          <input type="text" name="price" placeholder="e.g. Rp 500.000" class="w-full p-3 bg-slate-800 rounded-lg border border-slate-700 min-h-[44px]">
        </div>
        <div>
          <label class="block text-sm text-slate-400 mb-1">CTA Text</label>
          <input type="text" name="cta_primary" class="w-full p-3 bg-slate-800 rounded-lg border border-slate-700 min-h-[44px]">
        </div>
        <div>
          <label class="block text-sm text-slate-400 mb-1">Checkout Link</label>
          <input type="url" name="checkout_link" placeholder="https://..." class="w-full p-3 bg-slate-800 rounded-lg border border-slate-700 min-h-[44px]">
        </div>
        <div>
          <label class="block text-sm text-slate-400 mb-1">Theme</label>
          <select name="theme" class="w-full p-3 bg-slate-800 rounded-lg border border-slate-700 min-h-[44px]">
            <option value="dark">Dark (Void)</option>
            <option value="slate">Slate Noir</option>
            <option value="obsidian">Obsidian Depth</option>
            <option value="light">Light (Cloud)</option>
          </select>
        </div>
        <div class="flex flex-col sm:flex-row gap-3">
          <button type="submit" class="flex-1 bg-emerald-500 hover:bg-emerald-600 px-4 py-3 rounded-lg font-medium min-h-[44px]">Preview & Save (Template)</button>
          <button type="button" id="ai-generate" class="flex-1 bg-purple-500 hover:bg-purple-600 px-4 py-3 rounded-lg font-medium min-h-[44px]">AI Generate</button>
        </div>
      </form>
      <div id="preview" class="mt-8"></div>
    </div>
  `;

  const form = el.querySelector('#lp-form');
  const previewDiv = el.querySelector('#preview');

  // Template-based render + save
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Generating...';

    const fd = new FormData(form);
    const data = Object.fromEntries(fd);

    try {
      const renderRes = await api.post('/landing/render', data);
      showPreview(previewDiv, renderRes.data.html_output);
      await api.post('/landing', { ...data, template: data.theme });
      showSuccess(previewDiv, 'Landing page saved from template!');
    } catch (err) {
      previewDiv.innerHTML = `<div class="bg-red-900 border border-red-700 p-4 rounded-lg">Error: ${err.message}</div>`;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Preview & Save (Template)';
    }
  });

  // AI-based generate
  el.querySelector('#ai-generate').addEventListener('click', async () => {
    const btn = el.querySelector('#ai-generate');
    btn.disabled = true;
    btn.textContent = 'AI Generating...';

    const fd = new FormData(form);
    const data = Object.fromEntries(fd);

    try {
      if (!data.product_name || !data.price) {
        throw new Error('Product name and price are required for AI generation');
      }
      const res = await api.post('/landing/generate', {
        product_name: data.product_name,
        price: data.price,
        benefits: data.cta_primary,
        cta_primary: data.cta_primary,
      });
      showPreview(previewDiv, res.data.html_output);
      await api.post('/landing', { ...data, template: data.theme, html_output: res.data.html_output });
      showSuccess(previewDiv, 'AI-generated landing page saved!');
    } catch (err) {
      previewDiv.innerHTML = `<div class="bg-red-900 border border-red-700 p-4 rounded-lg">Error: ${err.message}</div>`;
    } finally {
      btn.disabled = false;
      btn.textContent = 'AI Generate';
    }
  });
}

function showPreview(container, html) {
  const iframe = document.createElement('iframe');
  iframe.srcdoc = html;
  iframe.className = 'w-full h-[50vh] sm:h-96 rounded-lg border border-slate-700';
  iframe.sandbox = 'allow-scripts';
  container.innerHTML = '';
  container.appendChild(iframe);
}

function showSuccess(container, message) {
  const msg = document.createElement('div');
  msg.className = 'bg-emerald-900 border border-emerald-700 p-4 rounded-lg mt-4';
  msg.innerHTML = `${message} <a href="#/landing" class="text-sky-400 hover:underline ml-2">View All</a>`;
  container.appendChild(msg);
}
