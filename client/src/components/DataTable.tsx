import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronUp, ChevronDown, Loader2 } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';

export interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  width?: number;
  render?: (__row: T, _index: number) => ReactNode;
  align?: 'left' | 'center' | 'right';
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  searchKey?: string;
  searchPlaceholder?: string;
  filterOptions?: { key: string; label: string; options: string[] }[];
  maxHeight?: string;
  isLoading?: boolean;
  emptyMessage?: string;
  emptyIcon?: ReactNode;
  onRowClick?: (_row: T) => void;
  pageSize?: number;
  rowKey: (_row: T) => string;
}

export function DataTable<T>({
  columns,
  data,
  searchKey,
  searchPlaceholder = 'Search...',
  filterOptions,
  maxHeight = 'calc(100vh - 320px)',
  isLoading = false,
  emptyMessage = 'No data found',
  emptyIcon,
  onRowClick,
  pageSize = 50,
  rowKey,
}: DataTableProps<T>) {
  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset visible count when data/search/filter changes
  useEffect(() => { setVisibleCount(pageSize); }, [data.length, search, filters, pageSize]);

  // Filter
  const filtered = useMemo(() => {
    let result = data;

    // Text search
    if (search && searchKey) {
      const q = search.toLowerCase();
      result = result.filter(row => {
        const val = (row as Record<string, unknown>)[searchKey];
        return val !== null && String(val).toLowerCase().includes(q);
      });
    }

    // Dropdown filters
    for (const [key, value] of Object.entries(filters)) {
      if (value && value !== 'all') {
        result = result.filter(row => (row as Record<string, unknown>)[key] === value);
      }
    }

    return result;
  }, [data, search, searchKey, filters]);

  // Sort
  const sorted = useMemo(() => {
    if (!sortCol) return filtered;
    return [...filtered].sort((a, b) => {
      const av = (a as Record<string, unknown>)[sortCol];
      const bv = (b as Record<string, unknown>)[sortCol];
      const an = Number(av) || 0;
      const bn = Number(bv) || 0;
      if (typeof av === 'number' || typeof bv === 'number') {
        return sortDir === 'asc' ? an - bn : bn - an;
      }
      const as = String(av || '').toLowerCase();
      const bs = String(bv || '').toLowerCase();
      return sortDir === 'asc' ? as.localeCompare(bs) : bs.localeCompare(as);
    });
  }, [filtered, sortCol, sortDir]);

  // Paginate (infinite scroll)
  const visible = sorted.slice(0, visibleCount);
  const hasMore = visibleCount < sorted.length;

  // Infinite scroll handler
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !hasMore) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) {
      setVisibleCount(prev => Math.min(prev + pageSize, sorted.length));
    }
  }, [hasMore, pageSize, sorted.length]);

  const toggleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('desc');
    }
  };

  return (
    <div style={containerStyle}>
      {/* Toolbar */}
      <div style={toolbarStyle}>
        {searchKey && (
          <div style={searchBoxStyle}>
            <Search size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              style={searchInputStyle}
            />
          </div>
        )}
        {filterOptions?.map(f => (
          <select
            key={f.key}
            value={filters[f.key] || 'all'}
            onChange={e => setFilters(prev => ({ ...prev, [f.key]: e.target.value }))}
            style={selectStyle}
          >
            <option value="all">{f.label}</option>
            {f.options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ))}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
          {sorted.length} {sorted.length === 1 ? 'row' : 'rows'}
        </span>
      </div>

      {/* Table Container — scrollable */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{ ...tableContainerStyle, maxHeight }}
      >
        <table style={tableStyle}>
          <thead>
            <tr>
              {columns.map(col => (
                <th
                  key={col.key}
                  onClick={() => col.sortable && toggleSort(col.key)}
                  style={{
                    ...thStyle,
                    width: col.width,
                    textAlign: col.align || 'left',
                    cursor: col.sortable ? 'pointer' : 'default',
                    userSelect: 'none',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {col.label}
                    {col.sortable && sortCol === col.key && (
                      sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={columns.length} style={loadingCellStyle}>
                  <Loader2 size={18} className="animate-spin" style={{ marginBottom: 8 }} />
                  <span>Loading...</span>
                </td>
              </tr>
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={columns.length} style={emptyCellStyle}>
                  {emptyIcon && <div style={{ marginBottom: 8 }}>{emptyIcon}</div>}
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              visible.map((row, i) => (
                <tr
                  key={rowKey(row)}
                  onClick={() => onRowClick?.(row)}
                  style={{
                    ...trStyle,
                    background: i % 2 === 0 ? undefined : 'var(--bg-surface, #0d1117)',
                    cursor: onRowClick ? 'pointer' : 'default',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(88,166,255,0.04)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = i % 2 === 0 ? '' : 'var(--bg-surface, #0d1117)'; }}
                >
                  {columns.map(col => (
                    <td key={col.key} style={{ ...tdStyle, textAlign: col.align || 'left' }}>
                      {col.render ? col.render(row, i) : String((row as Record<string, unknown>)[col.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))
            )}
            {hasMore && !isLoading && (
              <tr>
                <td colSpan={columns.length} style={{ textAlign: 'center', padding: 12, color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>
                  <Loader2 size={14} className="animate-spin" style={{ marginRight: 6 }} />
                  Loading more... ({sorted.length - visibleCount} remaining)
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────

const containerStyle: CSSProperties = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
};

const toolbarStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '10px 16px',
  borderBottom: '1px solid var(--border)',
  background: 'var(--bg-elevated)',
  flexWrap: 'wrap',
};

const searchBoxStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 10px',
  background: 'var(--bg-surface, #0d1117)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  minWidth: 180,
  flex: '0 1 240px',
};

const searchInputStyle: CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: 'var(--text-primary)',
  fontSize: '0.8rem',
  outline: 'none',
  width: '100%',
  fontFamily: 'var(--font)',
};

const selectStyle: CSSProperties = {
  padding: '6px 10px',
  background: 'var(--bg-surface, #0d1117)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text-primary)',
  fontSize: '0.78rem',
  fontFamily: 'var(--font)',
  cursor: 'pointer',
  outline: 'none',
};

const tableContainerStyle: CSSProperties = {
  overflow: 'auto',
  WebkitOverflowScrolling: 'touch',
};

const tableStyle: CSSProperties = {
  width: '100%',
  minWidth: 900,
  borderCollapse: 'collapse',
  fontSize: '0.77rem',
};

const thStyle: CSSProperties = {
  padding: '10px 14px',
  fontSize: '0.68rem',
  fontWeight: 600,
  color: 'var(--text-tertiary)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  borderBottom: '1px solid var(--border)',
  position: 'sticky',
  top: 0,
  background: 'var(--bg-elevated)',
  zIndex: 2,
  whiteSpace: 'nowrap',
};

const trStyle: CSSProperties = {
  borderBottom: '1px solid var(--border)',
  transition: 'background 0.12s',
};

const tdStyle: CSSProperties = {
  padding: '10px 14px',
  whiteSpace: 'nowrap',
};

const loadingCellStyle: CSSProperties = {
  textAlign: 'center',
  padding: 40,
  color: 'var(--text-tertiary)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
};

const emptyCellStyle: CSSProperties = {
  textAlign: 'center',
  padding: 48,
  color: 'var(--text-tertiary)',
  fontSize: '0.85rem',
};
