import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Megaphone, Settings, LogOut, Menu,
  Library, Activity, FlaskConical, BarChart3, Zap, Eye, GitBranch, LayoutGrid,
  TrendingUp, Bot, FileText, Globe, Users, Link2, FileEdit, Layers, Shield,
} from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { PlanBadge } from '../RequirePro';
import { api } from '../../lib/api';

const navItems = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/campaigns', label: 'Campaigns', icon: Megaphone },
  { to: '/ads', label: 'Ads Manager', icon: Layers },
  { to: '/templates', label: 'Templates', icon: FileText },
  { to: '/drafts', label: 'Drafts', icon: FileEdit },
  { to: '/creative-library', label: 'Creative Library', icon: Library },
  { to: '/creative-fatigue', label: 'Creative Fatigue', icon: Activity },
  { to: '/ab-tests', label: 'A/B Tests', icon: FlaskConical },
  { to: '/reporting', label: 'Reporting', icon: BarChart3 },
  { to: '/automation', label: 'Automation', icon: Zap },
  { to: '/competitors', label: 'Competitors', icon: Eye },
  { to: '/trending', label: 'Trending Ads', icon: TrendingUp },
  { to: '/meta-ai', label: 'Meta AI Chat', icon: Bot },
  { to: '/landing-pages', label: 'Landing Pages', icon: Globe },
  { to: '/audiences', label: 'Audiences', icon: Users },
  { to: '/attribution', label: 'Attribution', icon: GitBranch },
  { to: '/widgets', label: 'Widgets', icon: LayoutGrid },
  { to: '/platforms', label: 'Platforms', icon: Link2 },
  { to: '/audit', label: 'Audit Trail', icon: Shield },
  { to: '/settings', label: 'Settings', icon: Settings },
];

const MOBILE_BREAKPOINT = 768;

export function Shell() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= MOBILE_BREAKPOINT);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < MOBILE_BREAKPOINT);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < MOBILE_BREAKPOINT;
      setIsMobile(mobile);
      if (!mobile) setSidebarOpen(true);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, action: () => void) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      action();
    }
  }, []);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', position: 'relative' }}>
      {/* Mobile overlay */}
      {isMobile && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          onKeyDown={(e) => handleKeyDown(e, () => setSidebarOpen(false))}
          role="button"
          tabIndex={0}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 40,
          }}
        />
      )}

      {/* Sidebar */}
      <aside
        style={{
          width: 240, minWidth: 240, background: 'var(--bg-elevated)',
          borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column',
          position: isMobile ? 'fixed' : 'sticky', top: 0, left: 0, bottom: 0,
          zIndex: 50, transition: 'transform 0.2s',
          transform: sidebarOpen ? 'translateX(0)' : isMobile ? 'translateX(-100%)' : 'translateX(0)',
        }}
      >
        {/* Logo */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--border)' }}>
          <h1 style={{ fontSize: '1.1rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--accent)' }}>
            AdForge
          </h1>
          <p style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', marginTop: 2 }}>Ads Management Platform</p>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/app'}
              onClick={() => isMobile && setSidebarOpen(false)}
              style={({ isActive }): CSSProperties => ({
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 20px', fontSize: '0.8rem', fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                background: isActive ? 'rgba(99,102,241,0.06)' : 'transparent',
                textDecoration: 'none', borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
                transition: 'all 0.15s',
              })}
            >
              <item.icon size={16} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* User Info & Plan */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
              {api.getUser()?.username || 'User'}
            </span>
            <PlanBadge />
          </div>
          <button
            onClick={() => { localStorage.clear(); navigate('/login'); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%',
              padding: '8px 0', background: 'none', border: 'none',
              color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '0.8rem',
            }}
          >
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflow: 'auto', height: '100vh' }}>
        {/* Mobile header */}
        {isMobile && (
          <div style={{
            display: 'flex', alignItems: 'center', padding: '12px 16px',
            borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)',
          }}>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', padding: 4 }}
            >
              <Menu size={20} />
            </button>
            <span style={{ fontWeight: 700, fontSize: '0.9rem', marginLeft: 12, color: 'var(--accent)' }}>AdForge</span>
          </div>
        )}
        <div style={{ padding: isMobile ? '16px' : '20px 24px', maxWidth: 1400 }}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
