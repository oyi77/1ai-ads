import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Megaphone, Settings, LogOut, Menu,
  Library, Activity, FlaskConical, BarChart3, Zap, Eye, GitBranch, LayoutGrid,
} from 'lucide-react';
import { useState } from 'react';

const navItems = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/campaigns', label: 'Campaigns', icon: Megaphone },
  { to: '/creative-library', label: 'Creative Library', icon: Library },
  { to: '/creative-fatigue', label: 'Creative Fatigue', icon: Activity },
  { to: '/ab-tests', label: 'A/B Tests', icon: FlaskConical },
  { to: '/reporting', label: 'Reporting', icon: BarChart3 },
  { to: '/automation', label: 'Automation', icon: Zap },
  { to: '/competitors', label: 'Competitors', icon: Eye },
  { to: '/attribution', label: 'Attribution', icon: GitBranch },
  { to: '/widgets', label: 'Widgets', icon: LayoutGrid },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function Shell() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const navigate = useNavigate();

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar */}
      <aside style={{
        width: sidebarOpen ? 240 : 60,
        background: 'var(--bg)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.2s',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--border)' }}>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <Menu size={20} />
          </button>
          {sidebarOpen && <span style={{ fontWeight: 700, fontSize: '1rem' }}>Ad<span style={{ color: 'var(--accent)' }}>Forge</span></span>}
        </div>

        <nav style={{ flex: 1, padding: '12px 8px', overflowY: 'auto' }}>
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                borderRadius: 8, textDecoration: 'none', marginBottom: 4,
                color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                background: isActive ? 'var(--accent-soft)' : 'transparent',
                borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
                fontSize: '0.85rem', fontWeight: isActive ? 600 : 400,
                transition: 'all 0.15s',
              })}
            >
              <item.icon size={18} />
              {sidebarOpen && item.label}
            </NavLink>
          ))}
        </nav>

        <div style={{ padding: '12px', borderTop: '1px solid var(--border)' }}>
          <button
            onClick={() => { localStorage.removeItem('1ai-ads_token'); navigate('/login'); }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '0.8rem', width: '100%' }}
          >
            <LogOut size={16} />
            {sidebarOpen && 'Logout'}
          </button>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflow: 'auto' }}>
        <header style={{ height: 48, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 24px', background: 'var(--bg)' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>AdForge</span>
        </header>
        <div style={{ padding: 24 }}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
