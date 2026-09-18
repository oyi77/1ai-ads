import { METRICS, METRIC_CATEGORIES } from '../../lib/rule-metrics.js';
import { MetaAdsAPI } from '../../services/meta/index.js';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('monitor');
import { RULE_TEMPLATES, ConditionGroup, Condition, RuleAction, OPERATORS } from '../../lib/rule-builder.js';
import { escapeHtml as esc } from '../../lib/escape.js';
import { describeRuleCondition, ruleAutoName, actionWord, metricLabel, operatorWord, formatRuleValue, describeFbRule } from '../../lib/rule-words.js';

/**
 * Riwayat match satu rule: dari drafts ber-rule_id (baru) + parse summary
 * lama ("Rule NAME:" / 'Aturan "NAME":'). Return { total, approved,
 * rejected, pending, last } — last = { at, campaign, action, status }.
 */
export function ruleHistory(draftsRepo, userId, rule) {
  const empty = { total: 0, approved: 0, rejected: 0, pending: 0, last: null };
  if (!draftsRepo || !rule) return empty;
  let rows = [];
  try {
    if (rule.id && draftsRepo.findByRuleId) {
      rows = draftsRepo.findByRuleId(rule.id, { limit: 50 })?.data || [];
    }
    if (!rows.length) {
      const all = draftsRepo.findByUser
        ? draftsRepo.findByUser(userId, { limit: 50 })?.data || []
        : [];
      const nm = String(rule.name || '');
      rows = all.filter(d => String(d.summary || '').includes(`"${nm}"`) || String(d.summary || '').includes(`Rule ${nm}`));
    }
  } catch { return empty; }
  const out = { ...empty, total: rows.length };
  for (const d of rows) {
    if (d.status === 'approved') out.approved++;
    else if (d.status === 'rejected') out.rejected++;
    else out.pending++;
  }
  const first = rows[0];
  if (first) {
    let campaign = '';
    try {
      const det = typeof first.details_json === 'string' ? JSON.parse(first.details_json) : (first.details_json || {});
      campaign = det.campaign?.name || det.campaign?.id || '';
    } catch { /* abaikan */ }
    if (!campaign) {
      const m = String(first.summary || '').match(/ di (.+)$/);
      if (m) campaign = m[1];
    }
    out.last = {
      at: first.created_at || first.reviewed_at || '',
      campaign,
      action: actionWord(safeAction(first)),
      status: first.status,
      // Gagal eksekusi walau status pending: tampilkan sebabnya biar user
      // tahu kenapa approve kemarin tidak jalan di Facebook.
      lastError: first.last_error || null,
    };
  }
  return out;
}

function safeAction(draft) {
  try {
    const det = typeof draft.details_json === 'string' ? JSON.parse(draft.details_json) : (draft.details_json || {});
    return det.action?.type || '';
  } catch { return ''; }
}

