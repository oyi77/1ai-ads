/**
 * Kata-kata Bahasa Indonesia untuk aturan otomatis.
 *
 * Satu sumber kebenaran dipakai TIGA tempat: layar bot (My Rules, builder),
 * ringkasan draft rule-guard, dan notifikasi Telegram saat rule match.
 * Sebelum modul ini, tiap tempat cetak `metric operator value` mentah
 * ("spend gt 10.000", "spend > 10 → pause") — pemula tidak paham gt itu apa,
 * 10 itu apa, pause itu ngapain.
 *
 * Plus: ringkas Automated Rules NATIVE Facebook (read-only) biar user yang
 * sudah punya rule di FB lihat semuanya dalam satu layar bot.
 */
import { METRICS } from './rule-metrics.js';

export const METRIC_LABELS_ID = {
  spend: 'Belanja',
  impressions: 'Impresi',
  clicks: 'Klik',
  reach: 'Reach',
  frequency: 'Frekuensi',
  conversions: 'Konversi',
  cvr: 'CVR',
  ctr: 'CTR',
  cpc: 'CPC',
  cpm: 'CPM',
  cpa: 'CPA',
  ocpc: 'oCPC',
  roas: 'ROAS',
  roi: 'ROI',
  hour_of_day: 'Jam',
  day_of_week: 'Hari',
};

export const OPERATOR_WORDS = {
  '>': 'lebih dari',
  '<': 'kurang dari',
  '>=': 'minimal',
  '<=': 'maksimal',
  '==': 'pas',
  '!=': 'bukan',
  gt: 'lebih dari',
  lt: 'kurang dari',
  gte: 'minimal',
  lte: 'maksimal',
  eq: 'pas',
  neq: 'bukan',
};

export const ACTION_WORDS = {
  pause: 'dimatiin',
  resume: 'dinyalain',
  increase_budget: 'budget dinaikin',
  decrease_budget: 'budget diturunin',
  duplicate_campaign: 'diduplikat',
  scale_budget: 'budget diubah',
  notify: 'kasih kabar',
  notify_and_pause: 'kasih kabar + dimatiin',
};

function fmtRp(n) {
  return `Rp ${Number(n || 0).toLocaleString('id-ID')}`;
}

export function metricLabel(metric) {
  if (METRIC_LABELS_ID[metric]) return METRIC_LABELS_ID[metric];
  return METRICS[metric]?.name || String(metric || 'metrik');
}

export function operatorWord(op) {
  return OPERATOR_WORDS[op] || String(op || '');
}

export function formatRuleValue(metric, value) {
  const v = Number(value);
  const unit = METRICS[metric]?.unit;
  if (unit === 'currency') return Number.isFinite(v) ? fmtRp(v) : String(value ?? '');
  if (unit === '%') return `${value ?? ''}%`;
  if (unit === 'x') return `${value ?? ''}x`;
  return String(value ?? '');
}

export function actionWord(type) {
  return ACTION_WORDS[type] || String(type || 'aksi');
}

/**
 * Kalimat kondisi: "Belanja lebih dari Rp 10.000".
 * Group: gabung dengan "dan"/"atau". Tak dikenal/kosong → fallback jujur
 * (bukan string kosong yang bikin baris "→ pause" tanpa sebab).
 */
export function describeRuleCondition(condition) {
  if (!condition || typeof condition !== 'object') return 'kondisi khusus';
  if (condition.type === 'leaf') {
    if (!condition.metric) return 'kondisi khusus';
    return `${metricLabel(condition.metric)} ${operatorWord(condition.operator)} ${formatRuleValue(condition.metric, condition.value)}`.trim();
  }
  if (condition.type === 'group') {
    const kids = (condition.children || []).map(describeRuleCondition).filter(Boolean);
    if (!kids.length) return 'kondisi khusus';
    const joiner = String(condition.logic || 'and').toLowerCase() === 'or' ? ' atau ' : ' dan ';
    return kids.join(joiner);
  }
  if (Array.isArray(condition.all) || Array.isArray(condition.any)) {
    const list = condition.all || condition.any;
    const joiner = Array.isArray(condition.any) ? ' atau ' : ' dan ';
    const kids = list.map(describeRuleCondition).filter((s) => s && s !== 'kondisi khusus');
    return kids.length ? kids.join(joiner) : 'kondisi gabungan';
  }
  if (condition.metric) {
    const threshold = condition.value !== undefined ? condition.value : condition.threshold;
    return `${metricLabel(condition.metric)} ${operatorWord(condition.operator)} ${formatRuleValue(condition.metric, threshold)}`.trim();
  }
  return 'kondisi khusus';
}

