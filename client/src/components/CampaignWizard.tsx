import { useState } from 'react';
import { Loader2, Check, ArrowLeft, ArrowRight, Rocket, Link2, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api';
import type { CSSProperties } from 'react';

interface Account { id: string; name: string; status: string }
interface Page { id: string; name: string }

const OBJECTIVES = [
  { id: 'OUTCOME_TRAFFIC', label: 'Traffic', desc: 'Kunjungi landing page', emoji: '🚦' },
  { id: 'OUTCOME_SALES', label: 'Sales', desc: 'Pembelian / konversi', emoji: '🛒' },
  { id: 'OUTCOME_LEADS', label: 'Leads', desc: 'Data prospek', emoji: '📋' },
  { id: 'OUTCOME_ENGAGEMENT', label: 'Engagement', desc: 'Interaksi konten', emoji: '💬' },
];

const inputStyle: CSSProperties = {
  width: '100%', padding: '10px 14px', background: 'var(--bg-surface)',
  border: '1px solid var(--border-strong)', borderRadius: 6,
  color: 'var(--text-primary)', fontFamily: 'var(--font)', fontSize: '0.85rem', outline: 'none',
};
const labelStyle: CSSProperties = { display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 };
const btnStyle: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px',
  background: 'var(--accent)', color: 'var(--bg-deep)', border: 'none',
  borderRadius: 6, fontFamily: 'var(--font)', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
};

