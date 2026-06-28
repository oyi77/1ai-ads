import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, Globe, Database, Search, RefreshCw } from 'lucide-react';
import { api } from '../lib/api';
import type { CSSProperties } from 'react';

interface Trend {
  id: string;
  title: string;
  description: string;
  platform: string;
  category: string;
  score: number;
  source: string;
  url?: string;
  created_at: string;
}

export function TrendingPage() {
  const [industry, setIndustry] = useState('');
  const [region, setRegion] = useState('');
  const [tab, setTab] = useState<'all' | 'internal' | 'external'>('all');

  const { data: trends, isLoading, refetch, error } = useQuery<Trend[]>({
    queryKey: ['trending', tab, industry, region],
    queryFn: () => {
      const params = new URLSearchParams();
      if (industry) params.set('industry', industry);
      if (region) params.set('region', region);
      const qs = params.toString();
      return api.get<Trend[]>(`/trending/${tab}${qs ? `?${qs}` : ''}`);
    },
  });

  const items = Array.isArray(trends) ? trends : [];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 4 }}>Trending Ads</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Discover what&apos;s trending in advertising right now
          </p>
        </div>
        <button onClick={() => refetch()} style={btnStyle}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['all', 'internal', 'external'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            ...tabBtn,
            background: tab === t ? 'var(--accent)' : 'transparent',
            color: tab === t ? 'var(--bg-deep)' : 'var(--text-secondary)',
          }}>
            {t === 'all' ? <TrendingUp size={14} /> : t === 'internal' ? <Database size={14} /> : <Globe size={14} />}
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 240 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
          <input
            placeholder="Industry (e.g. fashion, tech)"
            value={industry}
            onChange={e => setIndustry(e.target.value)}
            style={inputStyle}
          />
        </div>
        <input
          placeholder="Region (e.g. ID, US)"
          value={region}
          onChange={e => setRegion(e.target.value)}
          style={{ ...inputStyle, maxWidth: 160 }}
        />
      </div>

      {/* Content */}
      {error && (
        <div style={{ padding: 12, background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', borderRadius: 8, color: '#f85149', fontSize: '0.85rem', marginBottom: 16 }}>
          Failed to load data. Please try again.
        </div>
      )}

      {isLoading ? (
        <p style={{ color: 'var(--text-tertiary)', padding: 40, textAlign: 'center' }}>Loading trends...</p>
      ) : items.length === 0 ? (
        <div style={cardStyle}>
          <TrendingUp size={32} style={{ color: 'var(--text-tertiary)', marginBottom: 8 }} />
          <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>
            No trends found. Try adjusting your filters.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {items.map((trend, idx) => (
            <div key={trend.id || idx} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <span style={{
                  padding: '2px 8px', borderRadius: 4, fontSize: '0.7rem', fontWeight: 600,
                  background: 'rgba(99,102,241,0.1)', color: 'var(--accent)',
                }}>{trend.platform || trend.source || 'Unknown'}</span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                  Score: {trend.score ?? '—'}
                </span>
              </div>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 4 }}>{trend.title || 'Untitled'}</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 8 }}>
                {trend.description || 'No description available'}
              </p>
              {trend.category && (
                <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
                  Category: {trend.category}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const btnStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '8px 16px', background: 'var(--accent)', color: 'var(--bg-deep)',
  border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: '0.8rem',
};

const tabBtn: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '6px 14px', border: '1px solid var(--border)', borderRadius: 6,
  fontWeight: 600, cursor: 'pointer', fontSize: '0.78rem',
};

const inputStyle: CSSProperties = {
  padding: '8px 12px 8px 32px', background: 'var(--bg-deep)', color: 'var(--text-primary)',
  border: '1px solid var(--border)', borderRadius: 6, fontSize: '0.8rem', width: '100%',
};

const cardStyle: CSSProperties = {
  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
  borderRadius: 10, padding: 20,
};
