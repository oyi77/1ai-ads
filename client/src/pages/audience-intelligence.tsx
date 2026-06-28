import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, Search, Target } from 'lucide-react';
import { api } from '../lib/api';
import type { CSSProperties } from 'react';

interface AudienceSegment {
  id: string;
  name: string;
  description: string;
  size: number;
  platform: string;
  demographics: {
    age_range?: string;
    gender?: string;
    interests?: string[];
  };
  performance: {
    reach?: number;
    engagement_rate?: number;
    conversion_rate?: number;
  };
  created_at: string;
}

export function AudienceIntelligencePage() {
  const [query, setQuery] = useState('');

  const { data: audiences, isLoading, refetch } = useQuery<AudienceSegment[]>({
    queryKey: ['audience', 'intelligence', query],
    queryFn: async () => {
      const res = await api.get<{ success?: boolean; data?: AudienceSegment[] } | AudienceSegment[]>(
        `/audience/intelligence/insights${query ? `?interests=${encodeURIComponent(query)}` : ''}`
      );
      if (res && typeof res === 'object' && 'data' in res && Array.isArray((res as any).data)) return (res as any).data;
      return Array.isArray(res) ? res : [];
    },
  });

  const { data: suggestions } = useQuery<{ suggestions: string[] }>({
    queryKey: ['audience', 'suggestions'],
    queryFn: async () => {
      const res = await api.get<{ success?: boolean; data?: string[] } | string[] | { suggestions: string[] }>('/audience/intelligence/suggest?product=&target=');
      if (Array.isArray(res)) return { suggestions: res };
      if (res && typeof res === 'object' && 'data' in res && Array.isArray((res as any).data)) return { suggestions: (res as any).data };
      return res as { suggestions: string[] };
    },
  });

  const list = Array.isArray(audiences) ? audiences : [];
  const tips = Array.isArray(suggestions?.suggestions) ? suggestions.suggestions : [];

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 4 }}>Audience Intelligence</h1>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 24 }}>
        Analyze audience segments, discover insights, and find your best-performing audiences.
      </p>

      {/* Search */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
          <input
            placeholder="Search audience segments..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && refetch()}
            style={inputStyle}
          />
        </div>
        <button onClick={() => refetch()} style={btnStyle}>
          <Target size={14} /> Analyze
        </button>
      </div>

      {/* Suggestions */}
      {tips.length > 0 && (
        <div style={{ ...cardStyle, marginBottom: 20 }}>
          <h3 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 8 }}>Suggested Audiences</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {tips.map((tip, i) => (
              <button key={i} onClick={() => { setQuery(tip); refetch(); }} style={chipStyle}>{tip}</button>
            ))}
          </div>
        </div>
      )}

      {/* Audience List */}
      {isLoading ? (
        <p style={{ color: 'var(--text-tertiary)', padding: 40, textAlign: 'center' }}>Analyzing audiences...</p>
      ) : list.length === 0 ? (
        <div style={cardStyle}>
          <Users size={32} style={{ color: 'var(--text-tertiary)', marginBottom: 8 }} />
          <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>
            No audience data yet. Connect Meta to analyze your audiences.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {list.map(seg => (
            <div key={seg.id} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{seg.name}</span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>{seg.platform}</span>
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 10, lineHeight: 1.5 }}>
                {seg.description || 'No description'}
              </p>
              {seg.demographics && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 4 }}>DEMOGRAPHICS</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {seg.demographics.age_range && <span style={tagStyle}>Age: {seg.demographics.age_range}</span>}
                    {seg.demographics.gender && <span style={tagStyle}>{seg.demographics.gender}</span>}
                    {seg.demographics.interests?.slice(0, 3).map((int, i) => <span key={i} style={tagStyle}>{int}</span>)}
                  </div>
                </div>
              )}
              {seg.performance && (
                <div style={{ display: 'flex', gap: 16, fontSize: '0.72rem' }}>
                  <div>
                    <div style={{ color: 'var(--text-tertiary)' }}>Reach</div>
                    <div style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{(seg.performance.reach ?? 0).toLocaleString()}</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-tertiary)' }}>Eng. Rate</div>
                    <div style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{(seg.performance.engagement_rate ?? 0).toFixed(1)}%</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-tertiary)' }}>Conv. Rate</div>
                    <div style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{(seg.performance.conversion_rate ?? 0).toFixed(1)}%</div>
                  </div>
                </div>
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
  border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem',
};

const inputStyle: CSSProperties = {
  width: '100%', padding: '8px 12px 8px 30px', background: 'var(--bg-deep)',
  border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)',
  fontSize: '0.85rem', boxSizing: 'border-box',
};

const cardStyle: CSSProperties = {
  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
  borderRadius: 10, padding: 20,
};

const chipStyle: CSSProperties = {
  padding: '4px 12px', background: 'rgba(99,102,241,0.1)', color: 'var(--accent)',
  border: '1px solid transparent', borderRadius: 20, cursor: 'pointer',
  fontSize: '0.78rem', fontWeight: 500,
};

const tagStyle: CSSProperties = {
  padding: '2px 8px', borderRadius: 4, fontSize: '0.68rem', fontWeight: 500,
  background: 'rgba(139,146,168,0.1)', color: 'var(--text-secondary)',
};