export function CampaignWizard({ onDone, onClose }: { onDone: (_campaignId: string) => void; onClose: () => void }) {
  const [step, setStep] = useState(1);
  const [objective, setObjective] = useState('');
  const [accountId, setAccountId] = useState('');
  const [pageId, setPageId] = useState('');
  const [product, setProduct] = useState('');
  const [target, setTarget] = useState('');
  const [keunggulan, setKeunggulan] = useState('');
  const [dailyBudget, setDailyBudget] = useState('');
  const [landingUrl, setLandingUrl] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [connectToken, setConnectToken] = useState('');
  const [showManualConnect, setShowManualConnect] = useState(false);
  const [creativeStatus, setCreativeStatus] = useState<'complete' | 'partial'>('complete');

  const queryClient = useQueryClient();
  const connectMutation = useMutation({
    mutationFn: (token: string) =>
      api.post<{ data: { ad_accounts_count?: number } }>('/settings/accounts/connect-token', {
        platform: 'meta',
        access_token: token,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wizard-accounts'] });
      setConnectToken('');
    },
  });

  const accountsQuery = useQuery({
    queryKey: ['wizard-accounts'],
    queryFn: () => api.get<Account[]>('/campaigns/accounts'),
  });
  const pagesQuery = useQuery({
    queryKey: ['wizard-pages'],
    queryFn: () => api.get<Page[]>('/campaigns/pages'),
    enabled: step >= 2,
  });
  const accountList: Account[] = Array.isArray(accountsQuery.data) ? accountsQuery.data : [];
  const pageList: Page[] = Array.isArray(pagesQuery.data) ? pagesQuery.data : [];
  const pagesLoading = pagesQuery.isLoading;

  const canNext1 = Boolean(objective && accountId && Number(dailyBudget) >= 10000);

  async function handleCreate() {
    setCreating(true); setError('');
    try {
      const res = await api.post<{ campaignId?: string; data?: { campaignId?: string; status?: string; message?: string; steps?: Array<{ step: string; status: string; error?: string }> } }>('/campaigns/create', {
        accountId, pageId, product, target, keunggulan,
        objective, dailyBudget: Number(dailyBudget), landingUrl,
      });
      const data = res?.data || res;
      const creativeFailed = data?.steps?.some(s => s.step === 'create_creative' && s.status === 'failed');
      const adSkipped = data?.steps?.some(s => s.step === 'create_ad' && s.status === 'skipped');
      const campaignId = data?.campaignId;

      if (data?.status === 'created') {
        setStep(4);
        // Store creative status for step 4 display
        if (creativeFailed || adSkipped) {
          setCreativeStatus('partial');
        } else {
          setCreativeStatus('complete');
        }
        onDone(campaignId || '');
      } else {
        setError(data?.error || 'Failed to create campaign');
        setCreating(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create campaign');
      setCreating(false);
    }
  }

  const stepTitles: Record<number, string> = { 1: 'Tujuan & Budget', 2: 'Produk & Kreatif', 3: 'Review', 4: 'Selesai' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', borderRadius: 14, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', padding: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 700 }}>Campaign Baru</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-tertiary)', fontSize: '1rem', cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 18, alignItems: 'center' }}>
          {[1, 2, 3].map(s => (
            <div key={s} style={{ flex: 1, height: 4, borderRadius: 99, background: s <= step ? 'var(--accent)' : 'var(--border)' }} />
          ))}
          <span style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', marginLeft: 8 }}>{stepTitles[step]}</span>
        </div>

        {error && <div role="alert" style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', color: '#ef4444', padding: '10px 14px', borderRadius: 6, fontSize: '0.8rem', marginBottom: 14 }}>{error}</div>}

        {step === 1 && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 14 }}>
              {OBJECTIVES.map(o => (
                <button key={o.id} type="button" onClick={() => setObjective(o.id)}
                  style={{ textAlign: 'left', padding: 12, borderRadius: 10, border: `1px solid ${objective === o.id ? 'var(--accent)' : 'var(--border)'}`, background: objective === o.id ? 'rgba(99,102,241,0.08)' : 'var(--bg-surface)', cursor: 'pointer' }}>
                  <div style={{ fontSize: '1.1rem' }}>{o.emoji}</div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, marginTop: 4 }}>{o.label}</div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)' }}>{o.desc}</div>
                </button>
              ))}
            </div>
            {accountList.length === 0 && !accountsQuery.isLoading ? (
              <div style={{ marginBottom: 12 }}>
                <p style={{ color: '#ef4444', fontSize: '0.8rem', marginBottom: 10 }}>
                  Tidak ada ad account Meta terhubung.
                </p>

                {!showManualConnect ? (
                  <div style={{ textAlign: 'center', padding: '8px 0' }}>
                    <a
                      href="#"
                      onClick={async (e) => {
                        e.preventDefault();
                        try {
                          const res = await api.get<{ data: { fb_url: string } }>('/auth/facebook/login');
                          const fbUrl = res?.data?.fb_url;
                          if (fbUrl) {
                            // Navigate directly — popup is blocked by browsers
                            window.location.href = fbUrl;
                          }
                        } catch {
                          setShowManualConnect(true);
                        }
                      }}
                      style={{ ...btnStyle, width: '100%', justifyContent: 'center', textDecoration: 'none' }}
                    >
                      <Link2 size={15} /> Hubungkan via Facebook
                    </a>
                    <p style={{ fontSize: '0.62rem', color: 'var(--text-tertiary)', marginTop: 8 }}>
                      Kamu akan diarahkan ke Facebook untuk mengizinkan AdForge.
                    </p>
                    <button
                      onClick={() => setShowManualConnect(true)}
                      style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '0.68rem', cursor: 'pointer', marginTop: 6 }}
                    >
                      Atau paste token manual
                    </button>
                  </div>
                ) : (
                  /* Manual token paste fallback */
                  <div>
                    <label style={labelStyle}>Meta Access Token</label>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        type="password"
                        placeholder="EAA... (token akses Meta)"
                        value={connectToken}
                        onChange={e => setConnectToken(e.target.value)}
                        style={{ ...inputStyle, flex: 1 }}
                      />
                      <button
                        type="button"
                        onClick={() => connectMutation.mutate(connectToken)}
                        disabled={!connectToken || connectMutation.isPending}
                        style={{ ...btnStyle, opacity: !connectToken || connectMutation.isPending ? 0.5 : 1, whiteSpace: 'nowrap' }}
                      >
                        {connectMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}
                        {connectMutation.isPending ? 'Menghubungkan…' : 'Hubungkan'}
                      </button>
                    </div>
                    {connectMutation.isError && (
                      <p style={{ color: '#ef4444', fontSize: '0.72rem', marginTop: 6 }}>
                        Gagal: {connectMutation.error instanceof Error ? connectMutation.error.message : 'Token tidak valid'}
                      </p>
                    )}
                    {connectMutation.isSuccess && (
                      <p style={{ color: 'var(--green)', fontSize: '0.72rem', marginTop: 6 }}>
                        ✅ Terhubung! Memuat ad account…
                      </p>
                    )}
                    <p style={{ fontSize: '0.62rem', color: 'var(--text-tertiary)', marginTop: 6 }}>
                      Dapatkan token dari{' '}
                      <a href="https://developers.facebook.com/tools/explorer" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
                        Graph API Explorer
 </a>{' '}
                      dengan izin <code>ads_management</code>, <code>pages_show_list</code>.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <>
                <label style={labelStyle}>Ad Account</label>
                <select value={accountId} onChange={e => setAccountId(e.target.value)} style={{ ...inputStyle, marginBottom: 12 }}>
                  <option value="">— pilih akun —</option>
                  {accountList.map(a => <option key={a.id} value={a.id}>{a.name} ({a.id})</option>)}
                </select>
              </>
            )}

            <label style={labelStyle}>Budget harian (Rp, min 10.000)</label>
            <input type="number" min={10000} value={dailyBudget} onChange={e => setDailyBudget(e.target.value)} placeholder="50000" style={{ ...inputStyle, marginBottom: 4 }} />
            <p style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)' }}>≈ Rp {Number(dailyBudget || 0).toLocaleString('id-ID')} / hari · status awal JEDA</p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
              <button onClick={() => setStep(2)} disabled={!canNext1}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, ...btnStyle, opacity: !canNext1 ? 0.5 : 1 }}>
                Lanjut <ArrowRight size={13} />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            {pagesLoading ? (
              <p style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginBottom: 12 }}>Loading pages…</p>
            ) : pageList.length === 0 ? (
              <p style={{ color: '#fb923c', fontSize: '0.72rem', marginBottom: 12 }}>⚠️ Token belum punya Facebook Page — kreatif butuh Page. Hubungkan Page dulu di Business Manager.</p>
            ) : (
              <>
                <label style={labelStyle}>Facebook Page (untuk kreatif)</label>
                <select value={pageId} onChange={e => setPageId(e.target.value)} style={{ ...inputStyle, marginBottom: 12 }}>
                  <option value="">— pilih page —</option>
                  {pageList.map(pg => <option key={pg.id} value={pg.id}>{pg.name}</option>)}
                </select>
              </>
            )}
            <label style={labelStyle}>Nama produk</label>
            <input value={product} onChange={e => setProduct(e.target.value)} placeholder="mis. Hijab Voal Premium" style={{ ...inputStyle, marginBottom: 12 }} />
            <label style={labelStyle}>Target audiens</label>
            <input value={target} onChange={e => setTarget(e.target.value)} placeholder="mis. wanita 20-35, Muslimah, peduli fashion" style={{ ...inputStyle, marginBottom: 12 }} />
            <label style={labelStyle}>Keunggulan produk</label>
            <input value={keunggulan} onChange={e => setKeunggulan(e.target.value)} placeholder="mis. bahan adem, tidak menerawang, gratis ongkir" style={{ ...inputStyle, marginBottom: 12 }} />
            <label style={labelStyle}>URL landing page</label>
            <input value={landingUrl} onChange={e => setLandingUrl(e.target.value)} placeholder="https://toko.com/produk" style={{ ...inputStyle }} />
            <p style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', margin: '10px 0 16px' }}>✨ AI akan menulis copy iklan dari informasi di atas.</p>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button onClick={() => setStep(1)} style={{ ...btnStyle, background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <ArrowLeft size={13} /> Kembali
              </button>
              <button onClick={() => setStep(3)} disabled={!product || !landingUrl.startsWith('http')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, ...btnStyle, opacity: !product || !landingUrl.startsWith('http') ? 0.5 : 1 }}>
                Review <ArrowRight size={13} />
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <ReviewRow label="Objective" value={OBJECTIVES.find(o => o.id === objective)?.label || objective} />
            <ReviewRow label="Account" value={accountList.find(a => a.id === accountId)?.name || accountId} />
            <ReviewRow label="Page" value={pageList.find(p => p.id === pageId)?.name || pageId} />
            <ReviewRow label="Budget harian" value={`Rp ${Number(dailyBudget).toLocaleString('id-ID')}`} />
            <ReviewRow label="Produk" value={product} />
            <ReviewRow label="Target" value={target || '—'} />
            <ReviewRow label="Landing page" value={landingUrl} />
            <ReviewRow label="Status awal" value="⏸ JEDA — aktifkan setelah dicek" />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18 }}>
              <button onClick={() => setStep(2)} disabled={creating} style={{ ...btnStyle, background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <ArrowLeft size={13} /> Kembali
              </button>
              <button onClick={handleCreate} disabled={creating}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, ...btnStyle }}>
                {creating ? <Loader2 size={13} className="animate-spin" /> : <Rocket size={13} />}
                {creating ? 'Membuat…' : 'Buat Campaign'}
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div style={{ textAlign: 'center', padding: 16 }}>
            {creativeStatus === 'partial' ? (
              <>
                <AlertTriangle size={40} color="#fb923c" />
                <h3 style={{ margin: '12px 0 6px', fontSize: '1rem' }}>Campaign dibuat — kreatif tertunda</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginBottom: 10 }}>
                  ✅ Campaign + Ad Set berhasil dibuat (PAUSED).
                </p>
                <p style={{ color: '#fb923c', fontSize: '0.78rem', marginBottom: 10 }}>
                  ⚠️ Kreatif gagal dibuat otomatis — Meta App masih dalam proses review. <br/>
                  Anda bisa menambahkan kreatif secara manual dari Creative Library.
                </p>
                <p style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', marginBottom: 16 }}>
                  🚀 Fitur pembuatan kreatif otomatis akan segera hadir setelah App Review selesai.
                </p>
              </>
            ) : (
              <>
                <Check size={40} color="var(--green)" />
                <h3 style={{ margin: '12px 0 6px', fontSize: '1rem' }}>Campaign dibuat!</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginBottom: 10 }}>
                  Status: JEDA (PAUSED). Buka daftar campaign untuk mengaktifkan.
                </p>
                <p style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', marginBottom: 16 }}>
                  Semua kreatif berhasil dibuat otomatis.
                </p>
              </>
            )}
            <button onClick={() => onDone('')} style={{ ...btnStyle, width: '100%', justifyContent: 'center' }}>Lihat Daftar Campaign</button>
          </div>
        )}
      </div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: '0.78rem', gap: 12 }}>
      <span style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}>{label}</span>
      <span style={{ fontWeight: 600, maxWidth: '60%', textAlign: 'right', wordBreak: 'break-word' }}>{value}</span>
    </div>
  );
}
