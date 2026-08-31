import { Link } from 'react-router-dom';
import {
  Brain, ShieldCheck, Target, Layers, BarChart3, ArrowRight,
  Gauge, Wallet, Zap, Building2, Users, Lock, Server,
  KeyRound, Unlock, CheckCircle2, ChevronRight, User,
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

// Conversion tracking — gtag/dataLayer wired in index.html (GA4 G-V9C14XZ9SG)
function track(eventName: string, payload: Record<string, string | number | boolean> = {}) {
  const w = window as unknown as { gtag?: (..._args: unknown[]) => void; dataLayer?: unknown[] };
  if (localStorage.getItem('1ai-ads_cookie_consent') !== 'accepted') return;
  w.dataLayer?.push({ event: eventName, ...payload });
  w.gtag?.('event', eventName, payload);
}

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

function SectionHead({ kicker, children }: { kicker: string; children: React.ReactNode }) {
  return (
    <div style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto 48px' }}>
      <div style={{
        fontFamily: C.mono, fontSize: '0.72rem', letterSpacing: '0.18em', textTransform: 'uppercase',
        color: C.accent, marginBottom: 12,
      }}>{kicker}</div>
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
  {
    icon: Wallet,
    title: 'Budget Control & Guardrails',
    desc: 'Per-platform caps, approval thresholds, and automated spend alerts. The AI can suggest — it can never exceed the limits you set.',
  },
  {
    icon: Zap,
    title: 'API-First Automation',
    desc: 'Every campaign, creative, and report is API-addressable. Push events to your stack, trigger flows from performance, build on top of the platform.',
  },
];

const PLATFORMS = [
  'Meta', 'Google', 'TikTok', 'LinkedIn', 'Pinterest', 'Snapchat', 'Microsoft',
  'Twitter / X', 'Reddit', 'Amazon', 'Spotify', 'Apple', 'Criteo', 'Yandex',
  'Baidu', 'Kakao', 'LINE', 'The Trade Desk', 'Taboola', 'WhatsApp',
];

const PAINS = [
  {
    title: 'Siloed dashboards',
    desc: 'Meta, Google, TikTok… each with its own UI, its own reporting, and its own version of the truth. Joining them up becomes a spreadsheet job.',
  },
  {
    title: 'Budget bleed',
    desc: 'Winning ad sets starve while losers quietly eat spend. Fixing it means someone watching delivery every single day — or paying for it in CPA.',
  },
  {
    title: 'Creative churn',
    desc: 'Audiences fatigue fast. Without detection, your winning assets decay and nobody notices until the numbers have already moved.',
  },
];

const STEPS = [
  {
    n: '01',
    title: 'Connect',
    desc: 'OAuth your accounts across 20+ channels — Meta, Google, TikTok, LinkedIn, and more. Credentials stay inside your own infrastructure.',
  },
  {
    n: '02',
    title: 'Generate',
    desc: 'Tell the AI the goal in plain language. It drafts campaign structures, budgets, and creative with reasoning attached to every suggestion.',
  },
  {
    n: '03',
    title: 'Approve & optimize',
    desc: 'Review drafts, approve what ships. The Pareto engine then reallocates budget toward the ad sets that actually perform.',
  },
];

const DEEP_DIVES = [
  {
    icon: Brain,
    title: 'AI Campaign Manager',
    points: [
      'Drafts a full campaign structure from a one-line goal',
      'Budgets and sequences spend across connected platforms',
      'Refines targeting and bids from live delivery data',
    ],
  },
  {
    icon: Gauge,
    title: 'Auto-Optimizer — Pareto Engine',
    points: [
      'Scans spend and delivery continuously, not weekly',
      'Reallocates budget toward proven winners automatically',
      'Rules and win conditions you define — the engine executes them',
    ],
  },
  {
    icon: ShieldCheck,
    title: 'Approval Workflow',
    points: [
      'Every AI action lands in Drafts first — never live by default',
      'Reasoning attached so you approve with context, not blind trust',
      'Approve, edit, or archive from one queue; full audit trail',
    ],
  },
];

const AUDIENCES = [
  {
    icon: User,
    title: 'Solo media buyers',
    desc: 'Run a dozen channels without a twelve-person team. The AI drafts, you decide, the engine optimizes overnight.',
  },
  {
    icon: Users,
    title: 'Growth teams',
    desc: 'Unified reporting and an approval chain your whole team can see. Strategy stays in your heads, execution moves itself.',
  },
  {
    icon: Building2,
    title: 'Agencies',
    desc: 'White-label the workflow, keep creative and strategy in-house, and scale account count without scaling headcount.',
  },
];

const SECURITY = [
  {
    icon: Server,
    title: 'Self-hosted',
    desc: 'Runs in your own infrastructure. One container, no vendor SaaS lock-in.',
  },
  {
    icon: KeyRound,
    title: 'Owned credentials',
    desc: 'OAuth tokens and API keys stay on your server — never copied to a cloud.',
  },
  {
    icon: Lock,
    title: 'Approval gate',
    desc: 'AI proposes, you dispose. Nothing launches or spends without your OK.',
  },
  {
    icon: Unlock,
    title: 'No lock-in',
    desc: 'Plain database, open API, configurable LLM gateway. Leave any time, data intact.',
  },
];

const FAQS = [
  {
    q: 'Does my data ever leave my server?',
    a: 'No. AdForge is self-hosted — accounts, campaigns, and reporting live in your infrastructure. AI reasoning goes through the LLM gateway you configure (or your own local models).',
  },
  {
    q: 'Which platforms are supported?',
    a: '20+ channels out of the box: Meta, Google, TikTok, LinkedIn, Pinterest, Snapchat, Microsoft, Twitter/X, Reddit, Amazon, Spotify, Apple, Criteo, Yandex, Baidu, Kakao, LINE, The Trade Desk, Taboola, and WhatsApp.',
  },
  {
    q: 'Does the AI ever spend money on its own?',
    a: 'No. Every AI-suggested campaign lands in Drafts with reasoning attached. A human approves before anything goes live — and budget guardrails cap what even a rogue draft could spend.',
  },
  {
    q: 'Do I need a dev team to run it?',
    a: 'No. One docker-compose up and an included admin UI. Connect accounts through OAuth, never touching credentials by hand.',
  },
  {
    q: 'Can I try it before committing?',
    a: 'Yes — sign in with the seeded demo account and explore the full flow: AI drafts, approval queue, optimizer, and reporting with sample data.',
  },
];

export function LandingPage() {
  const navLink: React.CSSProperties = {
    color: C.textSec, fontSize: '0.85rem', textDecoration: 'none', padding: '8px 12px', borderRadius: 8,
    transition: 'color 0.15s',
  };
  const ctaLink: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none',
    background: C.accent, color: C.bgDeep, fontWeight: 800, fontSize: '0.95rem',
    padding: '13px 26px', borderRadius: 10,
  };
  const ghostLink: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', textDecoration: 'none',
    color: C.text, fontSize: '0.95rem', fontWeight: 600,
    padding: '13px 26px', borderRadius: 10, border: `1px solid ${C.border}`,
  };

  const mockRows = [
    { platform: 'META', name: 'Launch — Spring Collection', status: 'DRAFT', score: 82, budget: '$1,200/d' },
    { platform: 'GOOGLE', name: 'Brand — Search', status: 'ACTIVE', score: 94, budget: '$800/d' },
    { platform: 'TIKTOK', name: 'UGC — Creator Test A/B', status: 'DRAFT', score: 71, budget: '$450/d' },
    { platform: 'LINKEDIN', name: 'ABM — Top 200 Accounts', status: 'ACTIVE', score: 88, budget: '$900/d' },
  ];

  return (
    <div style={{ background: C.bgDeep, color: C.text, fontFamily: C.font, minHeight: '100vh' }}>
      <style>{`
        .af-card{transition:transform .2s,border-color .2s,box-shadow .2s}
        .af-card:hover{transform:translateY(-3px);border-color:rgba(0,229,255,.45);box-shadow:0 14px 34px rgba(0,229,255,.07)}
        .af-step{transition:transform .2s,border-color .2s}
        .af-step:hover{transform:translateY(-2px);border-color:rgba(0,229,255,.3)}
        details.af-faq{border:1px solid ${C.border};border-radius:12px;background:${C.bgElev};padding:0 20px;transition:border-color .2s}
        details.af-faq[open]{border-color:rgba(0,229,255,.4)}
        details.af-faq summary{cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 0;font-weight:600;font-size:.95rem}
        details.af-faq summary::-webkit-details-marker{display:none}
        details.af-faq p{padding:0 0 20px;margin:0;color:${C.textSec};font-size:.88rem;line-height:1.65}
        .af-chev{transition:transform .2s,color .2s;color:${C.textDim};flex-shrink:0}
        details.af-faq[open] .af-chev{transform:rotate(90deg);color:${C.accent}}
        .af-dot{animation:afPulse 1.6s ease-in-out infinite}
        @keyframes afPulse{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(0,229,255,.35)}50%{opacity:.55;box-shadow:0 0 0 6px rgba(0,229,255,0)}}
        .af-glow{animation:afFloat 7s ease-in-out infinite}
        @keyframes afFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
      `}</style>

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
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <a href="#features" style={navLink} onMouseEnter={e => (e.currentTarget.style.color = C.text)} onMouseLeave={e => (e.currentTarget.style.color = C.textSec)}>Features</a>
            <a href="#how" style={navLink} onMouseEnter={e => (e.currentTarget.style.color = C.text)} onMouseLeave={e => (e.currentTarget.style.color = C.textSec)}>How it works</a>
            <a href="#product" style={navLink} onMouseEnter={e => (e.currentTarget.style.color = C.text)} onMouseLeave={e => (e.currentTarget.style.color = C.textSec)}>Product</a>
            <a href="#faq" style={navLink} onMouseEnter={e => (e.currentTarget.style.color = C.text)} onMouseLeave={e => (e.currentTarget.style.color = C.textSec)}>FAQ</a>
            <Link to="/login" style={{ color: C.textSec, fontSize: '0.85rem', textDecoration: 'none', padding: '8px 14px' }}>Sign In</Link>
            <Link to="/login" onClick={() => track('sign_in_click', { location: 'nav' })} style={{
              background: C.accent, color: C.bgDeep, textDecoration: 'none', fontSize: '0.85rem', fontWeight: 700,
              padding: '9px 18px', borderRadius: 8, transition: 'opacity 0.15s',
            }} onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')} onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
              Launch AdForge
            </Link>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '80px 24px 40px', textAlign: 'center' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          fontFamily: C.mono, fontSize: '0.72rem', letterSpacing: '0.14em', textTransform: 'uppercase',
          color: C.accent, background: C.accentSoft, border: `1px solid ${C.accent}33`,
          padding: '6px 14px', borderRadius: 999, marginBottom: 28,
        }}>
          <span className="af-dot" style={{ width: 6, height: 6, borderRadius: 999, background: C.accent, display: 'inline-block' }} />
          Self-hosted · AI-first · 20+ ad platforms
        </div>
        <h1 style={{
          fontSize: 'clamp(2.6rem, 6vw, 4.4rem)', fontWeight: 800, letterSpacing: '-0.035em',
          margin: 0, lineHeight: 1.05,
        }}>
          Paid ads on autopilot.<br />
          <span style={{ color: C.accent }}>Final say stays yours.</span>
        </h1>
        <p style={{ fontSize: '1.12rem', color: C.textSec, maxWidth: 640, margin: '24px auto 36px', lineHeight: 1.65 }}>
          AdForge plans, drafts, and scales campaigns across 20+ platforms with AI — then
          waits for your approval before a single dollar moves. Your accounts, your data,
          your decision on every launch.
        </p>
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/login" onClick={() => track('get_started_click', { location: 'hero' })} style={ctaLink}>
            Launch AdForge <ArrowRight size={17} />
          </Link>
          <a href="#how" style={ghostLink}>See how it works</a>
        </div>

        {/* Stats row — real capabilities */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12,
          maxWidth: 760, margin: '48px auto 0',
        }}>
          {[
            ['20+', 'platforms, one workspace'],
            ['1', 'approval gate before every launch'],
            ['0', 'data leaves your server'],
            ['100%', 'self-hosted, no lock-in'],
          ].map(([v, l]) => (
            <div key={l} style={{ background: C.bgElev, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 12px' }}>
              <div style={{ fontFamily: C.mono, fontSize: '1.35rem', fontWeight: 700, color: C.accent }}>{v}</div>
              <div style={{ fontSize: '0.74rem', color: C.textSec, marginTop: 4, lineHeight: 1.4 }}>{l}</div>
            </div>
          ))}
        </div>

        {/* Product mockup */}
        <div style={{ position: 'relative', maxWidth: 760, margin: '56px auto 0' }}>
          <div className="af-glow" style={{
            position: 'absolute', inset: '-40px -60px', zIndex: 0,
            background: 'radial-gradient(ellipse at 50% 40%, rgba(0,229,255,0.14) 0%, rgba(0,229,255,0.03) 45%, transparent 70%)',
            filter: 'blur(30px)', pointerEvents: 'none',
          }} />
          <div style={{
            position: 'relative', zIndex: 1, textAlign: 'left',
            background: C.bgSurface, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden',
            boxShadow: '0 30px 80px rgba(0,0,0,0.45)',
          }}>
            {/* Mockup browser chrome */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: `1px solid ${C.border}`, background: C.bgElev }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 999, background: '#3a4560' }} />
                <span style={{ width: 10, height: 10, borderRadius: 999, background: '#3a4560' }} />
                <span style={{ width: 10, height: 10, borderRadius: 999, background: '#3a4560' }} />
              </div>
              <div style={{ flex: 1, fontFamily: C.mono, fontSize: '0.72rem', color: C.textDim, textAlign: 'center' }}>
                adforge — Campaigns
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: C.mono, fontSize: '0.64rem', color: C.accent, background: C.accentSoft, padding: '4px 10px', borderRadius: 999 }}>
                <span className="af-dot" style={{ width: 5, height: 5, borderRadius: 999, background: C.accent, display: 'inline-block' }} />
                AI · LIVE
              </div>
            </div>
            {/* Campaign rows */}
            <div>
              {mockRows.map(r => (
                <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px', borderBottom: `1px solid ${C.border}`, background: r.status === 'ACTIVE' ? 'rgba(34,197,94,0.03)' : undefined }}>
                  <span style={{ fontFamily: C.mono, fontSize: '0.62rem', color: C.textDim, width: 74, flexShrink: 0 }}>{r.platform}</span>
                  <span style={{ flex: 1, fontSize: '0.85rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                  <span style={{
                    fontFamily: C.mono, fontSize: '0.6rem', letterSpacing: '0.08em',
                    padding: '3px 8px', borderRadius: 6,
                    color: r.status === 'ACTIVE' ? '#34d399' : '#fbbf24',
                    background: r.status === 'ACTIVE' ? 'rgba(52,211,153,0.1)' : 'rgba(251,191,36,0.1)',
                    border: `1px solid ${r.status === 'ACTIVE' ? 'rgba(52,211,153,0.35)' : 'rgba(251,191,36,0.35)'}`,
                  }}>{r.status}</span>
                  <div style={{ width: 110, flexShrink: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: C.mono, fontSize: '0.6rem', color: C.textSec, marginBottom: 4 }}>
                      <span>AI score</span>
                      <span style={{ color: C.accent }}>{r.score}</span>
                    </div>
                    <div style={{ height: 5, borderRadius: 999, background: C.border, overflow: 'hidden' }}>
                      <div style={{ width: `${r.score}%`, height: '100%', borderRadius: 999, background: `linear-gradient(90deg, ${C.accent}55, ${C.accent})` }} />
                    </div>
                  </div>
                  <span style={{ fontFamily: C.mono, fontSize: '0.68rem', color: C.textSec, width: 74, textAlign: 'right', flexShrink: 0 }}>{r.budget}</span>
                </div>
              ))}
            </div>
            {/* Mockup footer */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px', background: C.bgElev }}>
              <span style={{ fontFamily: C.mono, fontSize: '0.68rem', color: C.textDim }}>
                Pareto engine: reallocated $320 → winning ad set · sleeping budget, awake
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: C.mono, fontSize: '0.64rem', color: '#34d399' }}>
                <CheckCircle2 size={13} /> APPROVED BY YOU · 07:42
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Platform strip */}
      <section style={{ borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, background: C.bgElev, padding: '28px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontFamily: C.mono, fontSize: '0.66rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: C.textDim, marginBottom: 16 }}>
            One workspace · every channel you already buy
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '10px 26px' }}>
            {PLATFORMS.map(p => (
              <span key={p} style={{ fontFamily: C.mono, fontSize: '0.78rem', color: C.textDim, whiteSpace: 'nowrap' }}>{p}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Problem */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '88px 24px 24px' }}>
        <SectionHead kicker="The problem">Why ad ops eats your week</SectionHead>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
          {PAINS.map(p => (
            <div key={p.title} className="af-card" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24 }}>
              <h3 style={{ fontSize: '1.02rem', fontWeight: 700, margin: '0 0 8px', letterSpacing: '-0.01em' }}>{p.title}</h3>
              <p style={{ fontSize: '0.86rem', color: C.textSec, lineHeight: 1.6, margin: 0 }}>{p.desc}</p>
            </div>
          ))}
        </div>
        <p style={{ textAlign: 'center', color: C.textSec, fontSize: '0.92rem', margin: '36px auto 0' }}>
          AdForge exists because this shouldn't be a second job. <span style={{ color: C.accent, fontWeight: 700 }}>It shouldn't.</span>
        </p>
      </section>

      {/* How it works */}
      <section id="how" style={{ maxWidth: 1100, margin: '0 auto', padding: '88px 24px 24px' }}>
        <SectionHead kicker="How it works">From idea to live campaign in three steps</SectionHead>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
          {STEPS.map(s => (
            <div key={s.n} className="af-step" style={{ background: C.bgElev, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24, position: 'relative' }}>
              <div style={{ fontFamily: C.mono, fontSize: '0.78rem', color: C.accent, marginBottom: 14 }}>{s.n}</div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0 0 8px' }}>{s.title}</h3>
              <p style={{ fontSize: '0.86rem', color: C.textSec, lineHeight: 1.6, margin: 0 }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Product deep dive */}
      <section id="product" style={{ maxWidth: 1100, margin: '0 auto', padding: '88px 24px 24px' }}>
        <SectionHead kicker="Under the hood">What you actually get</SectionHead>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {DEEP_DIVES.map((d, idx) => {
            const Icon = d.icon;
            return (
              <div key={d.title} className="af-card" style={{
                display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 20, alignItems: 'start',
                background: C.bgElev, border: `1px solid ${C.border}`, borderRadius: 16, padding: 26,
              }}>
                <div style={{
                  width: 46, height: 46, borderRadius: 12, background: C.accentSoft,
                  color: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Icon size={22} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>{d.title}</h3>
                    <span style={{ fontFamily: C.mono, fontSize: '0.6rem', color: C.textDim, letterSpacing: '0.1em' }}>0{idx + 1}</span>
                  </div>
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {d.points.map(pt => (
                      <li key={pt} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: '0.88rem', color: C.textSec, lineHeight: 1.55 }}>
                        <CheckCircle2 size={16} style={{ color: C.accent, flexShrink: 0, marginTop: 2 }} />
                        <span>{pt}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Features grid */}
      <section id="features" style={{ maxWidth: 1100, margin: '0 auto', padding: '88px 24px 24px' }}>
        <SectionHead kicker="Features">Everything a modern ads team needs, self-hosted</SectionHead>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18 }}>
          {FEATURES.map(f => {
            const Icon = f.icon;
            return (
              <div key={f.title} className="af-card" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24 }}>
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

      {/* Security */}
      <section id="security" style={{ maxWidth: 1100, margin: '0 auto', padding: '88px 24px 24px' }}>
        <SectionHead kicker="Security">Your data stays yours</SectionHead>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 18 }}>
          {SECURITY.map(s => {
            const Icon = s.icon;
            return (
              <div key={s.title} className="af-card" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 22 }}>
                <Icon size={20} style={{ color: C.accent, marginBottom: 12 }} />
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '0 0 6px' }}>{s.title}</h3>
                <p style={{ fontSize: '0.82rem', color: C.textSec, lineHeight: 1.55, margin: 0 }}>{s.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Who it's for */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '88px 24px 24px' }}>
        <SectionHead kicker="Who it's for">Built for how you actually buy media</SectionHead>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
          {AUDIENCES.map(a => {
            const Icon = a.icon;
            return (
              <div key={a.title} className="af-card" style={{ background: C.bgElev, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24 }}>
                <div style={{
                  width: 42, height: 42, borderRadius: 10, background: C.accentSoft,
                  color: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
                }}>
                  <Icon size={20} />
                </div>
                <h3 style={{ fontSize: '1.02rem', fontWeight: 700, margin: '0 0 8px' }}>{a.title}</h3>
                <p style={{ fontSize: '0.86rem', color: C.textSec, lineHeight: 1.6, margin: 0 }}>{a.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" style={{ maxWidth: 760, margin: '0 auto', padding: '88px 24px 24px' }}>
        <SectionHead kicker="FAQ">Questions prospects ask</SectionHead>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {FAQS.map(f => (
            <details key={f.q} className="af-faq">
              <summary>
                {f.q}
                <ChevronRight size={16} className="af-chev" />
              </summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Final CTA band */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '80px 24px' }}>
        <div style={{
          background: 'linear-gradient(135deg, #0a1428 0%, #0a0f1d 55%, #060b14 100%)',
          border: `1px solid ${C.border}`, borderRadius: 20, padding: '56px 32px', textAlign: 'center',
        }}>
          <h2 style={{ fontSize: '1.9rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
            Take control of your ad spend.
          </h2>
          <p style={{ color: C.textSec, fontSize: '1rem', maxWidth: 540, margin: '14px auto 28px', lineHeight: 1.6 }}>
            Your data, your platform, your decision on every dollar. Sign in and turn on the AI —
            or keep it manual. Your call.
          </p>
          <Link to="/login" onClick={() => track('get_started_click', { location: 'final_cta' })} style={ctaLink}>
            Get Started <ArrowRight size={17} />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: `1px solid ${C.border}`, padding: '40px 24px 32px', background: C.bgElev }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 32 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <LogoMark size={22} />
              <span style={{ fontSize: '0.95rem', fontWeight: 800 }}>
                Ad<span style={{ color: C.accent }}>Forge</span>
              </span>
            </div>
            <p style={{ fontSize: '0.82rem', color: C.textDim, lineHeight: 1.6, margin: 0, maxWidth: 260 }}>
              Self-hosted, AI-first ad management. Plan, draft, approve, optimize — with you in control.
            </p>
          </div>
          <div>
            <div style={{ fontFamily: C.mono, fontSize: '0.64rem', letterSpacing: '0.16em', textTransform: 'uppercase', color: C.textDim, marginBottom: 12 }}>Product</div>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <a href="#features" style={{ color: C.textSec, fontSize: '0.84rem', textDecoration: 'none' }}>Features</a>
              <a href="#how" style={{ color: C.textSec, fontSize: '0.84rem', textDecoration: 'none' }}>How it works</a>
              <a href="#security" style={{ color: C.textSec, fontSize: '0.84rem', textDecoration: 'none' }}>Security</a>
              <a href="#faq" style={{ color: C.textSec, fontSize: '0.84rem', textDecoration: 'none' }}>FAQ</a>
            </nav>
          </div>
          <div>
            <div style={{ fontFamily: C.mono, fontSize: '0.64rem', letterSpacing: '0.16em', textTransform: 'uppercase', color: C.textDim, marginBottom: 12 }}>Legal</div>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Link to="/privacy" style={{ color: C.textSec, fontSize: '0.84rem', textDecoration: 'none' }}>Privacy</Link>
              <Link to="/terms" style={{ color: C.textSec, fontSize: '0.84rem', textDecoration: 'none' }}>Terms</Link>
              <Link to="/login" onClick={() => track('sign_in_click', { location: 'footer' })} style={{ color: C.textSec, fontSize: '0.84rem', textDecoration: 'none' }}>Sign In</Link>
            </nav>
          </div>
        </div>
        <div style={{ maxWidth: 1100, margin: '32px auto 0', paddingTop: 20, borderTop: `1px solid ${C.border}` }}>
          <span style={{ fontSize: '0.78rem', color: C.textDim }}>
            AdForge © {new Date().getFullYear()} — Self-hosted. Your data stays yours.
          </span>
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;