function relTime(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'baru aja';
  if (min < 60) return `${min} mnt lalu`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} jam lalu`;
  const d = Math.floor(h / 24);
  return `${d} hari lalu`;
}
const MONITOR_HEADER =
  '⚡ <b>Aturan Otomatis</b>\n\n' +
  'Bikin aturan biar bot jagain campaign-mu 24/7:\n\n' +
  '• <b>Delivery</b> — Impresi, klik, reach, frekuensi\n' +
  '• <b>Konversi</b> — CTR, CVR\n' +
  '• <b>Biaya</b> — CPC, CPM, CPA\n' +
  '• <b>Efisiensi</b> — ROAS, ROI\n\n' +
  'Pilih aksi di bawah ya:';

const INTERVAL_LABELS = {
  0: 'Ngikutin pacing FB',
  15: 'Tiap 15 menit',
  30: 'Tiap 30 menit',
  60: 'Tiap 1 jam',
  360: 'Tiap 6 jam',
};

/**
 * Balas langkah wizard dengan EDIT pesan lama (bukan pesan baru).
 * Klik-ganda user dulu bikin tiap langkah muncul 2-4x sebagai pesan baru.
 * Fallback ke reply kalau bukan dari callback (tidak ada pesan buat diedit).
 * "Message is not modified" = klik ganda lolos debounce → diam, jangan reply.
 */
async function stepReply(ctx, text, extra = {}) {
  const opts = { parse_mode: 'HTML', ...extra };
  if (typeof ctx.editMessageText === 'function') {
    try {
      return await ctx.editMessageText(text, { ...opts, reply_markup: extra.reply_markup });
    } catch (err) {
      if (/not modified|message to edit not found/i.test(String(err?.message || err?.description || ''))) return;
    }
  }
  return ctx.reply(text, opts);
}

// Abaikan klik-ganda tombol wizard yang sama dalam 3 detik (user tekan ulang
// karena koneksi lambat). Disimpan di session, hanya untuk jalur add:*.
function isDoubleTap(ctx, action) {
  if (!action.startsWith('add:')) return false;
  ctx.session = ctx.session || {};
  const prev = ctx.session._lastWizard;
  const now = Date.now();
  if (prev && prev.action === action && now - prev.ts < 3000) return true;
  ctx.session._lastWizard = { action, ts: now };
  return false;
}
function metaAccounts(deps, userId) {
  const rows = deps?.repos?.platformAccountsRepo?.findByUserId?.(userId) ?? [];
  return rows.filter((r) => r.platform === 'meta');
}

// Sapu live SATU KALI per token: nama ad account + Automated Rules native FB.
// Dulu renderMyRules panggil liveAdAccountNames + liveFbRules = sapu SEMUA
// token 2x (tiap token mati ~400ms). User bertoken banyak → reply >14 detik.
export async function liveFbData(deps, userId) {
  const names = new Map();
  const byAccount = new Map();
  const seen = new Set();
  for (const row of metaAccounts(deps, userId)) {
    const token = row.credentials?.access_token || row.access_token;
    if (!token || seen.has(token)) continue;
    seen.add(token);
    let api = null;
    try {
      api = MetaAdsAPI.withToken(token);
    } catch { continue; }
    let live = [];
    try {
      live = await api.getAdAccounts();
    } catch { continue; }
    for (const a of live || []) {
      if (a?.id && !names.has(String(a.id))) names.set(String(a.id), a.name || String(a.id));
      const bare = String(a?.id || '').replace(/^act_/, '');
      if (bare && !names.has(bare)) names.set(bare, a.name || String(a.id));
      const key = String(a.id);
      if (byAccount.has(key)) continue;
      let rules = [];
      try {
        rules = await api.getAdRulesLibrary(a.id, { limit: 50 });
      } catch { /* akun ini skip */ }
      if (rules?.length) byAccount.set(key, { accountId: key, accountName: a.name || String(a.id), rules });
    }
  }
  return { names, groups: [...byAccount.values()] };
}


/**
 * Nama ASLI ad account dari Meta (live), bukan nama koneksi saat submit token.
 * Thin wrapper di atas liveFbData (1 sapuan per token).
 */
export async function liveAdAccountNames(deps, userId) {
  try {
    return (await liveFbData(deps, userId)).names;
  } catch { return new Map(); }
}

/**
 * Sapu Automated Rules NATIVE Facebook per token user (read-only).
 * Return [{ accountId, accountName, rules: [{...fb, summary}] }].
 * Gagal per akun = skip (token mati / izin kurang), bukan fatal.
 * Thin wrapper di atas liveFbData (1 sapuan per token, dedup per akun).
 */
export async function liveFbRules(deps, userId) {
  try {
    return (await liveFbData(deps, userId)).groups;
  } catch { return []; }
}
function resolveAcctName(liveNames, accounts, accountId) {
  const id = String(accountId || '');
  if (liveNames?.has(id)) return liveNames.get(id);
  const bare = id.replace(/^act_/, '');
  if (liveNames?.has(bare)) return liveNames.get(bare);
  const row = (accounts || []).find(a =>
    String(a.credentials?.ad_account_id || '') === id ||
    String(a.credentials?.ad_account_id || '').replace(/^act_/, '') === bare);
  if (row?.account_name) return row.account_name;
  return id;
}

function metricsByCategory() {
  const cats = {};
  for (const [key, m] of Object.entries(METRICS)) {
    if (!cats[m.category]) cats[m.category] = [];
    cats[m.category].push({ key, ...m });
  }
  return cats;
}
export function handleMonitor(deps) {
  return (ctx) => {
    const accounts = metaAccounts(deps, ctx.userId);
    const keyboard = [];
    if (accounts.length > 0) {
      keyboard.push([{ text: '⚙️ Aturan per Akun', callback_data: 'rule:account_picker' }]);
    }
    keyboard.push([
      { text: '➕ Bikin Aturan', callback_data: 'rule:add:start' },
      { text: '📋 Aturanku', callback_data: 'rule:view:all' },
    ]);
    keyboard.push([
      { text: '📦 Template', callback_data: 'rule:templates' },
      { text: '🔄 Sync Sekarang', callback_data: 'monitor:sync' },
    ]);
    keyboard.push([
      { text: '📊 Kinerja Aturan', callback_data: 'rule:history' },
    ]);
    keyboard.push([{ text: '📋 Menu', callback_data: 'quick:menu' }]);
    return ctx.reply(MONITOR_HEADER, { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
  };
}

function scopeLabel(rb, liveNames, accounts) {
  if (!rb?.accountId) return '🌐 Semua Akun';
  if (rb.accountId === '__all__') return '🌐 Semua Akun';
  return `📘 ${resolveAcctName(liveNames, accounts, rb.accountId)}`;
}

async function showAccountStep(ctx, deps) {
  // Langkah 1 bikin rule: PILIH AKUN dulu (live dari Meta, bukan nama koneksi).
  const accounts = metaAccounts(deps, ctx.userId);
  if (!accounts.length) {
    return ctx.reply('🔌 Hubungkan akun Meta dulu via /status → ➕ Tambah Akun, baru bisa bikin aturan.', {
      reply_markup: { inline_keyboard: [[{ text: '📋 Menu', callback_data: 'quick:menu' }]] },
    });
  }
  const seen = new Set();
  const liveList = [];
  const seenTokens = new Set();
  for (const row of accounts) {
    const token = row.credentials?.access_token || row.access_token;
    if (!token || seenTokens.has(token)) continue;
    seenTokens.add(token);
    try {
      const api = MetaAdsAPI.withToken(token);
      for (const a of (await api.getAdAccounts()) || []) {
        const key = String(a.id);
        if (seen.has(key)) continue;
        seen.add(key);
        liveList.push(a);
      }
    } catch { /* token mati → skip */ }
  }
  const keyboard = liveList.slice(0, 8).map(a => [{
    text: `📘 ${a.name || a.id}`,
    callback_data: `rule:add:account:${a.id}`,
  }]);
  keyboard.push([{ text: '🌐 Semua Akun', callback_data: 'rule:add:account:__all__' }]);
  keyboard.push([{ text: '⬅️ Kembali', callback_data: 'menu:monitor' }]);
  keyboard.push([{ text: '📋 Menu', callback_data: 'quick:menu' }]);
  ctx.session = ctx.session || {};
  ctx.session.ruleBuilder = {};
  return ctx.reply(
    '🎯 <b>Bikin Aturan Baru — Langkah 1/5: buat akun iklan mana?</b>\n\nPilih akun yang mau dijaga aturannya:',
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } }
  );
}

async function scopedLabel(ctx, deps) {
  const rb = ctx.session?.ruleBuilder;
  const liveNames = await liveAdAccountNames(deps, ctx.userId);
  return scopeLabel(rb, liveNames, metaAccounts(deps, ctx.userId));
}

async function showMetricCategories(ctx, deps) {
  const scope = await scopedLabel(ctx, deps);
  const cats = metricsByCategory();
  const keyboard = [];
  for (const [catId, catName] of Object.entries(METRIC_CATEGORIES)) {
    const metrics = cats[catId];
    if (metrics && metrics.length > 0) {
      keyboard.push([{ text: catName, callback_data: `rule:add:cat:${catId}` }]);
    }
  }
  keyboard.push([{ text: '⬅️ Ganti Akun', callback_data: 'rule:add:start' }]);
  return stepReply(ctx, `📊 <b>Langkah 2/5: mau pantau apa?</b>\n\nAturan untuk: <b>${esc(scope)}</b>\n\nPilih jenis metrik:`, { reply_markup: { inline_keyboard: keyboard } });
}

async function showMetricsInCategory(ctx, deps, categoryId) {
  const scope = await scopedLabel(ctx, deps);
  const metrics = Object.entries(METRICS).filter(([, m]) => m.category === categoryId);
  const keyboard = [];
  for (const [key, m] of metrics) {
    keyboard.push([{ text: `${m.name}`, callback_data: `rule:add:metric:${key}` }]);
  }
  keyboard.push([{ text: '⬅️ Kategori', callback_data: 'rule:add:start' }]);
  keyboard.push([{ text: '📋 Menu', callback_data: 'quick:menu' }]);
  return stepReply(ctx, `📏 <b>${esc(METRIC_CATEGORIES[categoryId])}</b> — buat <b>${esc(scope)}</b>\n\nPilih metriknya:`, { reply_markup: { inline_keyboard: keyboard } });
}

async function showOperators(ctx, deps, metric) {
  const scope = await scopedLabel(ctx, deps);
  const m = METRICS[metric];
  if (!m) return ctx.reply('⚠️ Metrik nggak dikenal. Ulangi dari /monitor.');
  const keyboard = [
    [{ text: '> (lebih dari)', callback_data: `rule:add:op:${metric}:gt` }],
    [{ text: '< (kurang dari)', callback_data: `rule:add:op:${metric}:lt` }],
    [{ text: '>= (lebih/sama)', callback_data: `rule:add:op:${metric}:gte` }],
    [{ text: '<= (kurang/sama)', callback_data: `rule:add:op:${metric}:lte` }],
    [{ text: '⬅️ Metrik', callback_data: `rule:add:cat:${m.category}` }],
    [{ text: '📋 Menu', callback_data: 'quick:menu' }],
  ];
  return stepReply(ctx, `📐 <b>${esc(m.name)}</b> — buat <b>${esc(scope)}</b>\n\nPilih pembandingnya:`, { reply_markup: { inline_keyboard: keyboard } });
}

function showTemplates(ctx) {
  const keyboard = [];
  for (const [key, fn] of Object.entries(RULE_TEMPLATES)) {
    const t = fn();
    keyboard.push([{ text: t.name, callback_data: `rule:template:${key}` }]);
  }
  keyboard.push([{ text: '⬅️ Kembali', callback_data: 'menu:monitor' }]);
  keyboard.push([{ text: '📋 Menu', callback_data: 'quick:menu' }]);
  return ctx.reply(
    '📦 <b>Template Aturan</b>\n\nAturan siap pakai — pencet satu, lalu pilih buat akun mana:\n\n' +
    '• ROAS Guard — Pause kalau ROAS &lt; 1x\n' +
    '• Frequency Cap — Pause kalau frekuensi &gt; 5\n' +
    '• High CTR Alert — CTR &gt; 5%\n' +
    '• Low CVR Alert — CVR &lt; 1%\n' +
    '• CPC Spike — CPC &gt; 200\n' +
    '• CPA Drop — CPA &lt; 50k\n' +
    '• CPM Control — CPM &gt; 15k\n' +
    '• Dayparting — Jam rame 6-11 malam\n' +
    '• Auto Increase — ROAS &gt; 2x, +20%\n' +
    '• Auto Decrease — ROAS &lt; 1x, -30%\n' +
    '• Auto Duplicate — CVR &gt; 3%, spend &gt; 100k',
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } }
  );
}
function renderRuleLine(state, enabled, rule, interval, hist) {
  const cond = describeRuleCondition(rule.condition);
  const act = actionWord(rule.action?.type);
  const head = `${state} ${enabled ? '' : '(nonaktif) '}<b>${esc(cond)} → ${esc(act)}</b>`;
  const auto = ruleAutoName(
    rule.condition?.metric, rule.condition?.operator, rule.condition?.value
  );
  const showName = rule.name && rule.name !== auto && !cond.includes(rule.name);
  const base = showName
    ? `${head}\n   "${esc(rule.name)}" (${interval})`
    : `${head} (${interval})`;
  // Tanda rule berjalan: match terakhir + hasilnya. Tanpa ini user tidak tahu
  // rule-nya pernah match atau cuma pajangan.
  if (hist?.last) {
    const mark = hist.last.status === 'approved' ? '✅' : hist.last.status === 'rejected' ? '❌' : '⏳';
    const camp = hist.last.campaign ? `, ${hist.last.campaign}` : '';
    const errBit = hist.last.lastError ? `\n   ⚠️ <i>Gagal: ${esc(String(hist.last.lastError).slice(0, 120))}</i>` : '';
    return `${base}\n   <i>Terakhir: ${relTime(hist.last.at)}${camp} → ${hist.last.action} ${mark}</i>${errBit}`;
  }
  if ((hist?.total || 0) === 0) {
    return `${base}\n   <i>Belum pernah match</i>`;
  }
  return base;
}

// Render My Rules grouped per ad account (nama ASLI dari Meta), with edit/disable buttons
async function renderMyRules(deps, userId) {
  const rules = deps?.repos?.rulesRepo?.getAll?.(userId) || [];
  const accounts = metaAccounts(deps, userId);
  const { names: liveNames, groups: fbGroups } = await liveFbData(deps, userId).catch(() => ({ names: new Map(), groups: [] }));

  // ── Aturan NATIVE Facebook (read-only) ──────────────────────
  // Dulu tiap rule FB di-dump lengkap di layar ini (kondisi mentah
  // "campaign.name CONTAIN ..." + nama kurung) — user bingung. Sekarang
  // cukup 1 baris ringkas per akun + tombol Lihat buat detailnya.
  // Diambil DULU sebelum early-return: user tanpa bot rules tapi punya
  // FB rules tetap lihat infonya, bukan layar kosong.
  const fbSummaries = [];
  const fbDetailButtons = [];
  let collision = false;
  for (const g of fbGroups || []) {
    const total = (g.rules || []).length;
    if (!total) continue;
    const activeN = (g.rules || []).filter(fb => describeFbRule(fb).active).length;
    const state = activeN > 0 ? '🟢' : '⚪️';
    fbSummaries.push(`${state} 📌 ${esc(g.accountName)} — ${total} aturan Facebook (${activeN} aktif)`);
    if (fbDetailButtons.length < 6) {
      fbDetailButtons.push([{ text: `🔍 ${g.accountName.slice(0, 20)}`, callback_data: `rule:fb:${g.accountId}` }]);
    }
    if (activeN > 0) {
      const botActive = rules.some(r => r.enabled && (!r.accountId || String(r.accountId) === String(g.accountId) || String(r.accountId).replace(/^act_/, '') === String(g.accountId).replace(/^act_/, '')));
      if (botActive) collision = true;
    }
  }
  const fbBlock = fbSummaries.length
    ? `\n<b>📌 Aturan Facebook (jalan di sana, bot nggak ganggu):</b>\n${fbSummaries.join('\n')}\n<i>Pencet 🔍 buat lihat detail per akun. Jangan pasang dua aturan berlawanan di akun yang sama ya.</i>`
    : '';
  const collisionBlock = collision
    ? `\n\n⚠️ <b>Hati-hati tabrakan:</b> akun ini dijaga aturan bot DAN aturan Facebook yang dua-duanya aktif. Misal FB matiin campaign sementara bot nyalain lagi (atau sebaliknya). Matikan salah satunya kalau kelakuannya aneh.`
    : '';

  if (!rules.length) {
    const keyboard = [[{ text: '➕ Bikin Aturan', callback_data: 'rule:add:start' }, { text: '📋 Menu', callback_data: 'quick:menu' }]];
    for (const row of fbDetailButtons) keyboard.splice(keyboard.length - 1, 0, row);
    return {
      text: fbSummaries.length
        ? `📋 <b>Aturanku</b>\n\n📭 Belum ada aturan bot. Tapi akunmu dijaga Facebook:\n${fbBlock}`
        : '📭 Belum ada aturan. Pencet ➕ Bikin Aturan atau 📦 Template buat bikin yang pertama!',
      keyboard,
    };
  }

  // Group rules by account (rules with null accountId go under "All accounts")
  const byAccount = {};
  for (const r of rules) {
    const key = r.accountId || '__all__';
    if (!byAccount[key]) byAccount[key] = [];
    byAccount[key].push(r);
  }

  const lines = [];
  const keyboard = [];
  for (const [acctId, accountRules] of Object.entries(byAccount)) {
    const label = acctId === '__all__' ? '🌐 Semua Akun' : `📘 ${esc(resolveAcctName(liveNames, accounts, acctId))}`;
    lines.push(`<b>${label}</b>`);
    for (const r of accountRules) {
      const state = r.enabled ? '🟢' : '⚪️';
      const interval = INTERVAL_LABELS[r.intervalMinutes] || INTERVAL_LABELS[15];
      lines.push(renderRuleLine(state, r.enabled, r, interval, ruleHistory(deps.repos?.draftsRepo, userId, r)));
    }
    lines.push('');
  }
  const text =
    `📋 <b>Aturanku</b>\n` +
    `<i>Aturan hidup di bot (bukan di dashboard Facebook): bot cek tiap jadwal, kalau kejadian kirim minta setuju, baru eksekusi setelah kamu pencet ✅.</i>\n\n${lines.join('\n')}` +
    fbBlock + collisionBlock;

  // Per-rule action buttons (edit/disable/enable/delete)
  for (const r of rules.slice(0, 8)) {
    const toggle = r.enabled ? '⏸ Matikan' : '▶️ Nyalakan';
    keyboard.push([
      { text: `${toggle}: ${r.name.slice(0, 20)}`, callback_data: `rule:toggle:${r.id}` },
    ]);
  }
  for (const row of fbDetailButtons) keyboard.push(row);
  keyboard.push([{ text: '➕ Bikin Aturan', callback_data: 'rule:add:start' }]);
  keyboard.push([{ text: '⬅️ Kembali', callback_data: 'menu:monitor' }]);
  keyboard.push([{ text: '📋 Menu', callback_data: 'quick:menu' }]);
  return { text, keyboard };
}

// Layar detail aturan Facebook SATU akun (dari tombol 🔍). Read-only:
// nama rule + kondisi bersih (tanpa noise teknis) + status aktif/mati.
export async function showFbRulesForAccount(ctx, deps, accountId) {
  const groups = await liveFbRules(deps, ctx.userId).catch(() => []);
  const g = (groups || []).find(x => String(x.accountId) === String(accountId)
    || String(x.accountId).replace(/^act_/, '') === String(accountId).replace(/^act_/, ''));
  if (!g) {
    return ctx.reply('📌 Aturan Facebook buat akun ini nggak ketemu (mungkin token mati / izin kurang).', {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[{ text: '📋 Aturanku', callback_data: 'rule:view:all' }], [{ text: '📋 Menu', callback_data: 'quick:menu' }]] },
    });
  }
  const rows = (g.rules || []).map(fb => {
    const s = describeFbRule(fb);
    return `${s.active ? '🟢' : '⚪️'} <b>${esc(fb.name || 'Aturan Facebook')}</b>\n   ${esc(s.text)}`;
  });
  return ctx.reply(
    `📌 <b>Aturan Facebook — ${esc(g.accountName)}</b>\n<i>Read-only, jalan di Facebook. Bot nggak ganggu.</i>\n\n${rows.join('\n\n') || '📭 Nggak ada.'}`,
    {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[{ text: '⬅️ Aturanku', callback_data: 'rule:view:all' }], [{ text: '📋 Menu', callback_data: 'quick:menu' }]] },
    }
  );
}

async function showAccountPicker(ctx, deps) {
  // Lihat aturan per akun: daftar LIVE ad accounts (nama asli Meta).
  const accounts = metaAccounts(deps, ctx.userId);
  if (!accounts.length) {
    return ctx.reply('🔌 Hubungkan akun Meta dulu via /status → ➕ Tambah Akun.', {
      reply_markup: { inline_keyboard: [[{ text: '📋 Menu', callback_data: 'quick:menu' }]] },
    });
  }
  const liveNames = await liveAdAccountNames(deps, ctx.userId);
  const seen = new Set();
  const keyboard = [];
  // Tampilkan tiap real ad account unik (nama live), bukan nama koneksi.
  const seenTokens = new Set();
  for (const row of accounts) {
    const token = row.credentials?.access_token || row.access_token;
    if (!token || seenTokens.has(token)) continue;
    seenTokens.add(token);
    try {
      const api = MetaAdsAPI.withToken(token);
      for (const a of (await api.getAdAccounts()) || []) {
        const key = String(a.id);
        if (seen.has(key)) continue;
        seen.add(key);
        keyboard.push([{ text: `⚙️ ${a.name || a.id}`, callback_data: `rule:account:${a.id}` }]);
        if (keyboard.length >= 8) break;
      }
    } catch { /* skip */ }
    if (keyboard.length >= 8) break;
  }
  if (!keyboard.length) {
    for (const a of accounts.slice(0, 8)) {
      keyboard.push([{ text: `⚙️ ${a.account_name || a.id}`, callback_data: `rule:account:${a.credentials?.ad_account_id || a.id}` }]);
    }
  }
  void liveNames;
  keyboard.push([{ text: '⬅️ Kembali', callback_data: 'menu:monitor' }]);
  keyboard.push([{ text: '📋 Menu', callback_data: 'quick:menu' }]);
  return ctx.reply('⚙️ <b>Lihat Aturan per Akun</b>\n\nPilih akun iklannya:', { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
}

async function showRulesForAccount(deps, userId, accountId) {
  const rules = deps?.repos?.rulesRepo?.getAll?.(userId) || [];
  const accounts = metaAccounts(deps, userId);
  const liveNames = await liveAdAccountNames(deps, userId);
  const name = resolveAcctName(liveNames, accounts, accountId);
  const bare = String(accountId || '').replace(/^act_/, '');
  const acctRules = rules.filter(r => {
    const rid = String(r.accountId || '');
    return rid === String(accountId) || rid === bare || rid === `act_${bare}` || !r.accountId;
  });
  if (!acctRules.length) {
    return {
      text: `📭 Belum ada aturan buat <b>${esc(name)}</b>. Bikin sekarang ya!`,
      keyboard: [[{ text: '➕ Bikin Aturan', callback_data: 'rule:add:start' }], [{ text: '📋 Menu', callback_data: 'quick:menu' }]],
    };
  }
  const lines = acctRules.map((r, i) => {
    const state = r.enabled ? '🟢' : '⚪️';
    const interval = INTERVAL_LABELS[r.intervalMinutes] || INTERVAL_LABELS[15];
    return `${i + 1}. ${renderRuleLine(state, r.enabled, r, interval, ruleHistory(deps.repos?.draftsRepo, userId, r))}`;
  });
  const keyboard = [];
  for (const r of acctRules.slice(0, 8)) {
    const toggle = r.enabled ? '⏸ Matikan' : '▶️ Nyalakan';
    keyboard.push([{ text: `${toggle}: ${r.name.slice(0, 20)}`, callback_data: `rule:toggle:${r.id}` }]);
  }
  keyboard.push([{ text: '⬅️ Kembali', callback_data: 'menu:monitor' }]);
  keyboard.push([{ text: '📋 Menu', callback_data: 'quick:menu' }]);
  return { text: `⚙️ <b>Aturan buat ${esc(name)}</b>\n\n${lines.join('\n\n')}`, keyboard };
}

/**
 * Layar "📊 Kinerja Aturan": tiap rule + berapa kali match (total/setuju/
 * tolak/nunggu) + match terakhir. Ini jawaban "rule-nya jalan nggak?".
 */
export async function showRuleHistory(ctx, deps) {
  const rules = deps?.repos?.rulesRepo?.getAll?.(ctx.userId) || [];
  const accounts = metaAccounts(deps, ctx.userId);
  const liveNames = await liveAdAccountNames(deps, ctx.userId);
  if (!rules.length) {
    return ctx.reply('📭 Belum ada aturan. Bikin dulu via ➕ Bikin Aturan.', {
      reply_markup: { inline_keyboard: [[{ text: '📋 Menu', callback_data: 'quick:menu' }]] },
    });
  }
  const byAccount = {};
  for (const r of rules) {
    const key = r.accountId || '__all__';
    if (!byAccount[key]) byAccount[key] = [];
    byAccount[key].push(r);
  }
  const lines = [];
  for (const [acctId, accountRules] of Object.entries(byAccount)) {
    const label = acctId === '__all__' ? '🌐 Semua Akun' : `📘 ${esc(resolveAcctName(liveNames, accounts, acctId))}`;
    lines.push(`<b>${label}</b>`);
    for (const r of accountRules) {
      const h = ruleHistory(deps.repos?.draftsRepo, ctx.userId, r);
      const state = r.enabled ? '🟢' : '⚪️';
      const cond = describeRuleCondition(r.condition);
      if (!h.total) {
        lines.push(`${state} <b>${esc(cond)}</b>\n   <i>Belum pernah match — aturan standby.</i>`);
        continue;
      }
      const lastBit = h.last
        ? `Terakhir ${relTime(h.last.at)}${h.last.campaign ? ` di "${h.last.campaign}"` : ''} → ${h.last.action} ${h.last.status === 'approved' ? '✅' : h.last.status === 'rejected' ? '❌' : '⏳'}`
        : '';
      lines.push(
        `${state} <b>${esc(cond)}</b>\n` +
        `   Match ${h.total}x (✅ ${h.approved} • ❌ ${h.rejected} • ⏳ ${h.pending})${lastBit ? `\n   <i>${esc(lastBit)}</i>` : ''}`
      );
    }
    lines.push('');
  }
  return ctx.reply(`📊 <b>Kinerja Aturan (30 hari terakhir data)</b>\n\n${lines.join('\n')}`, {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [{ text: '📋 Aturanku', callback_data: 'rule:view:all' }],
        [{ text: '⬅️ Kembali', callback_data: 'menu:monitor' }],
        [{ text: '📋 Menu', callback_data: 'quick:menu' }],
      ],
    },
  });
}

export function handleMonitorCallback(deps) {
  return async (ctx) => {
    const action = ctx.match[1];
    await ctx.answerCbQuery();

    if (action === 'add:start') return showAccountStep(ctx, deps);
    if (action.startsWith('add:account:')) {
      if (isDoubleTap(ctx, action)) return;
      const accountId = action.split(':')[2];
      ctx.session = ctx.session || {};
      ctx.session.ruleBuilder = { accountId };
      return showMetricCategories(ctx, deps);
    }
    if (action.startsWith('add:cat:')) {
      if (isDoubleTap(ctx, action)) return;
      return showMetricsInCategory(ctx, deps, action.split(':')[2]);
    }
    if (action.startsWith('add:metric:')) {
      if (isDoubleTap(ctx, action)) return;
      // FIX: use pop() instead of [3] since callback is rule:add:metric:ctr
      const metric = action.split(':').pop();
      return showOperators(ctx, deps, metric);
    }
    if (action.startsWith('add:op:')) {
      if (isDoubleTap(ctx, action)) return;
      const parts = action.split(':');
      const metric = parts[2];
      const op = parts[3];
      if (!metric || !METRICS[metric] || !op) return ctx.reply('⚠️ Pilihan nggak valid. Ulangi dari /monitor → ➕ Bikin Aturan.');
      ctx.session = ctx.session || {};
      // JANGAN reset accountId — itu dipilih di langkah 1.
      ctx.session.ruleBuilder = { ...(ctx.session.ruleBuilder || {}), metric, operator: op };
      return showActionPicker(ctx, deps);
    }
    if (action.startsWith('add:action:')) {
      if (isDoubleTap(ctx, action)) return;
      const actionType = action.split(':')[2];
      ctx.session = ctx.session || {};
      ctx.session.ruleBuilder = { ...(ctx.session.ruleBuilder || {}), actionType };
      return showIntervalPicker(ctx, deps);
    }
    if (action.startsWith('add:interval:')) {
      if (isDoubleTap(ctx, action)) return;
      const interval = parseInt(action.split(':')[2], 10);
      ctx.session = ctx.session || {};
      ctx.session.ruleBuilder = { ...(ctx.session.ruleBuilder || {}), interval };
      const rb = ctx.session.ruleBuilder;
      if (!rb.value) {
        // Ask for the numeric threshold, capture it via the text handler
        ctx.session.ruleBuilder.awaitingValue = true;
        const liveNames = await liveAdAccountNames(deps, ctx.userId);
        const scope = scopeLabel(rb, liveNames, metaAccounts(deps, ctx.userId));
        return stepReply(ctx,
          `📝 <b>Langkah 5/5: batas angkanya berapa?</b>\n\nAturan untuk: <b>${esc(scope)}</b>\n${esc(metricLabel(rb.metric))} ${esc(operatorWord(rb.operator))} [angka]\n\nContoh: kalau ${esc(metricLabel(rb.metric))} ${esc(operatorWord(rb.operator))} 5, kirim <code>5</code>`,
          { reply_markup: { inline_keyboard: [[{ text: '⬅️ Batal', callback_data: 'menu:monitor' }], [{ text: '📋 Menu', callback_data: 'quick:menu' }]] } }
        );
      }
      return createRule(ctx, deps, ctx.session.ruleBuilder.actionType, interval);
    }
    if (action.startsWith('toggle:')) {
      const ruleId = action.split(':')[1];
      const rule = deps.repos.rulesRepo.getById(ruleId);
      if (!rule) return ctx.reply('⚠️ Aturan nggak ketemu.');
      if (rule.userId && rule.userId !== ctx.userId) return ctx.reply('⚠️ Aturan nggak ketemu.');
      deps.repos.rulesRepo.update(ruleId, { enabled: !rule.enabled });
      return ctx.reply(`✅ Aturan <b>${esc(rule.name)}</b> ${rule.enabled ? 'dimatikan' : 'dinyalakan'}.`, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[{ text: '📋 Aturanku', callback_data: 'rule:view:all' }], [{ text: '📋 Menu', callback_data: 'quick:menu' }]] },
      });
    }
    if (action === 'templates') { delete ctx.session.ruleBuilder; return showTemplates(ctx); }
    if (action.startsWith('template:')) {
      const parts = action.split(':');
      if (parts.length >= 3 && parts[2]) return applyTemplate(ctx, deps, parts[1], parts[2]);
      return showTemplateAccountStep(ctx, deps, parts[1]);
    }
    if (action === 'view:all') {
      const { text, keyboard } = await renderMyRules(deps, ctx.userId);
      return ctx.reply(text, { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
    }
    if (action === 'history') return showRuleHistory(ctx, deps);
    if (action.startsWith('fb:')) return showFbRulesForAccount(ctx, deps, action.split(':')[1]);
    if (action === 'account_picker') return showAccountPicker(ctx, deps);
    if (action.startsWith('account:')) {
      const accountId = action.split(':')[1];
      ctx.session = ctx.session || {};
      ctx.session.ruleBuilder = { ...(ctx.session.ruleBuilder || {}), accountId };
      const { text, keyboard } = await showRulesForAccount(deps, ctx.userId, accountId);
      return ctx.reply(text, { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
    }
    if (action === 'sync') {
      let synced = 0;
      let failed = 0;
      const rows = (deps.repos?.platformAccountsRepo?.findByUserId?.(ctx.userId) || [])
        .filter(a => a.platform === 'meta' && (a.credentials?.access_token || a.access_token));
      // Kumpulkan target: ad_account_id tersimpan; kalau koneksi tidak punya
      // (koneksi lama), sapu SEMUA akun live dari token itu juga.
      const targets = [];
      const seenTokens = new Set();
      for (const acct of rows) {
        const token = acct.credentials?.access_token || acct.access_token;
        if (!token || seenTokens.has(token)) continue;
        seenTokens.add(token);
        const savedId = acct.credentials?.ad_account_id;
        if (savedId) {
          targets.push({ token, adAccountId: savedId });
          continue;
        }
        try {
          const api = MetaAdsAPI.withToken(token);
          for (const a of (await api.getAdAccounts()) || []) {
            targets.push({ token, adAccountId: a.id });
          }
        } catch {
          failed++;
        }
      }
      const seenTargets = new Set();
      for (const t of targets) {
        const key = `${t.adAccountId}`;
        if (seenTargets.has(key)) continue;
        seenTargets.add(key);
        try {
          const api = MetaAdsAPI.withToken(t.token);
          const campaigns = await api.getCampaigns(t.adAccountId, { limit: 200 });
          // Metrik 30d per campaign — tanpa ini semua rule spend/roas/konversi
          // tidak pernah match (nilai NULL → evaluateLeaf false selamanya).
          let insightsById = {};
          try {
            insightsById = await api.getMultiCampaignInsights(campaigns.map(c => c.id), { datePreset: 'last_30d', accountId: t.adAccountId }) || {};
          } catch (e) {
            log.warn('Sync insights failed for account', { adAccountId: t.adAccountId, error: e.message });
          }
          for (const c of campaigns) {
            const ins = insightsById[c.id] || {};
            const spend = Number(ins.spend || 0);
            const revenue = Number(ins.revenue || 0);
            deps.repos?.campaignsRepo?.upsert?.({
              platform: 'meta',
              campaign_id: c.id,
              account_id: t.adAccountId,
              name: c.name,
              status: c.status,
              budget: c.dailyBudget || 0,
              spend,
              revenue,
              impressions: Number(ins.impressions || 0),
              clicks: Number(ins.clicks || ins.linkClicks || 0),
              conversions: Number(ins.conversions || 0),
              roas: spend > 0 && revenue > 0 ? revenue / spend : 0,
              userId: ctx.userId,
            });
          }
          synced += campaigns.length;
        } catch (e) {
          failed++;
          log.warn('Sync failed for account', { adAccountId: t.adAccountId, error: e.message });
        }
      }
      return ctx.reply(`🔄 Sync selesai: ${synced} campaign ketarik dari Meta${failed ? `, ${failed} gagal` : ''}. Cek /status buat hasilnya.`);
    }
    return ctx.reply('⚠️ Pilihan nggak dikenal. Balik ke /monitor ya.');
  };
}
async function showActionPicker(ctx, deps) {
  const rb = ctx.session?.ruleBuilder;
  if (!rb) return ctx.reply('⚠️ Sesi habis. Ulangi dari /monitor.');
  const scope = await scopedLabel(ctx, deps);
  const keyboard = [
    [{ text: '🔴 Pause', callback_data: 'rule:add:action:pause' }],
    [{ text: '🟢 Resume', callback_data: 'rule:add:action:resume' }],
    [{ text: '📈 Increase Budget', callback_data: 'rule:add:action:increase_budget' }],
    [{ text: '📉 Decrease Budget', callback_data: 'rule:add:action:decrease_budget' }],
    [{ text: '📋 Duplicate', callback_data: 'rule:add:action:duplicate_campaign' }],
    [{ text: '💰 Scale Budget', callback_data: 'rule:add:action:scale_budget' }],
    [{ text: '📢 Notify', callback_data: 'rule:add:action:notify' }],
    [{ text: '🔴📢 Notify + Pause', callback_data: 'rule:add:action:notify_and_pause' }],
    [{ text: '⬅️ Kembali', callback_data: `rule:add:metric:${rb.metric}` }],
    [{ text: '📋 Menu', callback_data: 'quick:menu' }],
  ];
  return stepReply(ctx,
    `🎯 <b>Langkah 3/5: kalau kejadian, ngapain?</b>\n\nAturan untuk: <b>${esc(scope)}</b>\nKalau: <b>${esc(metricLabel(rb.metric))} ${esc(operatorWord(rb.operator))} ${esc(formatRuleValue(rb.metric, rb.value || '?'))}</b>\n\nPilih aksinya:`,
    { reply_markup: { inline_keyboard: keyboard } }
  );
}

async function showIntervalPicker(ctx, deps) {
  const rb = ctx.session?.ruleBuilder;
  if (!rb) return ctx.reply('⚠️ Sesi habis. Ulangi dari /monitor.');
  const scope = await scopedLabel(ctx, deps);
  const keyboard = [
    [{ text: '⏱ Tiap 15 menit', callback_data: 'rule:add:interval:15' }],
    [{ text: '⏱ Tiap 30 menit', callback_data: 'rule:add:interval:30' }],
    [{ text: '⏱ Tiap 1 jam', callback_data: 'rule:add:interval:60' }],
    [{ text: '⏱ Tiap 6 jam', callback_data: 'rule:add:interval:360' }],
    [{ text: '⏱ Ngikutin pacing FB', callback_data: 'rule:add:interval:0' }],
    [{ text: '⬅️ Kembali', callback_data: `rule:add:action:${rb.actionType || 'notify'}` }],
    [{ text: '📋 Menu', callback_data: 'quick:menu' }],
  ];
  const ACTION_LABELS = {
    pause: 'dimatiin', resume: 'dinyalain',
    increase_budget: 'budget dinaikin', decrease_budget: 'budget diturunin',
    duplicate_campaign: 'diduplikat', scale_budget: 'budget diubah',
    notify: 'kasih kabar', notify_and_pause: 'kasih kabar + dimatiin',
  };
  return stepReply(ctx,
    `🎯 <b>Langkah 4/5: seberapa sering dicek?</b>\n\nAturan untuk: <b>${esc(scope)}</b>\nKalau <b>${esc(metricLabel(rb.metric))} ${esc(operatorWord(rb.operator))} ${esc(formatRuleValue(rb.metric, rb.value || '?'))}</b> → <b>${esc(ACTION_LABELS[rb.actionType] || actionWord(rb.actionType))}</b>\n\nPilih jadwal pengecekan:`,
    { reply_markup: { inline_keyboard: keyboard } }
  );
}

async function createRule(ctx, deps, actionType, intervalMinutes = 15) {
  const rb = ctx.session?.ruleBuilder;
  if (!rb) return ctx.reply('⚠️ Sesi habis. Ulangi dari /monitor.');
  if (!rb.value) {
    return ctx.reply(
      `📝 <b>Langkah 5/5: batas angkanya berapa?</b>\n\nAturan untuk: <b>${esc(scopeLabel(rb, null, null))}</b>\n${esc(metricLabel(rb.metric))} ${esc(operatorWord(rb.operator))} [angka]\n\nContoh: kalau CTR ${esc(operatorWord(rb.operator))} 5, kirim "5"`,
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '⬅️ Batal', callback_data: 'menu:monitor' }], [{ text: '📋 Menu', callback_data: 'quick:menu' }]] } }
    );
  }
  // rb.operator comes from callbacks as 'gt'/'lt'/'gte'/'lte'; Condition needs '>'/'<'/'>='/'<='
  const opSymbol = OPERATORS[rb.operator] || rb.operator;
  const condition = ConditionGroup.and().add(new Condition(rb.metric, opSymbol, parseFloat(rb.value)));
  const action = new RuleAction(actionType);
  try {
    const liveNames = await liveAdAccountNames(deps, ctx.userId);
    const scope = scopeLabel(rb, liveNames, metaAccounts(deps, ctx.userId));
    deps.repos.rulesRepo.create({
      userId: ctx.userId,
      accountId: rb.accountId || null,
      name: ruleAutoName(rb.metric, rb.operator, rb.value),
      description: `Aturan untuk ${scope}`,
      condition: condition.toJSON(),
      action: action.toJSON(),
      priority: 1,
      enabled: true,
      intervalMinutes,
    });
    delete ctx.session.ruleBuilder;
    return ctx.reply(
      `✅ <b>Aturan dibuat buat ${esc(scope)}!</b>\n\nKalau <b>${esc(ruleAutoName(rb.metric, rb.operator, rb.value))}</b> → <b>${esc(actionWord(actionType))}</b>\n⏱ ${intervalMinutes === 0 ? 'Ngikutin pacing FB' : 'Dicek tiap ' + (INTERVAL_LABELS[intervalMinutes] || intervalMinutes + ' mnt')}\n\n<i>Cara kerja: aturan ini hidup di bot (bukan di dashboard Facebook). Bot cek tiap jadwal — kalau kejadian, kamu dapat tombol ✅/❌ dulu, baru eksekusi jalan setelah kamu setuju.</i>\n\n<i>Kalau 30 menit tidak ada kabar: (1) sync dulu via /monitor → 🔄 Sync Sekarang, (2) cek draft menunggu di 📋 Aturanku → 📊 Kinerja.</i>`,
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '📋 Lihat Aturanku', callback_data: 'rule:view:all' }], [{ text: '📋 Menu', callback_data: 'quick:menu' }]] } }
    );
  } catch (err) {
    return ctx.reply(`❌ Gagal: ${esc(err.message)}`);
  }
}

async function applyTemplate(ctx, deps, tplKey, accountId = null) {
  const fn = RULE_TEMPLATES[tplKey];
  if (!fn) return ctx.reply('⚠️ Template nggak ketemu.');
  const tpl = fn();
  try {
    const liveNames = await liveAdAccountNames(deps, ctx.userId);
    const scope = accountId && accountId !== '__all__'
      ? resolveAcctName(liveNames, metaAccounts(deps, ctx.userId), accountId)
      : '🌐 Semua Akun';
    deps.repos.rulesRepo.create({
      userId: ctx.userId,
      accountId: accountId && accountId !== '__all__' ? accountId : null,
      name: tpl.name,
      description: `${tpl.description} — untuk ${scope}`,
      condition: tpl.condition.toJSON(),
      action: tpl.action.toJSON(),
      priority: tpl.priority,
      enabled: true,
      intervalMinutes: tpl.intervalMinutes || 15,
    });
    return ctx.reply(
      `✅ <b>Template ${esc(tpl.name)} dipasang buat ${esc(scope)}!</b>\n\n${esc(tpl.description)}`,
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '📋 Lihat Aturanku', callback_data: 'rule:view:all' }], [{ text: '📋 Menu', callback_data: 'quick:menu' }]] } }
    );
  } catch (err) {
    return ctx.reply(`❌ Gagal: ${esc(err.message)}`);
  }
}

async function showTemplateAccountStep(ctx, deps, tplKey) {
  const tpl = RULE_TEMPLATES[tplKey]?.();
  if (!tpl) return ctx.reply('⚠️ Template nggak ketemu.');
  const accounts = metaAccounts(deps, ctx.userId);
  if (!accounts.length) {
    return ctx.reply('🔌 Hubungkan akun Meta dulu via /status → ➕ Tambah Akun, baru bisa pasang template.', {
      reply_markup: { inline_keyboard: [[{ text: '📋 Menu', callback_data: 'quick:menu' }]] },
    });
  }
  const seen = new Set();
  const liveList = [];
  const seenTokens = new Set();
  for (const row of accounts) {
    const token = row.credentials?.access_token || row.access_token;
    if (!token || seenTokens.has(token)) continue;
    seenTokens.add(token);
    try {
      const api = MetaAdsAPI.withToken(token);
      for (const a of (await api.getAdAccounts()) || []) {
        const key = String(a.id);
        if (seen.has(key)) continue;
        seen.add(key);
        liveList.push(a);
      }
    } catch { /* skip */ }
  }
  const keyboard = liveList.slice(0, 8).map(a => [{
    text: `📘 ${a.name || a.id}`,
    callback_data: `rule:template:${tplKey}:${a.id}`,
  }]);
  keyboard.push([{ text: '🌐 Semua Akun', callback_data: `rule:template:${tplKey}:__all__` }]);
  keyboard.push([{ text: '⬅️ Kembali', callback_data: 'menu:monitor' }]);
  keyboard.push([{ text: '📋 Menu', callback_data: 'quick:menu' }]);
  return ctx.reply(
    `📦 <b>Pasang template "${esc(tpl.name)}" buat akun mana?</b>\n\n${esc(tpl.description)}`,
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } }
  );
}

export function handleMonitorText(deps) {
  return async (ctx) => {
    const rb = ctx.session?.ruleBuilder;
    if (!rb || !rb.awaitingValue) return false;
    const text = (ctx.message?.text || '').trim();
    if (!text || !/^\d+(\.\d+)?$/.test(text)) {
      await ctx.reply(`⚠️ Kirim angka yang valid ya buat batasnya (misal 5 atau 1.5).`);
      return true;
    }
    rb.value = text;
    rb.awaitingValue = false;
    await createRule(ctx, deps, rb.actionType, rb.interval);
    return true;
  };
}

export default { handleMonitor, handleMonitorCallback };
