import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, Minus, Sparkles, RefreshCw, AlertTriangle, Lightbulb, Wrench, ThumbsUp, ThumbsDown, Download, Clock } from 'lucide-react';
import { api } from '../lib/api';

interface Insights {
  spend: number;
  impressions: number;
  linkClicks: number;
  ctr: number;
  cpc: number;
  purchases: number;
  cpr: number | null;
  roas: number | null;
}
interface Report {
  accountId: string;
  accountName: string;
  summary: Insights;
  comparison: {
    yesterdayFullDay: Insights;
    avg7d: { spend: number; purchases: number; cpr: number | null; roas: number | null };
  };
  anomalies?: string[];
  ai: { source: string; strengths: string; weaknesses: string; opportunities: string; actions: string; risk: string };
}

interface AdAccount { id: string; name: string; status: string }

const fmtIDR = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n || 0);
const fmtNum = (n: number) => (n || 0).toLocaleString('id-ID');
const fmtRoas = (v: number | null) => (v === null ? '—' : `${v.toFixed(2)}x`);
const fmtCpr = (v: number | null) => (v === null ? '—' : fmtIDR(v));

function Delta({ value, base, invert }: { value: number | null; base: number | null; invert?: boolean }) {
  if (value === null || base === null || base === 0 || value === 0) return <span style={{ color: 'var(--text-tertiary)', fontSize: '0.68rem' }}><Minus size={10} /> no baseline</span>;
  const pct = ((value - base) / Math.abs(base)) * 100;
  const good = invert ? pct < 0 : pct > 0;
  const color = Math.abs(pct) < 5 ? 'var(--text-tertiary)' : good ? 'var(--green)' : 'var(--red)';
  const Icon = Math.abs(pct) < 5 ? Minus : pct > 0 ? TrendingUp : TrendingDown;
  return (
    <span style={{ color, fontSize: '0.68rem', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
      <Icon size={10} /> {pct > 0 ? '+' : ''}{pct.toFixed(0)}%
    </span>
  );
}

function MetricCard({ label, value, today, yesterday, avg7d, invert }: {
  label: string; value: string; today: number | null; yesterday: number | null; avg7d?: number | null; invert?: boolean;
}) {
  return (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-tertiary)' }}>{label}</div>
      <div style={{ fontSize: '1.25rem', fontWeight: 800, margin: '6px 0 8px' }}>{value}</div>
      <div style={{ display: 'flex', gap: 12 }}>
        <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>vs kemarin <Delta value={today} base={yesterday} invert={invert} /></span>
        <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>vs 7d avg <Delta value={today ?? null} base={avg7d ?? null} invert={invert} /></span>
      </div>
    </div>
  );
}

const AI_SECTIONS = [
  { key: 'strengths', icon: ThumbsUp, color: 'var(--green)', title: 'Kekuatan' },
  { key: 'weaknesses', icon: ThumbsDown, color: 'var(--red)', title: 'Kelemahan' },
  { key: 'opportunities', icon: Lightbulb, color: '#fbbf24', title: 'Peluang' },
  { key: 'actions', icon: Wrench, color: 'var(--accent)', title: 'Tindakan yang Disarankan' },
  { key: 'risk', icon: AlertTriangle, color: '#fb923c', title: 'Catatan Risiko' },
] as const;

interface HourRow {
  hour: number;
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  purchases: number;
  revenue: number;
  ctr: number;
  cpc: number | null;
  roas: number | null;
}

function deriveAnomalies(report: Report): string[] {
  const out: string[] = [];
  const s = report.summary;
  const w = report.comparison.avg7d;
  if (s.spend > 0 && w.spend > 0 && s.spend > w.spend * 3) {
    out.push(`Spend hari ini ${fmtIDR(s.spend)} — ${Math.round((s.spend / w.spend - 1) * 100)}% di atas rata-rata 7 hari. Verifikasi ini bukan salah konfigurasi budget.`);
  }
  if (s.roas !== null && w.roas !== null && w.roas >= 1 && s.roas < w.roas * 0.5 && s.spend > 0) {
    out.push(`ROAS ${s.roas.toFixed(2)}x jatuh lebih dari 50% di bawah rata-rata 7 hari (${w.roas.toFixed(2)}x).`);
  }
  if (s.purchases === 0 && s.spend > 0 && s.spend > w.spend * 0.5) {
    out.push('Belum ada purchase meski spend sudah berjalan — pantau pixel/CAPI dan jangan scale.');
  }
  return out;
}

function downloadCsv(report: Report) {
  const rows: string[] = [];
  const esc = (v: unknown) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const join = (arr: string[]) => arr.map(esc).join(',');
  rows.push(join(['metric', 'today', 'yesterday_full_day', 'avg_7d']));
  const cmp = report.comparison;
  const y = cmp.yesterdayFullDay as unknown as Record<string, unknown>;
  const w = cmp.avg7d as unknown as Record<string, unknown>;
  for (const [k, s] of Object.entries(report.summary)) {
    rows.push(join([k, String(s), String(y[k] ?? ''), String(w[k] ?? '')]));
  }
  rows.push('');
  rows.push(join(['ai_source', report.ai.source]));
  for (const [k, v] of Object.entries(report.ai)) rows.push(join([k, String(v)]));
  const blob = new Blob(['\ufeff' + rows.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `adforge-report-${report.accountId}.csv`; a.click();
  URL.revokeObjectURL(url);
}

function HourHeatmap({ hours }: { hours: HourRow[] }) {
  if (!hours.length) {
    return <div style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem', padding: 8 }}>Tidak ada data per jam pada rentang ini.</div>;
  }
  const maxSpend = Math.max(...hours.map(h => h.spend), 0.0001);
  const best = [...hours].sort((a, b) => (b.roas ?? -1) - (a.roas ?? -1)).find(h => h.roas !== null && h.roas > 0);
  const worst = [...hours].filter(h => h.spend > 0).sort((a, b) => (a.roas ?? 99) - (b.roas ?? 99))[0];
  return (
    <div>
      {(best || worst) && (
        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0 0 12px' }}>
          {best && <>Jam terbaik: <strong style={{ color: 'var(--green)' }}>{String(best.hour).padStart(2, '0')}:00</strong> (ROAS {fmtRoas(best.roas)}). </>}
          {worst && <>Jam terlemah: <strong style={{ color: '#fb923c' }}>{String(worst.hour).padStart(2, '0')}:00</strong> (spend {fmtIDR(worst.spend)}, ROAS {fmtRoas(worst.roas)}).</>}
        </p>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 6 }}>
        {hours.map(h => {
          const intensity = h.spend / maxSpend;
          const roasColor = h.roas === null ? 'var(--text-tertiary)' : h.roas >= 2 ? 'var(--green)' : h.roas >= 1 ? '#fbbf24' : '#ef4444';
          return (
            <div key={h.hour} title={`Spend ${fmtIDR(h.spend)} · ROAS ${fmtRoas(h.roas)} · ${h.clicks} klik`}
              style={{
                background: `rgba(99,102,241,${0.08 + intensity * 0.55})`,
                border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px',
              }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-secondary)' }}>{String(h.hour).padStart(2, '0')}:00</div>
              <div style={{ fontSize: '0.72rem', fontWeight: 700 }}>{h.spend > 0 ? fmtIDR(h.spend) : '—'}</div>
              {h.spend > 0 && (
                <div style={{ fontSize: '0.62rem', color: roasColor }}>ROAS {fmtRoas(h.roas)}</div>
              )}
            </div>
          );
        })}
      </div>
      <p style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', margin: '10px 0 0' }}>
        Intensitas warna = besaran spend. Gunakan untuk dayparting: alihkan budget ke jam dengan ROAS tinggi via ad scheduling.
      </p>
    </div>
  );
}

export function AccountReportsPage() {
  const [accountId, setAccountId] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const { data: accounts, isLoading: accountsLoading } = useQuery({
    queryKey: ['ad-accounts'],
    queryFn: () => api.get<AdAccount[]>('/campaigns/accounts'),
  });
  const accountList = Array.isArray(accounts) ? accounts : [];
  const selected = accountId || String(accountList[0]?.id ?? '');

  const [attrWindow, setAttrWindow] = useState('');
  const { data: report, isLoading, error, isFetching } = useQuery({
    queryKey: ['account-report', selected, refreshKey, attrWindow],
    queryFn: () => api.get<Report>(`/reporting/accounts/${selected}/report${attrWindow ? `?aw=${attrWindow}` : ''}`),
    enabled: !!selected,
  });

  const [view, setView] = useState<'overview' | 'hours' | 'builder'>('overview');
  const [preset, setPreset] = useState('last_7d');
  const [builderMetrics, setBuilderMetrics] = useState<string[]>(['spend', 'roas', 'purchases']);
  const [builderWindows, setBuilderWindows] = useState<string[]>(['today', 'last_7d']);
  const [builderResult, setBuilderResult] = useState<Record<string, Record<string, number | null>> | null>(null);
  const [builderBusy, setBuilderBusy] = useState(false);
  const [builderError, setBuilderError] = useState('');

  const runBuilder = async () => {
    setBuilderBusy(true); setBuilderError('');
    try {
      const res = await api.post<{ results: Record<string, Record<string, number | null>> }>(`/reporting/accounts/${selected}/custom`, { metrics: builderMetrics, windows: builderWindows });
      setBuilderResult(res.results ?? null);
    } catch (e) { setBuilderError(e instanceof Error ? e.message : 'Failed'); }
    finally { setBuilderBusy(false); }
  };
  const downloadBuilderCsv = () => {
    if (!builderResult) return;
    const rows: string[] = [];
    const esc = (v: unknown) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    rows.push(['window', ...builderMetrics].map(esc).join(','));
    for (const [w, row] of Object.entries(builderResult)) {
      rows.push([w, ...builderMetrics.map(m => String(row[m] ?? ''))].map(esc).join(','));
    }
    const blob = new Blob(['\ufeff' + rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `adforge-custom-${selected}.csv`; a.click();
    URL.revokeObjectURL(url);
  };
  const { data: hourly, isLoading: hoursLoading } = useQuery({
    queryKey: ['account-hours', selected, preset, refreshKey],
    queryFn: () => api.get<{ accountId: string; hours: HourRow[] }>(`/reporting/accounts/${selected}/hourly?preset=${preset}`),
    enabled: !!selected && view === 'hours',
  });

  const sel = accountList.find(a => String(a.id) === selected);

  return (
    <div>
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Account Reports</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 4 }}>
            Detailed per-account performance with AI analysis. Read-only.
          </p>
        </div>
        <select
          value={selected}
          onChange={e => setAccountId(e.target.value)}
          style={{ padding: '9px 14px', background: 'var(--bg-surface)', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text-primary)', fontFamily: 'var(--font)', fontSize: '0.82rem', outline: 'none', minWidth: 220 }}
        >
          {accountsLoading && <option>Loading accounts…</option>}
          {!accountsLoading && !accountList.length && <option value="">No ad accounts connected</option>}
          {accountList.map(a => <option key={a.id} value={a.id}>{a.name} ({a.id})</option>)}
        </select>
        <select value={attrWindow} onChange={e => setAttrWindow(e.target.value)}
          title="Model atribusi Meta untuk angka konversi"
          style={{ padding: '9px 14px', background: 'var(--bg-surface)', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text-primary)', fontFamily: 'var(--font)', fontSize: '0.82rem', outline: 'none' }}>
          <option value="">Attribution: default</option>
          <option value="7d_click">7-day click</option>
          <option value="1d_view">1-day view</option>
          <option value="28d_click">28-day click</option>
        </select>
      </div>

      {!accountList.length && !accountsLoading && (
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, padding: 32, textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          Connect your Meta account in <a href="/settings" style={{ color: 'var(--accent)' }}>Settings</a> to see reports here.
        </div>
      )}

      {error && (
        <div role="alert" style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', color: 'var(--red)', padding: '12px 14px', borderRadius: 8, fontSize: '0.82rem' }}>
          {(error as Error).message}
        </div>
      )}

      {(isLoading || isFetching) && !report && selected && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: '0.85rem', padding: 32, justifyContent: 'center' }}>
          <RefreshCw size={14} className="animate-spin" /> Compiling report + asking the AI analyst…
        </div>
      )}

      {report && (
        <div style={{ display: 'grid', gap: 20 }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 700 }}>{sel?.name || report.accountName}</h2>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>act_{report.accountId} · hari ini sampai sekarang (WIB)</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => downloadCsv(report)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 6, border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '0.75rem', cursor: 'pointer' }}>
                <Download size={11} /> Export CSV
              </button>
              <button onClick={() => setRefreshKey(k => k + 1)} disabled={isFetching}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 6, border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '0.75rem', cursor: 'pointer' }}>
                <RefreshCw size={11} /> Refresh
              </button>
            </div>
          </div>

          {/* Metric grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <MetricCard label="Spend" value={fmtIDR(report.summary.spend)} today={report.summary.spend} yesterday={report.comparison.yesterdayFullDay.spend} avg7d={report.comparison.avg7d.spend} />
            <MetricCard label="Link Clicks" value={fmtNum(report.summary.linkClicks)} today={report.summary.linkClicks} yesterday={report.comparison.yesterdayFullDay.linkClicks} />
            <MetricCard label="CTR" value={`${report.summary.ctr.toFixed(2)}%`} today={report.summary.ctr} yesterday={report.comparison.yesterdayFullDay.ctr} />
            <MetricCard label="CPC" value={fmtIDR(report.summary.cpc)} today={report.summary.cpc} yesterday={report.comparison.yesterdayFullDay.cpc} avg7d={null} invert />
            <MetricCard label="Purchases" value={fmtNum(report.summary.purchases)} today={report.summary.purchases} yesterday={report.comparison.yesterdayFullDay.purchases} avg7d={report.comparison.avg7d.purchases} />
            <MetricCard label="CPR" value={fmtCpr(report.summary.cpr)} today={report.summary.cpr} yesterday={report.comparison.yesterdayFullDay.cpr} avg7d={report.comparison.avg7d.cpr} invert />
            <MetricCard label="ROAS" value={fmtRoas(report.summary.roas)} today={report.summary.roas} yesterday={report.comparison.yesterdayFullDay.roas} avg7d={report.comparison.avg7d.roas} />
          </div>

          {/* Budget pacing vs 7-day norm */}
          {(() => {
            const now = new Date(Date.now() + 7 * 3600 * 1000); // WIB
            const frac = Math.min(1, (now.getHours() * 60 + now.getMinutes()) / 1440) || 1/24;
            const expected = report.comparison.avg7d.spend * frac;
            const spent = report.summary.spend;
            if (expected <= 0 || report.comparison.avg7d.spend <= 0) return null;
            const ratio = spent / expected;
            const status = ratio >= 1.5 ? { c: '#ef4444', t: 'Overpace' } : ratio <= 0.6 ? { c: '#fbbf24', t: 'Underpace' } : { c: 'var(--green)', t: 'On pace' };
            const pct = Math.min(100, Math.round(ratio * 100));
            return (
              <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-tertiary)' }}>Pacing hari ini vs rata-rata 7 hari</span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: status.c }}>{status.t} ({pct}%)</span>
                </div>
                <div style={{ background: 'var(--bg-surface)', borderRadius: 99, height: 10, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.max(2, pct)}%`, height: '100%', borderRadius: 99, background: status.c, transition: 'width .4s' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>
                  <span>Terpakai: {fmtIDR(spent)}</span>
                  <span>Ekspektasi jam ini: {fmtIDR(expected)}</span>
                </div>
              </div>
            );
          })()}

          {/* Anomaly banner */}
          {(report.anomalies?.length ?? deriveAnomalies(report).length) > 0 && (
            <div style={{ background: 'rgba(251,146,60,0.08)', border: '1px solid rgba(251,146,60,0.35)', borderRadius: 12, padding: '14px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <AlertTriangle size={15} color="#fb923c" />
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#fb923c' }}>Anomali Terdeteksi</span>
              </div>
              {((report.anomalies?.length ? report.anomalies : deriveAnomalies(report))).map((a: string, i: number) => (
                <p key={i} style={{ margin: i ? '6px 0 0' : 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>• {a}</p>
              ))}
            </div>
          )}

          {/* View tabs */}
          <div style={{ display: 'flex', gap: 4, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 4, width: 'fit-content' }}>
            {(['overview', 'hours'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 16px', border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--font)', fontSize: '0.78rem', fontWeight: 700,
                  background: view === v ? 'var(--accent-soft)' : 'transparent', color: view === v ? 'var(--accent)' : 'var(--text-secondary)' }}>
                {v === 'overview' ? 'Overview' : v === 'hours' ? <>Jam (Dayparting)</> : <>Report Builder</>}
              </button>
            ))}
          </div>

          {/* Hours heatmap */}
          {view === 'hours' && (
            <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Clock size={14} color="var(--accent)" />
                  <h3 style={{ fontSize: '0.9rem', fontWeight: 700 }}>Performa per Jam</h3>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)' }}>(zona waktu akun · agregasi {preset === 'today' ? 'hari ini' : preset})</span>
                </div>
                <select value={preset} onChange={e => setPreset(e.target.value)}
                  style={{ padding: '5px 10px', background: 'var(--bg-surface)', border: '1px solid var(--border-strong)', borderRadius: 6, color: 'var(--text-primary)', fontSize: '0.72rem' }}>
                  {['today', 'yesterday', 'last_7d', 'last_14d', 'last_30d'].map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              {hoursLoading ? (
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', padding: 16 }}><RefreshCw size={12} className="animate-spin" /> Loading…</div>
              ) : (
                <HourHeatmap hours={(Array.isArray(hourly?.hours) ? hourly!.hours : []) as HourRow[]} />
              )}
            </div>
          )}

          {/* Report Builder */}
          {view === 'builder' && (
            <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 12 }}>Custom Report Builder</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 6 }}>Metrics</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {['spend','impressions','clicks','linkClicks','ctr','cpc','purchases','cpr','revenue','roas'].map(m => {
                      const on = builderMetrics.includes(m);
                      return (
                        <button key={m} onClick={() => setBuilderMetrics(ms => on ? ms.filter(x => x !== m) : [...ms, m])}
                          style={{ padding: '4px 10px', borderRadius: 99, border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, background: on ? 'var(--accent-soft)' : 'transparent', color: on ? 'var(--accent)' : 'var(--text-tertiary)', fontSize: '0.7rem', cursor: 'pointer', fontFamily: 'var(--font)' }}>
                          {m}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 6 }}>Windows</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {['today','yesterday','last_7d','last_14d','last_30d'].map(w => {
                      const on = builderWindows.includes(w);
                      return (
                        <button key={w} onClick={() => setBuilderWindows(ws => on ? ws.filter(x => x !== w) : [...ws, w])}
                          style={{ padding: '4px 10px', borderRadius: 99, border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, background: on ? 'var(--accent-soft)' : 'transparent', color: on ? 'var(--accent)' : 'var(--text-tertiary)', fontSize: '0.7rem', cursor: 'pointer', fontFamily: 'var(--font)' }}>
                          {w}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              <button onClick={() => runBuilder()} disabled={builderBusy || !builderMetrics.length || !builderWindows.length}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 6, border: 'none', background: 'var(--accent)', color: 'var(--bg-deep)', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
                {builderBusy ? 'Generating…' : 'Generate Report'}
              </button>
              {builderError && <p style={{ color: '#ef4444', fontSize: '0.78rem', marginTop: 10 }}>{builderError}</p>}
              {builderResult && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>Result</span>
                    <button onClick={downloadBuilderCsv}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '0.72rem', cursor: 'pointer' }}>
                      <Download size={11} /> Download CSV
                    </button>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                    <thead><tr>{['Window', ...builderMetrics].map(h => <th key={h} style={{ textAlign: 'left', padding: '7px 10px', borderBottom: '1px solid var(--border)', color: 'var(--text-tertiary)' }}>{h}</th>)}</tr></thead>
                    <tbody>
                      {Object.entries(builderResult).map(([w, row]) => (
                        <tr key={w}>
                          <td style={{ padding: '7px 10px', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>{w}</td>
                          {builderMetrics.map(m => <td key={m} style={{ padding: '7px 10px', borderBottom: '1px solid var(--border)' }}>{row[m] === null || row[m] === undefined ? '—' : String(row[m])}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* AI panel */}
          <div style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(99,102,241,0.02))', border: '1px solid var(--accent)', borderRadius: 14, padding: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Sparkles size={16} color="var(--accent)" />
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700 }}>Analisis & Rekomendasi AI</h3>
              <span style={{ fontSize: '0.62rem', padding: '2px 8px', borderRadius: 99, background: 'var(--accent-soft)', color: 'var(--accent)', fontWeight: 700, textTransform: 'uppercase' }}>
                {report.ai.source === 'ai' ? 'AI Generated' : 'Rules Engine'}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
              {AI_SECTIONS.map(({ key, icon: Icon, color, title }) => (
                <div key={key} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <Icon size={13} color={color} />
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color }}>{title}</span>
                  </div>
                  <p style={{ fontSize: '0.78rem', lineHeight: 1.55, color: 'var(--text-secondary)', margin: 0 }}>{report.ai[key]}</p>
                </div>
              ))}
            </div>
          </div>

          <p style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>
            Read-only · Tidak ada iklan yang diubah · Data hari ini belum lengkap (jam berjalan).
          </p>
        </div>
      )}
    </div>
  );
}
