import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Tag, BarChart3, Download } from 'lucide-react';
import { api } from '../lib/api';

interface Creative {
  id: string;
  hook: string;
  body: string;
  cta: string;
  tags: string[];
  type: string;
  created_at: string;
}

interface CreativePerf {
  id: string;
  name: string;
  accountName: string;
  status: string;
  spend: number;
  revenue: number;
  roas: number | null;
  ctr: number;
  cpc: number;
  linkClicks: number;
  purchases: number;
}

export function CreativeLibraryPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ hook: '', body: '', cta: '', type: 'image', tags: '' });

  const { data, isLoading, error } = useQuery({
    queryKey: ['creative-library'],
    queryFn: () => api.get<Creative[]>('/creative/library'),
  });

  const createMut = useMutation({
    mutationFn: (payload: { hook: string; body: string; cta: string; type: string; tags: string[] }) =>
      api.post('/creative/library', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creative-library'] });
      setForm({ hook: '', body: '', cta: '', type: 'image', tags: '' });
      setShowForm(false);
    },
  });

  const creatives: Creative[] = Array.isArray(data) ? data : [];
  const filtered = filter
    ? creatives.filter(c => c.type === filter || c.tags?.some(t => t.toLowerCase().includes(filter.toLowerCase())))
    : creatives;

  const types = [...new Set(creatives.map(c => c.type).filter(Boolean))];

  const [tab, setTab] = useState<'library' | 'performance'>('library');
  const perfQuery = useQuery({
    queryKey: ['creative-performance'],
    queryFn: () => api.get<CreativePerf[]>('/campaigns/performance'),
    enabled: tab === 'performance',
  });
  const perfList = Array.isArray(perfQuery.data) ? perfQuery.data : [];

  const _tabsUi = (
    <div style={{ display: 'flex', gap: 4, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 4, width: 'fit-content' }}>
      {(['library', 'performance'] as const).map(v => (
        <button key={v} onClick={() => setTab(v)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 16px', border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--font)', fontSize: '0.78rem', fontWeight: 700,
            background: tab === v ? 'var(--accent-soft)' : 'transparent', color: tab === v ? 'var(--accent)' : 'var(--text-secondary)' }}>
          {v === 'library' ? <>Library</> : <><BarChart3 size={12} /> Performance</>}
        </button>
      ))}
    </div>
  );


  return (
    <div>
      {_tabsUi}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 4 }}>Creative Library</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Save and reuse winning hooks, bodies, and CTAs</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'var(--accent)', color: 'var(--bg-deep)', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' }}
        >
          <Plus size={14} /> Add Creative
        </button>
      </div>

      {showForm && (
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, marginBottom: 24 }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 16 }}>New Creative</h3>
          <div style={{ display: 'grid', gap: 12 }}>
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Hook</label>
              <input
                value={form.hook}
                onChange={e => setForm({ ...form, hook: e.target.value })}
                placeholder="Attention-grabbing headline..."
                style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-deep)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: '0.85rem', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Body</label>
              <textarea
                value={form.body}
                onChange={e => setForm({ ...form, body: e.target.value })}
                placeholder="Main ad copy..."
                rows={3}
                style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-deep)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: '0.85rem', resize: 'vertical', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>CTA</label>
                <input
                  value={form.cta}
                  onChange={e => setForm({ ...form, cta: e.target.value })}
                  placeholder="Shop Now"
                  style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-deep)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: '0.85rem', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Type</label>
                <select
                  value={form.type}
                  onChange={e => setForm({ ...form, type: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-deep)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: '0.85rem', boxSizing: 'border-box' }}
                >
                  <option value="image">Image</option>
                  <option value="video">Video</option>
                  <option value="carousel">Carousel</option>
                  <option value="text">Text</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Tags (comma)</label>
                <input
                  value={form.tags}
                  onChange={e => setForm({ ...form, tags: e.target.value })}
                  placeholder="sale, promo"
                  style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-deep)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: '0.85rem', boxSizing: 'border-box' }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowForm(false)}
                style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.85rem' }}
              >Cancel</button>
              <button
                onClick={() => createMut.mutate({ ...form, tags: form.tags.split(',').map(t => t.trim()).filter(Boolean) })}
                disabled={!form.hook || createMut.isPending}
                style={{ padding: '8px 16px', background: 'var(--accent)', color: 'var(--bg-deep)', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem', opacity: !form.hook ? 0.5 : 1 }}
              >{createMut.isPending ? 'Saving...' : 'Save Creative'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <Search size={14} style={{ color: 'var(--text-tertiary)' }} />
        <button
          onClick={() => setFilter('')}
          style={{ padding: '4px 12px', borderRadius: 20, border: '1px solid', borderColor: !filter ? 'var(--accent)' : 'var(--border)', background: !filter ? 'rgba(99,102,241,0.1)' : 'transparent', color: !filter ? 'var(--accent)' : 'var(--text-secondary)', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}
        >All</button>
        {types.map(t => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            style={{ padding: '4px 12px', borderRadius: 20, border: '1px solid', borderColor: filter === t ? 'var(--accent)' : 'var(--border)', background: filter === t ? 'rgba(99,102,241,0.1)' : 'transparent', color: filter === t ? 'var(--accent)' : 'var(--text-secondary)', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}
          >{t}</button>
        ))}
      </div>

      {tab === 'performance' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              Ad-level performance langsung dari Meta — urut berdasarkan spend.
            </p>
            <button onClick={() => perfQuery.refetch()} disabled={perfQuery.isFetching}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '0.72rem', cursor: 'pointer' }}>
              <Download size={11} /> Refresh
            </button>
          </div>
          {perfQuery.isLoading && <p style={{ color: 'var(--text-tertiary)', padding: 24, textAlign: 'center' }}>Loading live ad performance…</p>}
          {!perfQuery.isLoading && perfList.length === 0 && (
            <p style={{ color: 'var(--text-tertiary)', padding: 24, textAlign: 'center', fontSize: '0.82rem' }}>Tidak ada data performa. Pastikan akun memiliki iklan aktif dengan data insight.</p>
          )}
          {perfList.length > 0 && (
            <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                    {['Ad', 'Account', 'Status', 'Spend', 'ROAS', 'CTR', 'Clicks', 'Purchases'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', color: 'var(--text-tertiary)', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {perfList.map(ad => (
                    <tr key={ad.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '9px 14px', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ad.name}</td>
                      <td style={{ padding: '9px 14px', color: 'var(--text-secondary)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ad.accountName}</td>
                      <td style={{ padding: '9px 14px' }}>{ad.status === 'active' ? '✅' : ad.status === 'paused' ? '⏸' : ad.status}</td>
                      <td style={{ padding: '9px 14px' }}>{new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(ad.spend || 0)}</td>
                      <td style={{ padding: '9px 14px', color: (ad.roas ?? 0) >= 1 ? 'var(--green)' : '#ef4444' }}>{ad.roas === null ? '—' : ad.roas.toFixed(2) + 'x'}</td>
                      <td style={{ padding: '9px 14px' }}>{(ad.ctr || 0).toFixed(2)}%</td>
                      <td style={{ padding: '9px 14px' }}>{(ad.linkClicks || 0).toLocaleString('id-ID')}</td>
                      <td style={{ padding: '9px 14px' }}>{(ad.purchases || 0).toLocaleString('id-ID')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'library' && (
      <>
      {/* LIBRARY TAB CONTENT */}
      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid var(--red)', borderRadius: 8, padding: 16, marginBottom: 16, color: 'var(--red)', fontSize: '0.85rem' }}>
          Failed to load creative library
        </div>
      )}

      {/* Grid */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-tertiary)' }}>Loading creatives...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-tertiary)' }}>No creatives found</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {filtered.map(c => (
            <div key={c.id} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 8 }}>{c.type || 'creative'}</div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: 8, lineHeight: 1.4 }}>{c.hook}</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.5 }}>{c.body}</div>
              <div style={{ fontSize: '0.77rem', fontWeight: 600, color: 'var(--accent)', marginBottom: 12 }}>{c.cta}</div>
              {c.tags?.length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {c.tags.map(tag => (
                    <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 4, background: 'rgba(99,102,241,0.1)', color: 'var(--accent)', fontSize: '0.68rem', fontWeight: 600 }}>
                      <Tag size={10} /> {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      </>
      )}
    </div>
  );
}
