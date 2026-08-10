import { Link } from 'react-router-dom';
import {
  Brain, ShieldCheck, Target, Layers, BarChart3, ArrowRight,
  Sparkles, Gauge,
} from 'lucide-react';

// Brand tokens (mirror index.css)
const C = {
  bgDeep: '#060b14',
  bgElev: '#0a0f1d',
  bgSurface: '#0f1527',
  card: '#111a2e',
  border: '#1a2238',
  accent: '#00e5ff',
  accentSoft: 'rgba(0,229,255,0.12)',
  text: '#e8edf5',
  textSec: '#8892a8',
  textDim: '#4b5468',
  font: "'Inter', system-ui, sans-serif",
  mono: "'JetBrains Mono', monospace",
};

function LogoMark({ size = 30 }: { size?: number }) {
  // Same geometry as public/favicon.svg
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="62" height="62" rx="12" fill={C.bgSurface} stroke={C.border} strokeWidth="2" />
      <path d="M32 8 A24 24 0 0 1 56 32" stroke={C.accent} strokeWidth="4" strokeLinecap="round" fill="none" />
      <path d="M32 56 A24 24 0 0 1 8 32" stroke={C.accent} strokeOpacity="0.35" strokeWidth="4" strokeLinecap="round" fill="none" />
      <polygon points="32,16 44,32 32,44 20,32" stroke={C.accent} strokeWidth="2.5" strokeLinejoin="round" fill="none" />
      <circle cx="32" cy="32" r="4" fill={C.accent} />
      <circle cx="56" cy="32" r="3" fill={C.accent} />
      <circle cx="8" cy="32" r="3" fill={C.accent} fillOpacity="0.35" />
    </svg>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto 48px' }}>
      <div style={{
        fontFamily: C.mono, fontSize: '0.72rem', letterSpacing: '0.18em', textTransform: 'uppercase',
        color: C.accent, marginBottom: 12,
      }}>WHAT'S INSIDE</div>
      <h2 style={{ fontSize: '2rem', fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.02em' }}>{children}</h2>
    </div>
  );
}

const FEATURES = [
  {
    icon: Brain,
    title: 'AI Campaign Manager',
    desc: 'Describe the goal — the orchestrator drafts, budgets, and sequences campaigns across your connected platforms, then refines them from live results.',
  },
  {
    icon: ShieldCheck,
    title: 'Draft-First Approval',
    desc: 'Nothing ships without a human check. Every AI-suggested campaign lands in Drafts with reasoning attached — approve, edit, or archive.',
  },
  {
    icon: Gauge,
    title: 'Auto-Optimizer (Pareto Engine)',
    desc: 'Scans spend and delivery, then reallocates budget toward the ad sets and audiences that actually perform. Rules you set, win conditions you define.',
  },
  {
    icon: Target,
    title: 'Strategy Brain via MCP',
    desc: 'A pluggable AI strategy layer turns ad performance, competitor data, and audience intelligence into concrete moves — not generic advice.',
  },
  {
    icon: Layers,
    title: 'Creative Library & Generator',
    desc: 'Drag, generate, and version-test ad creative across the fleet. Fatigue detection flags worn-out assets before your CPA inflates.',
  },
  {
    icon: BarChart3,
    title: 'Unified Reporting & Attribution',
    desc: 'One pane for Meta, Google, TikTok, and 16 more platforms. A/B tests, landing pages, widgets, and cross-platform attribution in the same place.',
  },
];

const PLATFORMS = [
  'Meta', 'Google', 'TikTok', 'LinkedIn', 'Pinterest', 'Snapchat', 'Microsoft',
  'Twitter / X', 'Reddit', 'Amazon', 'Spotify', 'Apple', 'Criteo', 'Yandex',
  'Baidu', 'Kakao', 'LINE', 'The Trade Desk', 'Taboola', 'WhatsApp',
];

export function LandingPage() {
  return (
    <div style={{ background: C.bgDeep, color: C.text, fontFamily: C.font, minHeight: '100vh' }}>
      {/* Nav */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: 'rgba(6,11,20,0.85)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        borderBottom: `1px solid ${C.border}`,
      }}>
        <nav style={{ maxWidth: 1100, margin: '0 auto', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: C.text }}>
            <LogoMark size={30} />
            <span style={{ fontSize: '1.05rem', fontWeight: 800, letterSpacing: '-0.01em' }}>
              Ad<span style={{ color: C.accent }}>Forge</span>
            </span>
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <a href="#features" style={{ color: C.textSec, fontSize: '0.85rem', textDecoration: 'none', padding: '8px 14px', borderRadius: 8, transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = C.text)} onMouseLeave={e => (e.currentTarget.style.color = C.textSec)}>
              Features
            </a>
            <Link to="/login" style={{
              background: C.accent, color: C.bgDeep, textDecoration: 'none', fontSize: '0.85rem', fontWeight: 700,
              padding: '9px 18px', borderRadius: 8, transition: 'opacity 0.15s',
            }} onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')} onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
              Sign In
            </Link>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '88px 24px 64px', textAlign: 'center' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          fontFamily: C.mono, fontSize: '0.72rem', letterSpacing: '0.14em', textTransform: 'uppercase',
          color: C.accent, background: C.accentSoft, border: `1px solid ${C.accent}33`,
          padding: '6px 14px', borderRadius: 999, marginBottom: 28,
        }}>
          <Sparkles size={13} /> Self-hosted · AI-first · 20+ ad platforms
        </div>
        <h1 style={{
          fontSize: 'clamp(2.6rem, 6vw, 4.4rem)', fontWeight: 800, letterSpacing: '-0.035em',
          margin: 0, lineHeight: 1.05,
        }}>
          AI Ads OS.<br />
          <span style={{ color: C.accent }}>You own it.</span>
        </h1>
        <p style={{ fontSize: '1.12rem', color: C.textSec, maxWidth: 620, margin: '24px auto 36px', lineHeight: 1.65 }}>
          AdForge plans, drafts, and scales paid campaigns across every major platform
          with AI — while keeping a human approval gate between every suggestion and your budget.
        </p>
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/login" style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none',
            background: C.accent, color: C.bgDeep, fontWeight: 800, fontSize: '0.95rem',
            padding: '13px 26px', borderRadius: 10,
          }}>
            Launch AdForge <ArrowRight size={17} />
          </Link>
          <a href="#features" style={{
            display: 'inline-flex', alignItems: 'center', textDecoration: 'none',
            color: C.text, fontSize: '0.95rem', fontWeight: 600,
            padding: '13px 26px', borderRadius: 10, border: `1px solid ${C.border}`,
          }}>
            See what's inside
          </a>
        </div>
      </section>

      {/* Platform strip */}
      <section style={{ borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, background: C.bgElev, padding: '26px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '10px 26px' }}>
          {PLATFORMS.map(p => (
            <span key={p} style={{ fontFamily: C.mono, fontSize: '0.78rem', color: C.textDim, whiteSpace: 'nowrap' }}>{p}</span>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" style={{ maxWidth: 1100, margin: '0 auto', padding: '88px 24px 24px' }}>
        <SectionTitle>Everything a modern ads team needs, self-hosted</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18 }}>
          {FEATURES.map(f => {
            const Icon = f.icon;
            return (
              <div key={f.title} style={{
                background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
                padding: 24, transition: 'border-color 0.2s, transform 0.2s',
              }} onMouseEnter={e => {
                e.currentTarget.style.borderColor = `${C.accent}66`;
                e.currentTarget.style.transform = 'translateY(-2px)';
              }} onMouseLeave={e => {
                e.currentTarget.style.borderColor = C.border;
                e.currentTarget.style.transform = 'translateY(0)';
              }}>
                <div style={{
                  width: 42, height: 42, borderRadius: 10, background: C.accentSoft,
                  color: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
                }}>
                  <Icon size={20} />
                </div>
                <h3 style={{ fontSize: '1.02rem', fontWeight: 700, margin: '0 0 8px', letterSpacing: '-0.01em' }}>{f.title}</h3>
                <p style={{ fontSize: '0.86rem', color: C.textSec, lineHeight: 1.6, margin: 0 }}>{f.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* CTA band */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '80px 24px' }}>
        <div style={{
          background: 'linear-gradient(135deg, #0a1428 0%, #0a0f1d 55%, #060b14 100%)',
          border: `1px solid ${C.border}`, borderRadius: 20, padding: '56px 32px', textAlign: 'center',
        }}>
          <h2 style={{ fontSize: '1.9rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
            Take control of your ad spend.
          </h2>
          <p style={{ color: C.textSec, fontSize: '1rem', maxWidth: 520, margin: '14px auto 28px', lineHeight: 1.6 }}>
            Your data, your platform, your decision on every dollar. Sign in and turn on the AI — or keep it manual. Your call.
          </p>
          <Link to="/login" style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none',
            background: C.accent, color: C.bgDeep, fontWeight: 800, fontSize: '0.95rem',
            padding: '13px 26px', borderRadius: 10,
          }}>
            Get Started <ArrowRight size={17} />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: `1px solid ${C.border}`, padding: '32px 24px', background: C.bgElev }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <LogoMark size={22} />
            <span style={{ fontSize: '0.85rem', color: C.textDim }}>
              AdForge © {new Date().getFullYear()} — Self-hosted. Your data stays yours.
            </span>
          </div>
          <nav style={{ display: 'flex', gap: 18 }}>
            <Link to="/privacy" style={{ color: C.textSec, fontSize: '0.82rem', textDecoration: 'none' }}>Privacy</Link>
            <Link to="/terms" style={{ color: C.textSec, fontSize: '0.82rem', textDecoration: 'none' }}>Terms</Link>
            <Link to="/login" style={{ color: C.textSec, fontSize: '0.82rem', textDecoration: 'none' }}>Sign In</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;