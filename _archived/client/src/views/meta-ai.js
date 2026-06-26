import { api } from '../lib/api.js';
import { esc } from '../lib/escape.js';

export async function renderMetaAiView(el) {
  el.innerHTML = `
    <div class="min-h-[calc(100vh-64px)] bg-gradient-to-br from-slate-900 to-slate-800 p-4 sm:p-8">
      <div class="max-w-4xl mx-auto">
        <div class="flex items-center justify-between mb-6">
          <div>
            <h1 class="text-3xl font-black text-white tracking-tight">Meta AI for Business</h1>
            <p class="text-slate-400 text-sm mt-1">Chat with Meta's Ads Manager AI assistant (MAIBA).</p>
          </div>
          <div class="flex items-center gap-3">
            <div id="status-pill" class="text-xs px-3 py-1 rounded-full bg-slate-700 text-slate-300">checking…</div>
            <a href="#/settings" class="text-xs bg-[#161b22] border border-[#30363d] text-slate-300 px-3 py-1.5 rounded-md hover:text-white">⚙ Settings</a>
          </div>
        </div>

        <div id="setup-banner" class="hidden bg-amber-900/30 border border-amber-700/50 p-4 rounded-xl mb-4 text-amber-200 text-sm flex items-center justify-between">
          <span>⚠ Meta AI not configured. Add cookies in Settings.</span>
          <a href="#/settings" class="text-sky-400 underline whitespace-nowrap">Open Settings →</a>
        </div>

        <div class="bg-[#0d1117] border border-[#1c2128] rounded-2xl shadow-2xl flex flex-col" style="height: 65vh;">
          <div id="messages" class="flex-1 overflow-y-auto p-6 space-y-4"></div>
          <form id="chat-form" class="border-t border-[#1c2128] p-4 flex gap-3">
            <input type="text" id="chat-input" class="flex-1 bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm text-white" placeholder="Ask Meta AI anything about your ads..." autocomplete="off">
            <button type="submit" id="send-btn" class="bg-sky-600 hover:bg-sky-500 px-6 py-3 rounded-lg font-bold text-white whitespace-nowrap">Send</button>
          </form>
        </div>
      </div>
    </div>
  `;

  const messagesEl = el.querySelector('#messages');
  const statusPill = el.querySelector('#status-pill');
  const setupBanner = el.querySelector('#setup-banner');
  const form = el.querySelector('#chat-form');
  const input = el.querySelector('#chat-input');
  const sendBtn = el.querySelector('#send-btn');

  const history = [];

  function renderMessage(role, content) {
    const div = document.createElement('div');
    div.className = role === 'user'
      ? 'bg-sky-600/20 border border-sky-500/30 p-4 rounded-xl ml-12'
      : 'bg-[#161b22] border border-[#1c2128] p-4 rounded-xl mr-12';
    div.innerHTML = `<div class="text-xs font-bold uppercase tracking-widest mb-1 ${role === 'user' ? 'text-sky-400' : 'text-emerald-400'}">${role === 'user' ? 'You' : 'Meta AI'}</div><div class="text-sm text-slate-200 whitespace-pre-wrap">${esc(content)}</div>`;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function renderEmpty() {
    messagesEl.innerHTML = `<div class="text-center text-slate-500 py-12">
      <div class="text-4xl mb-3">💬</div>
      <p class="text-sm">No messages yet. Ask Meta AI about your campaigns.</p>
      <p class="text-xs mt-2 text-slate-600">Try: "Why is my CPC high this week?" or "Optimize my ad set targeting"</p>
    </div>`;
  }

  async function checkStatus() {
    try {
      const { data } = await api.get('/meta-ai/status');
      statusPill.textContent = data.configured ? `✓ ${data.source}` : '⚠ not configured';
      statusPill.className = data.configured
        ? 'text-xs px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300'
        : 'text-xs px-3 py-1 rounded-full bg-amber-500/20 text-amber-300';
      setupBanner.classList.toggle('hidden', data.configured);
    } catch (e) {
      statusPill.textContent = 'error';
      statusPill.className = 'text-xs px-3 py-1 rounded-full bg-red-500/20 text-red-300';
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    renderMessage('user', text);
    sendBtn.disabled = true;
    sendBtn.textContent = '...';
    try {
      const { data } = await api.post('/meta-ai/chat', { message: text });
      const reply = data?.data?.maiba_ai_relay_message_send_v2?.message?.sensitive_string_value
        || data?.message?.sensitive_string_value
        || JSON.stringify(data, null, 2);
      renderMessage('assistant', reply);
    } catch (err) {
      renderMessage('assistant', `❌ ${err.message}`);
    } finally {
      sendBtn.disabled = false;
      sendBtn.textContent = 'Send';
    }
  });

  renderEmpty();
  checkStatus();
}
