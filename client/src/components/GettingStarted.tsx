import { Rocket } from 'lucide-react';

const STEPS = [
  { num: '1', icon: '\u{1F50C}', title: 'Hubungkan Akun Meta', desc: 'Tempel access token dari Business Manager', link: '/platforms', cta: 'Connect' },
  { num: '2', icon: '\u{1F4E5}', title: 'Sinkronkan Campaign', desc: 'Impor campaign yang sudah ada dari Meta', link: '/campaigns', cta: 'Sync' },
  { num: '3', icon: '\u{1F680}', title: 'Buat Campaign Pertama', desc: 'AI bantu tulis copy, Anda yang setujui', link: '/campaigns', cta: 'Create' },
];

export function GettingStarted() {
  const dismiss = () => {
    try { localStorage.setItem('adforge_guide_dismissed', '1'); } catch {}
    window.dispatchEvent(new Event('adforge-guide-dismissed'));
    window.location.reload();
  };

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(99,102,241,0.06), rgba(99,102,241,0.02))',
      border: '1px solid var(--accent)', borderRadius: 14,
      padding: '24px 28px', marginBottom: 24,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Rocket size={20} color="var(--accent)" />
          <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>Mulai dalam 3 Langkah</h2>
        </div>
        <button onClick={dismiss}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '0.75rem' }}>
          ✕ Tutup
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        {STEPS.map(step => (
          <a key={step.num} href={step.link} style={{
            display: 'block', background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            borderRadius: 10, padding: 16, textDecoration: 'none',
          }}>
            <div style={{ fontSize: '1.3rem', marginBottom: 6 }}>{step.icon}</div>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{step.title}</div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', marginBottom: 8 }}>{step.desc}</div>
            <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--accent)' }}>{step.cta} →</span>
          </a>
        ))}
      </div>
    </div>
  );
}
