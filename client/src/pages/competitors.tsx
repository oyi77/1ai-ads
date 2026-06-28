import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, Search, Copy, ExternalLink, Loader2 } from 'lucide-react';
import { api } from '../lib/api';
import type { CSSProperties } from 'react';

interface CompetitorAd {
  id: string;
  ad_id: string;
  page_name: string;
  ad_text: string;
  media_type: string;
  media_url: string;
  link_url: string;
  platform: string;
  impressions: string;
  spend: string;
  country: string;
  created_at: string;
}

interface SearchResult {
  ads: CompetitorAd[];
  total: number;
}

export function CompetitorsPage() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [platform, setPlatform] = useState('meta');
  const [country, setCountry] = useState('');

  const { data, isLoading, error, refetch } = useQuery<SearchResult>({
    queryKey: ['competitor-spy', query, platform, country],
    queryFn: () => {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (country) params.set('country', country);
      params.set('platform', platform);
      const qs = params.toString();
      return api.get<SearchResult>(`/ads-library/search?${qs}`);
    },
    enabled: false,
  });

  const copyMutation = useMutation({
    mutationFn: (ad: CompetitorAd) =>
      api.post('/ads-library-ai/clone', { ad_text: ad.ad_text, platform: ad.platform }),
  });

  const ads = data?.ads || [];

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 4 }}>Competitor Spy</h1>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 24 }}>
        Search and analyze competitor ads. Copy winning strategies.
      </p>

      {/* Search Bar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
          <input
            placeholder="Search competitor ads..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && refetch()}
            style={inputStyle}
          />
        </div>
        <select value={platform} onChange={e => setPlatform(e.target.value)} style={selectStyle}>
          <option value="meta">Meta (Facebook/Instagram)</option>
          <option value="tiktok">TikTok</option>
          <option value="google">Google</option>
        </select>
        <input
          placeholder="Country (e.g. ID, US)"
          value={country}
          onChange={e => setCountry(e.target.value)}
          style={{ ...inputStyle, maxWidth: 120 }}
        />
        <button onClick={() => refetch()} disabled={isLoading} style={btnStyle}>
          {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
          Search
        </button>
      </div>

      {error && (
        <div style={{ padding: 12, background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', borderRadius: 8, color: '#f85149', fontSize: '0.85rem', marginBottom: 16 }}>
          Failed to load data. Please try again.
        </div>
      )}

      {/* Results */}
      {ads.length === 0 && !isLoading ? (
        <div style={cardStyle}>
          <Eye size={32} style={{ color: 'var(--text-tertiary)', marginBottom: 8 }} />
          <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>
            Enter a keyword and click Search to find competitor ads.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
          {ads.map((ad) => (
            <div key={ad.id || ad.ad_id} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{ad.page_name || 'Unknown'}</span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>{ad.platform || platform}</span>
              </div>
              {ad.media_url && (
                <div style={{ marginBottom: 8, borderRadius: 6, overflow: 'hidden', maxHeight: 180 }}>
                  {ad.media_type === 'video' ? (
                    <video src={ad.media_url} controls style={{ width: '100%', maxHeight: 180, objectFit: 'cover' }} />
                  ) : (
                    <img src={ad.media_url} alt="" style={{ width: '100%', maxHeight: 180, objectFit: 'cover' }} />
                  )}
                </div>
              )}
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 12, whiteSpace: 'pre-wrap' }}>
                {ad.ad_text ? (ad.ad_text.length > 200 ? ad.ad_text.slice(0, 200) + '...' : ad.ad_text) : 'No text'}
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => copyMutation.mutate(ad)} style={smallBtn}>
                  <Copy size={12} /> Clone Ad
                </button>
                {ad.link_url && (
                  <a href={ad.link_url} target="_blank" rel="noopener noreferrer" style={{ ...smallBtn, textDecoration: 'none' }}>
                    <ExternalLink size={12} /> Visit
                  </a>
                )}
              </div>
              {copyMutation.isError && (
                <p style={{ color: 'var(--error, #ef4444)', fontSize: '0.75rem', marginTop: 8 }}>
                  Clone failed: {(copyMutation.error as Error).message}
                </p>
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

const smallBtn: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 4,
  padding: '4px 10px', background: 'transparent', color: 'var(--text-secondary)',
  border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', fontSize: '0.75rem',
};

const inputStyle: CSSProperties = {
  padding: '8px 12px 8px 32px', background: 'var(--bg-deep)', color: 'var(--text-primary)',
  border: '1px solid var(--border)', borderRadius: 6, fontSize: '0.8rem', width: '100%',
};

const selectStyle: CSSProperties = {
  padding: '8px 12px', background: 'var(--bg-deep)', color: 'var(--text-primary)',
  border: '1px solid var(--border)', borderRadius: 6, fontSize: '0.8rem',
};

const cardStyle: CSSProperties = {
  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
  borderRadius: 10, padding: 20,
};
