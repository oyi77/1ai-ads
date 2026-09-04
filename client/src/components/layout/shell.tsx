import { Outlet, NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Megaphone, LogOut, Menu, X,
  Library, Activity, FlaskConical, BarChart3, Zap, Eye, GitBranch, LayoutGrid,
  TrendingUp, Bot, FileText, Globe, Users, Link2, FileEdit, Layers, Boxes, Receipt, Bookmark, Target, FileBarChart, CreditCard, Key,
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
      { to: '/reports', label: 'Account Reports', icon: FileBarChart },
    ],
    defaultOpen: true,
  },
  {
    title: 'Campaigns',
    items: [
      { to: '/campaigns', label: 'Campaigns', icon: Megaphone },
      { to: '/adsets', label: 'Ad Sets', icon: Layers },
      { to: '/ads', label: 'Ads', icon: Boxes },
      { to: '/landing-pages', label: 'Landing Pages', icon: Globe },
      { to: '/audiences', label: 'Audiences', icon: Users },
      { to: '/targeting', label: 'Targeting', icon: Target },
    ],
    defaultOpen: false,
  },
  {
    title: 'Creative',
    items: [
      { to: '/creative-library', label: 'Library', icon: Library },
      { to: '/creative-fatigue', label: 'Fatigue', icon: Activity },
      { to: '/templates', label: 'Templates', icon: FileText },
    ],
    defaultOpen: false,
  },
  {
    title: 'Insights',
    items: [
      { to: '/reporting', label: 'Reports', icon: BarChart3 },
      { to: '/ab-tests', label: 'A/B Tests', icon: FlaskConical },
      { to: '/attribution', label: 'Attribution', icon: GitBranch },
      { to: '/competitors', label: 'Competitors', icon: Eye },
      { to: '/trending', label: 'Trending', icon: TrendingUp },
    ],
    defaultOpen: false,
  },
  {
    title: 'Research',
    items: [
      { to: '/meta-ai', label: 'Meta AI', icon: Bot },
      { to: '/audience-intelligence', label: 'Audience Intel', icon: Bookmark },
    ],
    defaultOpen: false,
  },
  {
    title: 'AI & Automation',
    items: [
      { to: '/automation', label: 'Automation', icon: Zap },
      { to: '/drafts', label: 'Drafts', icon: FileEdit },
      { to: '/widgets', label: 'Widgets', icon: LayoutGrid },
    ],
    defaultOpen: false,
  },
  {
    title: 'Settings',
    items: [
      { to: '/platforms', label: 'Platforms', icon: Link2 },
      { to: '/invoices', label: 'Invoices', icon: Receipt },
      { to: '/billing', label: 'Billing', icon: CreditCard },
      { to: '/api-keys', label: 'API Keys', icon: Key },
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
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 14px',
        borderRadius: 6,
        fontSize: '0.82rem',
        fontWeight: 500,
        color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
        background: isActive ? 'rgba(0,168,132,0.08)' : 'transparent',
        textDecoration: 'none',
        transition: 'all 0.15s',
      })}
    >
      <Icon size={16} style={{ flexShrink: 0 }} />
      <span>{label}</span>
    </NavLink>
  );
}

const MOBILE_BREAKPOINT = 768;

export function Shell() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeGroup, setActiveGroup] = useState<string | null>('Overview');
  const [isMobile, setIsMobile] = useState(false);
  const [user, setUser] = useState<{ username: string; plan: string } | null>(null);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < MOBILE_BREAKPOINT;
      setIsMobile(mobile);
      if (mobile) setSidebarOpen(false);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    api.get('/auth/me').then(res => {
      if (res?.data) setUser(res.data);
    }).catch(() => {});
  }, []);

  function toggleGroup(title: string) {
    setActiveGroup(prev => prev === title ? null : title);
  }

  function handleNavClick() {
    if (isMobile) setSidebarOpen(false);
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-base)' }}>
      {/* Mobile overlay */}
      {isMobile && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 99,
          }}
        />
      )}

      {/* Sidebar */}
      <aside
        style={{
          width: sidebarOpen ? 240 : 60,
          flexShrink: 0,
          background: 'var(--bg-elevated)',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          position: isMobile ? 'fixed' : 'sticky',
          top: 0,
          left: 0,
          height: '100vh',
          zIndex: 100,
          transition: 'width 0.2s',
          overflow: 'hidden',
        }}
      >
        {/* Logo */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '16px 14px',
          borderBottom: '1px solid var(--border)',
        }}>
          <div style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: 'var(--accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: '1.1rem',
            color: '#000',
            flexShrink: 0,
          }}>A</div>
          {sidebarOpen && (
            <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>AdForge</span>
          )}
        </div>

        {/* Toggle button */}
        {!isMobile && (
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{
              margin: '8px 14px',
              padding: 8,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-secondary)',
            }}
          >
            {sidebarOpen ? <X size={16} /> : <Menu size={16} />}
          </button>
        )}

        {/* Nav Groups */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '0 8px' }}>
          {navGroups.map(group => (
            <div key={group.title} style={{ marginBottom: 4 }}>
              {sidebarOpen && (
                <button
                  onClick={() => toggleGroup(group.title)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px 6px',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                    color: 'var(--text-tertiary)',
                  }}
                >
                  <span>{group.title}</span>
                  {activeGroup === group.title ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </button>
              )}
              {(sidebarOpen && (activeGroup === group.title || !sidebarOpen)) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {group.items.map(item => (
                    <NavItem key={item.to} to={item.to} label={item.label} icon={item.icon} onClick={handleNavClick} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        {/* User section */}
        {sidebarOpen && user && (
          <div style={{
            padding: '12px 14px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'var(--accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '0.85rem',
              color: '#000',
              flexShrink: 0,
            }}>
              {user.username.charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.username}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <PlanBadge plan={user.plan} />
              </div>
            </div>
            <button
              onClick={() => {
                localStorage.removeItem('adforge_token');
                window.location.href = '/login';
              }}
              style={{
                padding: 6,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-tertiary)',
                display: 'flex',
                alignItems: 'center',
              }}
              title="Logout"
            >
              <LogOut size={16} />
            </button>
          </div>
        )}
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, minWidth: 0 }}>
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  );
}
