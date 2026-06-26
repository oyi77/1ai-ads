import { api } from '../lib/api.js';
import { esc } from '../lib/escape.js';

export function renderAISection(state) {
  return `
    <h2 class="text-2xl font-bold mb-6 text-white">AI Configuration</h2>
    <div class="grid gap-6">
      <div class="bg-[#161b22] border border-[#30363d] rounded-xl p-6">
        <div class="flex items-center justify-between mb-6">
          <span class="text-lg font-bold text-white">AI Provider (OpenAI Compatible)</span>
          <button id="test-connection-btn" ${state.isTestingConnection ? 'disabled' : ''} class="text-xs bg-[#21262d] text-slate-300 border border-[#30363d] px-3 py-1.5 rounded-md">${state.isTestingConnection ? 'Testing...' : 'Test Connection'}</button>
        </div>
        <form id="ai-config-form" class="space-y-4">
          <div><label class="block text-xs font-bold text-slate-500 uppercase mb-1">API Endpoint</label><input type="text" name="url" value="${esc(state.aiConfig.url)}" class="w-full p-3 bg-[#0d1117] rounded-lg border border-[#30363d] text-white text-sm"></div>
          <div><label class="block text-xs font-bold text-slate-500 uppercase mb-1">API Key</label><input type="password" name="apiKey" value="${esc(state.aiConfig.apiKey)}" placeholder="sk-..." class="w-full p-3 bg-[#0d1117] rounded-lg border border-[#30363d] text-white text-sm"></div>
          <div>
            <div class="flex items-center justify-between mb-1"><label class="block text-xs font-bold text-slate-500 uppercase">Default Model</label><button type="button" id="fetch-models-btn" class="text-[10px] text-sky-400 hover:underline">Fetch Models</button></div>
            <input type="text" name="model" value="${esc(state.aiConfig.model)}" list="model-list" placeholder="gpt-4o" class="w-full p-3 bg-[#0d1117] rounded-lg border border-[#30363d] text-white text-sm">
            <datalist id="model-list">${state.availableModels.map(m => `<option value="${esc(m.id)}">${esc(m.id)}</option>`).join('')}</datalist>
          </div>
          <button type="submit" class="bg-[#238636] text-white px-6 py-2 rounded-lg font-bold">Save Configuration</button>
        </form>
        <div id="ai-status" class="mt-4"></div>
      </div>
      <div class="bg-[#161b22] border border-[#30363d] rounded-xl p-6">
        <h3 class="text-lg font-bold text-white mb-4">Test Prompt</h3>
        <div class="space-y-4">
          <textarea id="test-user-prompt" rows="3" class="w-full p-2.5 bg-[#0d1117] rounded-lg border border-[#30363d] text-white text-sm" placeholder="Write something..."></textarea>
          <button id="run-test-prompt" ${state.isTestingPrompt ? 'disabled' : ''} class="bg-sky-600 text-white px-6 py-2 rounded-lg font-bold">${state.isTestingPrompt ? 'Running...' : 'Run Test'}</button>
          ${state.testPromptResult ? `<div class="mt-4 p-4 bg-[#0d1117] border border-[#30363d] rounded-lg text-sm text-slate-300 whitespace-pre-wrap">${esc(state.testPromptResult)}</div>` : ''}
        </div>
      </div>
    </div>
  `;
}

export function bindAISection(el, state, { loadData, render }) {
  const attachAIHandlers = () => {
    // Test Connection Button
    el.querySelector('#test-connection-btn')?.addEventListener('click', async () => {
      const form = el.querySelector('#ai-config-form');
      const fd = new FormData(form);
      const config = Object.fromEntries(fd);
      state.isTestingConnection = true;
      render();
      try {
        const res = await api.post('/settings/ai/test-connection', config);
        el.querySelector('#ai-status').innerHTML = `<div class="text-emerald-400">✓ Connection successful!</div>`;
      } catch (err) {
        el.querySelector('#ai-status').innerHTML = `<div class="text-red-400">✗ Connection failed: ${err.message}</div>`;
      } finally {
        state.isTestingConnection = false;
        render();
      }
    });

    // Fetch Models Button
    el.querySelector('#fetch-models-btn')?.addEventListener('click', async () => {
      state.isFetchingModels = true;
      render();
      try {
        const res = await api.get('/settings/ai/models');
        state.availableModels = res.data.models;
        render();
      } catch (err) {
        el.querySelector('#ai-status').innerHTML = `<div class="text-red-400">✗ Failed to fetch models: ${err.message}</div>`;
      } finally {
        state.isFetchingModels = false;
        render();
      }
    });

    // AI Config Form Submit
    el.querySelector('#ai-config-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const config = Object.fromEntries(fd);
      try {
        await api.put('/settings/ai', config);
        await loadData();
        render();
      } catch (err) {
        el.querySelector('#ai-status').innerHTML = `<div class="text-red-400">✗ Save failed: ${err.message}</div>`;
      }
    });

    // Test Prompt
    el.querySelector('#run-test-prompt')?.addEventListener('click', async () => {
      const prompt = el.querySelector('#test-user-prompt').value;
      if (!prompt.trim()) return;
      state.isTestingPrompt = true;
      render();
      try {
        const res = await api.post('/settings/ai/test-prompt', { prompt });
        state.testPromptResult = res.data.result;
        render();
      } catch (err) {
        state.testPromptResult = `✗ ${err.message}`;
        render();
      } finally {
        state.isTestingPrompt = false;
      }
    });
  };

  attachAIHandlers();
}