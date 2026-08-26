/**
 * AccountReportService — detailed per-ad-account performance report with
 * AI-generated recommendations (SWOT style).
 *
 * Data window semantics (matches the operator's reference report):
 *  - today      : spend since midnight up to report time
 *  - yesterday  : FULL previous day, plus same-window comparison is approximated
 *                 by Meta's date preset (yesterday = full day)
 *  - avg 7d     : last_7d totals ÷ 7
 */
import { createLogger } from '../lib/logger.js';

const log = createLogger('account-report');

const num = (v) => {
  const n = parseFloat(v || 0);
  return Number.isFinite(n) ? n : 0;
};

function derive(ins) {
  const spend = num(ins?.spend);
  const purchases = num(ins?.conversions);
  const revenue = num(ins?.revenue);
  return {
    spend,
    impressions: Math.round(num(ins?.impressions)),
    reach: Math.round(num(ins?.reach)),
    linkClicks: num(ins?.linkClicks),
    clicks: num(ins?.clicks),
    ctr: num(ins?.ctr),
    cpc: num(ins?.cpc),
    purchases,
    cpr: purchases > 0 ? spend / purchases : null,
    revenue,
    roas: spend > 0 ? revenue / spend : null,
  };
}

export class AccountReportService {
  constructor({ llmClient } = {}) {
    this.llmClient = llmClient || null;
  }

  async buildReport(metaApi, accountId, accountName = accountId, { sinceDate = null, attributionWindows = null } = {}) {
    const awOpts = attributionWindows ? { attributionWindows } : {};
    const windows = [
      metaApi.getAccountInsights(accountId, { datePreset: 'today', ...awOpts }).catch(() => null),
      metaApi.getAccountInsights(accountId, { datePreset: 'yesterday', ...awOpts }).catch(() => null),
      metaApi.getAccountInsights(accountId, { datePreset: 'last_7d', ...awOpts }).catch(() => null),
    ];
    // "Since last report" — Meta custom time_range from the stored report date to today
    let sinceInsightsPromise = Promise.resolve(null);
    if (sinceDate) {
      const since = new Date(sinceDate);
      const until = new Date();
      const fmt = (d) => d.toISOString().slice(0, 10);
      sinceInsightsPromise = metaApi.getAccountInsights(accountId, {
        timeRange: { since: fmt(since), until: fmt(until) },
      }).catch(() => null);
    }
    const [today, yesterday, week, sinceRaw] = await Promise.all([...windows, sinceInsightsPromise]);

    const summary = derive(today);
    const sinceLast = derive(sinceRaw);
    const y = derive(yesterday);
    const w = derive(week);
    const comparison = {
      yesterdayFullDay: { ...y },
      avg7d: {
        spend: w.spend / 7,
        purchases: w.purchases / 7,
        cpr: w.purchases > 0 ? w.spend / w.purchases : null,
        roas: w.spend > 0 ? w.revenue / w.spend : null,
      },
    };

    const ai = await this.generateRecommendations({ accountName, summary, comparison });

    return {
      accountId: String(accountId).replace(/^act_/, ''),
      accountName,
      generatedAt: new Date().toISOString(),
      windows: { today: 'since midnight', yesterday: 'full day', avg7d: 'last 7 days / 7', ...(sinceDate ? { sinceLast: `since ${sinceDate}` } : {}) },
      summary,
      comparison,
      ...(attributionWindows ? { attributionWindows } : {}),
      ...(sinceDate ? { sinceLastReport: sinceLast } : {}),
      anomalies: detectAnomalies({ summary, comparison }),
      ai,
    };
  }

  async generateRecommendations({ accountName, summary, comparison }) {
    const fallback = deterministicRecommendations(summary, comparison);
    if (!this.llmClient) return { source: 'rules', ...fallback };

    try {
      const system =
        'You are a senior Meta Ads performance analyst. Respond ONLY with compact JSON: ' +
        '{"strengths":"...","weaknesses":"...","opportunities":"...","actions":"...","risk":"..."}. ' +
        'Each value is 1-2 sentences in Indonesian, concrete and numeric where possible.';
      const user =
        `Akun: ${accountName}\n` +
        `Hari ini: ${JSON.stringify(summary)}\n` +
        `Kemarin (fullday): ${JSON.stringify(comparison.yesterdayFullDay)}\n` +
        `Rata-rata 7 hari: ${JSON.stringify(comparison.avg7d)}\n` +
        'Beri analisis SWOT singkat untuk akun iklan ini.';
      const raw = await this.llmClient.call(system, user, { maxTokens: 700 });
      const match = String(raw || '').match(/\{[\s\S]*\}/);
      if (!match) throw new Error('no JSON in LLM output');
      const parsed = JSON.parse(match[0]);
      const pick = (k) => String(parsed[k] || fallback[k]);
      return {
        source: 'ai',
        strengths: pick('strengths'),
        weaknesses: pick('weaknesses'),
        opportunities: pick('opportunities'),
        actions: pick('actions'),
        risk: pick('risk'),
      };
    } catch (err) {
      log.warn('AI recommendation failed, using rules fallback', { error: err.message });
      return { source: 'rules', ...fallback };
    }
  }
}

