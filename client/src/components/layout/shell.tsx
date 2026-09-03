import { Outlet, NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Megaphone, LogOut, Menu, X,
  Library, Activity, FlaskConical, BarChart3, Zap, Eye, GitBranch, LayoutGrid,
  TrendingUp, Bot, FileText, Globe, Users, Link2, FileEdit, Layers, Boxes, Receipt, Bookmark, Target, FileBarChart, CreditCard,
  ChevronDown, ChevronRight,
} from 'lucide-react';
import type { CSSProperties } from 'react';
import { useState, useEffect } from 'react';
import { PlanBadge } from '../RequirePro';
import { api } from '../../lib/api';
import { ErrorBoundary } from '../ErrorBoundary';

interface NavGroup {
  title: string;
  items: { to: string; label: string; icon: React.ComponentType<{ size?: number; style?: CSSProperties }> }[];
  defaultOpen: boolean;
}

const navGroups: NavGroup[] = [
  {
    title: 'Overview',
    items: [
      { to: '/app', label: 'Dashboard', icon: LayoutDashboard },
    ],
    defaultOpen: true,
  },
  {
    title: 'Campaigns',
    items: [
      { to: '/campaigns', label: 'Campaigns', icon: Megaphone },
      { to: '/ads', label: 'Ads Manager', icon: Layers },
      { to: '/adsets', label: 'Ad Sets', icon: Boxes },
      { to: '/templates', label: 'Templates', icon: FileText },
      { to: '/drafts', label: 'Drafts', icon: FileEdit },
    ],
    defaultOpen: true,
  },
  {
    title: 'Creative',
    items: [
      { to: '/creative-library', label: 'Creative Library', icon: Library },
      { to: '/creative-fatigue', label: 'Creative Fatigue', icon: Activity },
      { to: '/landing-pages', label: 'Landing Pages', icon: Globe },
    ],
    defaultOpen: false,
  },
  {
    title: 'Insights',
    items: [
      { to: '/reporting', label: 'Reporting', icon: BarChart3 },
      { to: '/reports', label: 'Account Reports', icon: FileBarChart },
      { to: '/ab-tests', label: 'A/B Tests', icon: FlaskConical },
      { to: '/attribution', label: 'Attribution', icon: GitBranch },
      { to: '/widgets', label: 'Widgets', icon: LayoutGrid },
    ],
    defaultOpen: false,
  },
  {
    title: 'Research',
    items: [
      { to: '/competitors', label: 'Competitors', icon: Eye },
      { to: '/trending', label: 'Trending Ads', icon: TrendingUp },
      { to: '/audiences', label: 'Audiences', icon: Users },
      { to: '/saved-audiences', label: 'Saved Audiences', icon: Bookmark },
      { to: '/targeting', label: 'Advanced Targeting', icon: Target },
    ],
    defaultOpen: false,
  },
  {
    title: 'AI & Automation',
    items: [
      { to: '/automation', label: 'Automation', icon: Zap },
      { to: '/meta-ai', label: 'Meta AI Chat', icon: Bot },
      { to: '/audit-trail', label: 'Audit Trail', icon: FileBarChart },
    ],
    defaultOpen: false,
  },
  {
    title: 'Settings',
    items: [
      { to: '/platforms', label: 'Platforms', icon: Link2 },
      { to: '/invoices', label: 'Invoices', icon: Receipt },
      { to: '/billing', label: 'Billing', icon: CreditCard },
      { to: '/settings', label: 'Settings', icon: LayoutGrid },
    ],
    defaultOpen: false,
  },
];

interface NavItemProps {
  to: string;
  label: string;
  icon: React.ComponentType<{ size?: number; style?: CSSProperties }>;
  onClick?: () => void;
}