/** Nama rule otomatis: "Belanja lebih dari Rp 10.000". */
export function ruleAutoName(metric, operator, value) {
  return `${metricLabel(metric)} ${operatorWord(operator)} ${formatRuleValue(metric, value)}`.trim();
}

// ── Automated Rules NATIVE Facebook (read-only) ──────────────────
// evaluation_spec FB: { evaluation_type, filters: [{ field, operator, value }] }
// execution_spec FB: { execution_type, execution_options: [...] }
const FB_FIELD_LABELS = {
  spend: 'Belanja', impressions: 'Impresi', clicks: 'Klik', reach: 'Reach',
  frequency: 'Frekuensi', conversions: 'Konversi', ctr: 'CTR', cvr: 'CVR',
  cpc: 'CPC', cpm: 'CPM', cpa: 'CPA', roas: 'ROAS', roi: 'ROI',
  clicks_to_website: 'Klik link', daily_budget: 'Budget harian',
  lifetime_budget: 'Budget total', adset_budget: 'Budget ad set',
};

const FB_OPERATOR_WORDS = {
  GREATER_THAN: 'lebih dari', LESS_THAN: 'kurang dari',
  GREATER_THAN_OR_EQUAL_TO: 'minimal', LESS_THAN_OR_EQUAL_TO: 'maksimal',
  EQUAL: 'pas', NOT_EQUAL: 'bukan',
  GREATER_THAN_OR_EQUAL: 'minimal', LESS_THAN_OR_EQUAL: 'maksimal',
};

const FB_EXECUTION_WORDS = {
  PAUSE: 'dimatiin', UNPAUSE: 'dinyalain', RESUME: 'dinyalain',
  CHANGE_BUDGET: 'budget diubah', CHANGE_BID: 'bid diubah',
  ROTATE: 'dirotasi', NOTIFICATION: 'kasih kabar',
  ADD_INTERESTS: 'minat ditambah', INCREASE_BUDGET: 'budget dinaikin',
  DECREASE_BUDGET: 'budget diturunin',
};

function fbFilterWord(f) {
  if (!f || typeof f !== 'object') return null;
  const field = String(f.field || '').toLowerCase();
  const label = FB_FIELD_LABELS[field] || FB_FIELD_LABELS[field.replace(/^campaign\./, '')] || field || 'metrik';
  const op = FB_OPERATOR_WORDS[String(f.operator || '').toUpperCase()] || String(f.operator || '');
  const val = f.value;
  const shown = /belanja|budget|cpc|cpm|cpa/i.test(label) && Number.isFinite(Number(val))
    ? `Rp ${Number(val).toLocaleString('id-ID')}`
    : /ctr|cvr|roi|frekuensi/i.test(label) ? `${val ?? ''}%`
    : /^roas$/i.test(label) ? `${val ?? ''}x`
    : String(val ?? '');
  return `${label} ${op} ${shown}`.trim();
}

/**
 * Ringkas satu native FB rule jadi kalimat + status:
 * "Belanja lebih dari Rp 100.000 → dimatiin (aktif di Facebook)".
 * Defensif: field tak dikenal tetap tampil mentah, tidak pernah kosong.
 */
export function describeFbRule(rule) {
  if (!rule || typeof rule !== 'object') return { text: 'aturan Facebook', active: false };
  const evalSpec = rule.evaluationSpec || rule.evaluation_spec || {};
  const execSpec = rule.executionSpec || rule.execution_spec || {};
  const filters = Array.isArray(evalSpec.filters) ? evalSpec.filters : [];
  const cond = filters.map(fbFilterWord).filter(Boolean).join(' dan ') || 'kondisi khusus';
  const execType = String(execSpec.execution_type || execSpec.executionType || '').toUpperCase();
  const act = FB_EXECUTION_WORDS[execType] || (execType ? execType.toLowerCase() : 'aksi');
  const active = String(rule.status || '').toLowerCase().includes('active') ||
    String(rule.status || '').toLowerCase().includes('enabled');
  return { text: `${cond} → ${act}`, active };
}