/**
 * Anomaly detection shared by the web banner, bot push alerts and the daily
 * digest. Returns Indonesian-language anomaly descriptions; empty = healthy.
 */
export function detectAnomalies(report) {
  const out = [];
  const s = report.summary;
  const w = report.comparison.avg7d;
  if (s.spend > 0 && w.spend > 0 && s.spend > w.spend * 3) {
    out.push(`Spend hari ini ${fmtIDR2(s.spend)} — ${Math.round((s.spend / w.spend - 1) * 100)}% di atas rata-rata 7 hari. Verifikasi ini bukan salah konfigurasi budget.`);
  }
  if (s.roas !== null && s.roas !== undefined && w.roas !== null && w.roas !== undefined && w.roas >= 1 && s.roas < w.roas * 0.5 && s.spend > 0) {
    out.push(`ROAS ${Number(s.roas).toFixed(2)}x jatuh lebih dari 50% di bawah rata-rata 7 hari (${Number(w.roas).toFixed(2)}x).`);
  }
  if (s.purchases === 0 && s.spend > 0 && w.spend > 0 && s.spend > w.spend * 0.5) {
    out.push('Belum ada purchase meski spend sudah berjalan — pantau pixel/CAPI dan jangan scale.');
  }
  return out;
}

function fmtIDR2(n) {
  return `Rp ${Number(n || 0).toLocaleString('id-ID')}`;
}

/** Deterministic analyst — always available, no external dependency. */
export function deterministicRecommendations(summary, comparison) {
  const roas = summary.roas ?? 0;
  const yRoas = comparison.yesterdayFullDay.roas ?? null;
  const avgRoas = comparison.avg7d.roas ?? null;
  const strengths = [];
  const weaknesses = [];
  const opportunities = [];
  const actions = [];
  const risk = [];

  if (roas >= 2) strengths.push(`ROAS hari ini sehat (${roas.toFixed(2)}x) — skala terkendali.`);
  else if (roas >= 1) strengths.push(`ROAS positif (${roas.toFixed(2)}x), masih di atas break-even ringan.`);
  else if (summary.spend > 0) weaknesses.push(`ROAS hanya ${roas.toFixed(2)}x — belanja iklan belum kembali.`);

  if (summary.ctr >= 1.5) strengths.push(`CTR ${summary.ctr.toFixed(2)}% menandakan creative masih relevan.`);
  else if (summary.clicks > 0) weaknesses.push(`CTR rendah (${summary.ctr.toFixed(2)}%) — uji hook/visual baru.`);

  if (yRoas !== null && yRoas !== undefined && roas > yRoas && yRoas > 0) strengths.push(`Performa naik vs kemarin penuh (${yRoas.toFixed(2)}x → ${roas.toFixed(2)}x).`);
  if (yRoas !== null && yRoas !== undefined && roas < yRoas * 0.8 && yRoas > 0) weaknesses.push(`ROAS turun tajam dari kemarin (${yRoas.toFixed(2)}x → ${roas.toFixed(2)}x).`);
  if (avgRoas !== null && avgRoas !== undefined && avgRoas > 1.2 && roas < avgRoas) opportunities.push(`Rata-rata 7 hari ${avgRoas.toFixed(2)}x lebih tinggi dari hari ini — ada ruang pulih ke baseline.`);

  if (roas < 1 && summary.spend > 0) actions.push('Turunkan budget campaign dengan ROAS < 1x atau pause sementara sampai creative diperbarui.');
  if (roas >= 1.5) actions.push('Naikkan budget bertahap (+20-30%) pada campaign dengan ROAS tertinggi.');
  if (summary.cpc > 0 && avgRoas !== null && avgRoas !== undefined) actions.push('Pantau CPC dan frekuensi; segarkan audiens jika CPA naik 2 hari berturut.');
  if (!actions.length) actions.push('Data masih tipis — kumpulkan minimal 50 klik/konversi sebelum mengambil keputusan besar.');

  risk.push('Analisis berbasis data hari ini yang belum lengkap (jam berjalan); jangan ambil keputusan permanen hanya dari snapshot ini.');
  if (summary.purchases === 0 && summary.spend > 0) risk.push('Belum ada purchase hari ini meski sudah ada spend — risiko burn budget tanpa konversi.');

  const or = (arr, fallback) => (arr.length ? arr.join(' ') : fallback);
  return {
    strengths: or(strengths, 'Belum ada sinyal kekuatan yang menonjol pada data hari ini.'),
    weaknesses: or(weaknesses, 'Tidak ada kelemahan signifikan yang terdeteksi hari ini.'),
    opportunities: or(opportunities, 'Belum ada peluang spesifik dari data saat ini — pantau terus.'),
    actions: actions.join(' '),
    risk: risk.join(' '),
  };
}
