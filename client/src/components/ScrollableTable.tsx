import { useState, useCallback } from 'react';
import type { CSSProperties, ReactNode, ThHTMLAttributes, TdHTMLAttributes } from 'react';

/** Scrollable wrapper for tables — adds overflow-x scroll on small screens */
export function ScrollableTable({ children }: { children: ReactNode }) {
  return (
    <div style={{
      overflowX: 'auto',
      WebkitOverflowScrolling: 'touch',
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border)',
      borderRadius: 10,
    }}>
      {children}
    </div>
  );
}

/** Sticky <th> with consistent styling */
export function StickyTh({ children, style, ...rest }: { children: ReactNode; style?: CSSProperties } & ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      {...rest}
      style={{
        textAlign: 'left',
        padding: '10px 16px',
        fontSize: '0.68rem',
        fontWeight: 600,
        color: 'var(--text-tertiary)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        borderBottom: '1px solid var(--border)',
        position: 'sticky',
        top: 0,
        background: 'var(--bg-elevated)',
        zIndex: 1,
        ...style,
      }}
    >
      {children}
    </th>
  );
}

/** <tr> with hover highlight and optional zebra stripe */
export function HoverTr({
  children,
  style,
  even = false,
  ...rest
}: {
  children: ReactNode;
  style?: CSSProperties;
  even?: boolean;
} & React.HTMLAttributes<HTMLTableRowElement>) {
  const [hovered, setHovered] = useState(false);
  const onEnter = useCallback(() => setHovered(true), []);
  const onLeave = useCallback(() => setHovered(false), []);

  const bg = hovered
    ? 'rgba(99,102,241,0.05)'
    : even
      ? 'var(--bg-surface, #1a1a2e)'
      : undefined;

  return (
    <tr
      {...rest}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{
        borderBottom: '1px solid var(--border)',
        transition: 'background 0.15s',
        background: bg,
        ...style,
      }}
    >
      {children}
    </tr>
  );
}
