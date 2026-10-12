import { useSyncExternalStore } from 'react';

/**
 * BusyBar — satu progress bar global di atas viewport.
 *
 * Cara kerja: modul ini menghitung NET request yang sedang terbang
 * (dipanggil dari api.ts mulai/selesai request). Render digambar oleh
 * komponen <BusyBar/> yang dipasang sekali di App. Tanpa state
 * per-halaman, tanpa konteks React — semua halaman ter-cover otomatis.
 *
 * Kenapa bukan per-tombol: 20+ halaman mutasi tidak punya busy state.
 * Satu indikator global menutup semuanya dalam 1 file, bukan 20 edit.
 */

// ── Counter + subscriber ────────────────────────────────────────

let inFlight = 0;
// Set, bukan array: runtime add/delete (subscribe/unsubscribe), tanpa dedupe.
const listeners = new Set<() => void>();

/** Naikkan counter (request mulai). Mengembalikan fungsi undur. */
export function busyStart(): () => void {
  inFlight += 1;
  for (const fn of listeners) fn();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    inFlight = Math.max(0, inFlight - 1);
    for (const fn of listeners) fn();
  };
}

// Kedua fungsi ini kontrak `useSyncExternalStore` (subscribe/snapshot) —
// indirection diperlukan, bukan wrapper trivial.
function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function getSnapshot() {
  return inFlight;
}

// ── Komponen ────────────────────────────────────────────────────

// Animasi geser kiri-kanan pada bar lebar 30% — murni CSS, tanpa
// dependensi, tanpa keyframes global (style inline).
const KEYFRAMES = `
@keyframes adforge-busy-slide {
  0% { left: -30%; }
  100% { left: 100%; }
}
`;

let styleInjected = false;
function ensureStyle() {
  if (styleInjected || typeof document === 'undefined') return;
  styleInjected = true;
  const el = document.createElement('style');
  el.textContent = KEYFRAMES;
  document.head.appendChild(el);
}

/** Progress bar tipis di atas viewport. Render null saat idle. */
export function BusyBar() {
  const count = useSyncExternalStore(subscribe, getSnapshot, () => 0);
  if (count === 0) return null;
  ensureStyle();
  return (
    <div
      role="progressbar"
      aria-label="Memproses permintaan"
      aria-busy="true"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        zIndex: 9999,
        background: 'transparent',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          height: '100%',
          width: '30%',
          borderRadius: '0 2px 2px 0',
          background: 'var(--accent, #22c55e)',
          animation: 'adforge-busy-slide 1.1s linear infinite',
        }}
      />
    </div>
  );
}
