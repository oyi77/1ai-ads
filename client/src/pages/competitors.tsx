import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, ExternalLink, TrendingDown, TrendingUp } from 'lucide-react';
import { api } from '../lib/api';

interface CompetitorInsight {
  id: string;
  competitor_url: string;
  competitor_name: string;
  platform: string;
  ad_count: number;
  top_hooks: string[];
  estimated_spend: string;
  creative_style: string;
  strengths: string[];
  weaknesses: string[];
  analyzed_at: string;
}

export function CompetitorsPage() {
  const queryClient = useQueryClient();
  const [url, setUrl] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['competitor-insights'],
    queryFn: () => api.get<CompetitorInsight[]>('/competitor-spy'),
  });

  const analyzeMut = useMutation({
    mutationFn: (competitorUrl: string) => api.post('/competitor-spy/analyze', { url: competitorUrl }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['competitor-insights'] });
      setUrl('');
    },
  });

  const insights: CompetitorInsight[] = Array.isArray(data) ? data : [];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 4 }}>Competitor Intelligence</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Analyze competitor ad strategies and creative approaches</p>
        </div>
      </div>

      {/* Analyze form */}
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Competitor URL</label>
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://competitor.com"
              onKeyDown={e => e.key === 'Enter' && url.trim() && analyzeMut.mutate(url)}
              style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-deep)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: '0.85rem', boxSizing: 'border-box' }}
            />
          </div>
          <button
            onClick={() => url.trim() && analyzeMut.mutate(url)}
            disabled={!url.trim() || analyzeMut.isPending}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px', background: 'var(--accent)', color: 'var(--bg-deep)', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem', opacity: !url.trim() ? 0.5 : 1, whiteSpace: 'nowrap' }}
          >
            <Search size={14} /> {analyzeMut.isPending ? 'Analyzing...' : 'Analyze'}
          </button>
        </div>
        {analyzeMut.isError && (
          <div style={{ marginTop: 12, color: 'var(--red)', fontSize: '0.82rem' }}>Analysis failed. Please check the URL and try again.</div>
        )}
      </div>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid var(--red)', borderRadius: 8, padding: 16, marginBottom: 16, color: 'var(--red)', fontSize: '0.85rem' }}>
          Failed to load competitor insights
        </div>
      )}

      {/* Insights table */}
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: '0.85rem' }}>
          Competitor Analysis ({insights.length})
        </div>

        {isLoading ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-tertiary)' }}>Loading insights...</div>
        ) : insights.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-tertiary)' }}>Add a competitor URL to get started</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {insights.map(c => (
              <div key={c.id} style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                      {c.competitor_name || c.competitor_url}
                      <a href={c.competitor_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-tertiary)' }}>
                        <ExternalLink size={12} />
                      </a>
                    </div>
                    <div style={{ fontSize: '0.77rem', color: 'var(--text-tertiary)' }}>
                      {c.platform && <span style={{ textTransform: 'capitalize' }}>{c.platform}</span>}
                      {c.platform && c.analyzed_at && <span> &middot; </span>}
                      {c.analyzed_at && <span>Analyzed {new Date(c.analyzed_at).toLocaleDateString()}</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Est. Spend</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', fontWeight: 700 }}>{c.estimated_spend || '—'}</div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, fontSize: '0.82rem' }}>
                  <div>
                    <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 6 }}>Top Hooks</div>
                    {(c.top_hooks || []).slice(0, 3).map((h, i) => (
                      <div key={i} style={{ color: 'var(--text-secondary)', marginBottom: 4, lineHeight: 1.4 }}>"{h}"</div>
                    ))}
                    {(!c.top_hooks || c.top_hooks.length === 0) && <div style={{ color: 'var(--text-tertiary)' }}>—</div>}
                  </div>
                  <div>
                    <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <TrendingUp size={10} style={{ color: 'var(--green)' }} /> Strengths
                    </div>
                    {(c.strengths || []).slice(0, 3).map((s, i) => (
                      <div key={i} style={{ color: 'var(--green)', marginBottom: 4, fontSize: '0.77rem' }}>+ {s}</div>
                    ))}
                    {(!c.strengths || c.strengths.length === 0) && <div style={{ color: 'var(--text-tertiary)' }}>—</div>}
                  </div>
                  <div>
                    <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <TrendingDown size={10} style={{ color: 'var(--red)' }} /> Weaknesses
                    </div>
                    {(c.weaknesses || []).slice(0, 3).map((w, i) => (
                      <div key={i} style={{ color: 'var(--red)', marginBottom: 4, fontSize: '0.77rem' }}>- {w}</div>
                    ))}
                    {(!c.weaknesses || c.weaknesses.length === 0) && <div style={{ color: 'var(--text-tertiary)' }}>—</div>}
                  </div>
                </div>

                {c.creative_style && (
                  <div style={{ marginTop: 12, padding: '6px 10px', background: 'rgba(99,102,241,0.06)', borderRadius: 6, fontSize: '0.77rem', color: 'var(--accent)', display: 'inline-block' }}>
                    Style: {c.creative_style}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
