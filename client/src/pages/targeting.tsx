import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CSSProperties } from 'react';
import { Loader2, Target, Search, Sparkles, X } from 'lucide-react';
import { api } from '../lib/api';
import { DataTable } from '../components/DataTable';
import type { Column } from '../components/DataTable';

interface TargetingSuggestion {
  id: string;
  post_id: string;
  page_id: string;
  category: string;
  age_min: number | null;
  age_max: number | null;
  genders: string | null;
  interests_json: string | null;
  locations_json: string | null;
  lookalike_source: string | null;
  confidence_score: number | null;
  created_at: string;
}

interface SuggestionsResponse {
  success: boolean;
  data: TargetingSuggestion[];
  total: number;
}

interface InterestResult {
  id: string;
  name: string;
  audience_size?: number;
  path?: string;
  description?: string;
}

const btnStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '8px 16px', background: 'var(--accent)', color: 'var(--bg-deep)',
  border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: '0.8rem',
};

const iconBtn: CSSProperties = {
  display: 'inline-flex', padding: 6, background: 'transparent', color: 'var(--text-secondary)',
  border: '1px solid var(--border-strong)', borderRadius: 6, cursor: 'pointer',
};

const cardStyle: CSSProperties = {
  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
  borderRadius: 10, padding: 16,
};

const inputStyle: CSSProperties = {
  width: '100%', padding: '8px 12px', background: 'var(--bg-surface)', color: 'var(--text-primary)',
  border: '1px solid var(--border-strong)', borderRadius: 6, fontSize: '0.85rem', outline: 'none',
};

const labelStyle: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.75rem', color: 'var(--text-secondary)',
};

export function TargetingPage() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [showSuggest, setShowSuggest] = useState(false);
  const [suggest, setSuggest] = useState({ postId: '', pageId: '', category: '' });

  const { data: suggestions, isLoading: sugLoading, error: sugError } = useQuery<SuggestionsResponse>({
    queryKey: ['targeting-suggestions'],
    queryFn: () => api.get<SuggestionsResponse>('/boost/targeting'),
  });

  const rawSuggestions: TargetingSuggestion[] = Array.isArray(suggestions) ? suggestions as TargetingSuggestion[] : (suggestions?.data || []);

  const { data: search, isFetching: searchLoading, refetch: runSearch } = useQuery<InterestResult[]>({
    queryKey: ['targeting-search', query],
    queryFn: () => api.get<InterestResult[]>(`/campaigns/targeting/search?q=${encodeURIComponent(query)}`),
    enabled: false,
  });

  const rawSearch: InterestResult[] = Array.isArray(search) ? search : [];

  const suggestMutation = useMutation({
    mutationFn: (payload: { post_id: string; page_id: string; category: string }) =>
      api.post<TargetingSuggestion>('/boost/targeting/suggest', payload),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['targeting-suggestions'] }); setShowSuggest(false); setSuggest({ postId: '', pageId: '', category: '' }); },
  });

  const searchColumns: Column<InterestResult>[] = [
    { key: 'name', label: 'Interest', sortable: true, width: 260 },
    { key: 'audience_size', label: 'Audience Size', sortable: true, align: 'right', width: 160, render: (r) => (r.audience_size != null ? r.audience_size.toLocaleString('id-ID') : '—') },
    { key: 'path', label: 'Path', sortable: true, width: 220, render: (r) => r.path || '—' },
  ];

  const suggestionColumns: Column<TargetingSuggestion>[] = [
    { key: 'category', label: 'Category', sortable: true, width: 140 },
    { key: 'post_id', label: 'Post ID', sortable: true, width: 160 },
    {
      key: 'confidence_score', label: 'Confidence', sortable: true, align: 'right', width: 120,
      render: (s) => (s.confidence_score !== null ? `${Math.round(s.confidence_score * 100)}%` : '—'),
    },
    {
      key: 'interests_json', label: 'Interests', sortable: false, width: 260,
      render: (s) => {
        try {
          const arr = s.interests_json ? JSON.parse(s.interests_json) : [];
          return Array.isArray(arr) && arr.length ? arr.map((x: { name?: string } | string) => (typeof x === 'string' ? x : x.name)).slice(0, 4).join(', ') : '—';
        } catch { return '—'; }
      },
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 4 }}>Advanced Targeting</h1>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          Search Meta interests and browse AI targeting suggestions
        </p>
      </div>

      <div style={{ ...cardStyle, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
            <input
              style={{ ...inputStyle, paddingLeft: 34 }}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && query.trim()) runSearch(); }}
              placeholder="Search Meta interests (e.g. fitness, crypto)"
            />
          </div>
          <button onClick={() => query.trim() && runSearch()} disabled={searchLoading || !query.trim()} style={btnStyle}>
            {searchLoading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            Search
          </button>
          <button onClick={() => { setShowSuggest(true); }} style={{ ...btnStyle, background: 'var(--bg-hover)', color: 'var(--text-primary)' }}>
            <Sparkles size={14} /> Suggest
          </button>
        </div>
      </div>

      {showSuggest && (
        <form
          onSubmit={(e) => { e.preventDefault(); if (suggest.postId && suggest.pageId && suggest.category) suggestMutation.mutate({ post_id: suggest.postId, page_id: suggest.pageId, category: suggest.category }); }}
          style={{ ...cardStyle, marginBottom: 16 }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600 }}>Suggest Targeting</h2>
            <button type="button" onClick={() => setShowSuggest(false)} style={iconBtn}><X size={14} /></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <label style={labelStyle}>Post ID *<input style={inputStyle} value={suggest.postId} onChange={(e) => setSuggest({ ...suggest, postId: e.target.value })} placeholder="Post ID" /></label>
            <label style={labelStyle}>Page ID *<input style={inputStyle} value={suggest.pageId} onChange={(e) => setSuggest({ ...suggest, pageId: e.target.value })} placeholder="Page ID" /></label>
            <label style={labelStyle}>Category *<input style={inputStyle} value={suggest.category} onChange={(e) => setSuggest({ ...suggest, category: e.target.value })} placeholder="Category" /></label>
          </div>
          {suggestMutation.isError && (
            <div style={{ marginTop: 12, color: 'var(--red)', fontSize: '0.8rem' }}>{(suggestMutation.error as Error).message}</div>
          )}
          <div style={{ marginTop: 14 }}>
            <button type="submit" disabled={suggestMutation.isPending} style={btnStyle}>
              {suggestMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              Save Suggestion
            </button>
          </div>
        </form>
      )}

      {search && (
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 10 }}>Search Results</h2>
          <DataTable
            columns={searchColumns}
            data={rawSearch}
            rowKey={(r) => r.id}
            searchKey="name"
            searchPlaceholder="Filter results..."
            isLoading={false}
            emptyMessage="No interests found for this query."
            emptyIcon={<Target size={32} style={{ color: 'var(--text-tertiary)' }} />}
          />
        </div>
      )}

      <div>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 10 }}>Saved Suggestions</h2>
        {sugError && (
          <div style={{ padding: 12, background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', borderRadius: 8, color: '#f85149', fontSize: '0.85rem', marginBottom: 12 }}>
            Failed to load suggestions. Please try again.
          </div>
        )}
        <DataTable
          columns={suggestionColumns}
          data={rawSuggestions}
          rowKey={(s) => s.id}
          searchKey="category"
          searchPlaceholder="Search suggestions..."
          isLoading={sugLoading}
          emptyMessage="No targeting suggestions yet."
          emptyIcon={<Sparkles size={32} style={{ color: 'var(--text-tertiary)' }} />}
        />
      </div>
    </div>
  );
}