function NavItem({ to, label, icon: Icon, onClick }: NavItemProps) {
  return (
    <NavLink
      to={to}
      end={to === '/app'}
      onClick={onClick}
      style={({ isActive }) => ({
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '9px 14px', borderRadius: 8,
        textDecoration: 'none', fontSize: '0.84rem', fontWeight: 500,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        background: isActive ? 'rgba(139,146,168,0.12)' : 'transparent',
        color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
        transition: 'background 0.15s, color 0.15s',
      })}
    >
      <Icon size={16} style={{ flexShrink: 0 }} />
      <span>{label}</span>
    </NavLink>
  );
}

const MOBILE_BREAKPOINT = 768;

export function Shell() {
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= MOBILE_BREAKPOINT);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < MOBILE_BREAKPOINT);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(navGroups.map(g => [g.title, g.defaultOpen]))
  );

  useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth < MOBILE_BREAKPOINT;
      setIsMobile(mobile);
      if (mobile) setSidebarOpen(false);
      else setSidebarOpen(true);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);


  const toggleGroup = (title: string) => {
    setOpenGroups(prev => ({ ...prev, [title]: !prev[title] }));
  };

  const closeSidebar = () => { if (isMobile) setSidebarOpen(false); };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', position: 'relative' }}>
      {/* Mobile overlay */}
      {isMobile && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 99 }}
        />
      )}

      {/* Sidebar */}
      <nav
        style={{
          width: sidebarOpen ? 240 : 0,
          minWidth: sidebarOpen ? 240 : 0,
          background: 'var(--bg-elevated)',
          borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column',
          position: isMobile ? 'fixed' : 'sticky',
          top: 0, left: 0,
          height: '100vh',
          zIndex: 100,
          transition: 'width 0.2s, min-width 0.2s',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 16px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8, background: 'var(--accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--bg-deep)', fontWeight: 800, fontSize: '0.7rem', flexShrink: 0,
            }}>AF</div>
            {sidebarOpen && <span style={{ fontWeight: 700, fontSize: '0.95rem', whiteSpace: 'nowrap' }}>AdForge</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <PlanBadge />
            {isMobile && (
              <button onClick={() => setSidebarOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 4 }}>
                <X size={18} />
              </button>
            )}
          </div>
        </div>

        {/* Nav groups */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
          {navGroups.map(group => (
            <div key={group.title} style={{ marginBottom: 4 }}>
              <button
                onClick={() => toggleGroup(group.title)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  width: '100%', padding: '8px 12px', marginBottom: 2,
                  background: 'none', border: 'none', borderRadius: 6,
                  color: 'var(--text-tertiary)', fontSize: '0.68rem', fontWeight: 700,
                  textTransform: 'uppercase', letterSpacing: '0.5px',
                  cursor: 'pointer', transition: 'background 0.15s',
                }}
              >
                <span>{group.title}</span>
                {openGroups[group.title] ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>
              {openGroups[group.title] && group.items.map(item => (
                <NavItem key={item.to} to={item.to} label={item.label} icon={item.icon} onClick={closeSidebar} />
              ))}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: '8px', borderTop: '1px solid var(--border)' }}>
          <button
            onClick={() => api.logout().then(() => window.location.href = '/')}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              width: '100%', padding: '9px 14px', borderRadius: 8,
              background: 'none', border: 'none',
              color: 'var(--text-secondary)', fontSize: '0.84rem', fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <LogOut size={16} />
            {sidebarOpen && <span>Sign Out</span>}
          </button>
        </div>
      </nav>

      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Top bar */}
        <header style={{
          padding: '12px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-elevated)',
          position: 'sticky', top: 0, zIndex: 50,
        }}>
          <button
            onClick={() => setSidebarOpen(o => !o)}
            style={{
              background: 'none', border: 'none', color: 'var(--text-secondary)',
              cursor: 'pointer', padding: 6, borderRadius: 6,
            }}
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <a href="/app" style={{ fontSize: '0.78rem', color: 'var(--accent)', textDecoration: 'none' }}>Dashboard</a>
          </div>
        </header>

        <main style={{ flex: 1, padding: 24, overflow: 'auto' }}>
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
