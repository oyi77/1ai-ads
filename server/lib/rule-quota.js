// Batas SaaS paket free: max 3 RULE AKTIF (pro/enterprise/admin unlimited).
// Satu sumber kebenaran dipakai bot (wizard/template/toggle) + web routes
// (/api/automation/create, /api/autonomous/rules). Konstanta kode — plans
// tidak punya kolom max_rules; jangan tambah migrasi hanya untuk satu angka.
export const MAX_FREE_RULES = 3;

export function ruleQuotaCheck({ plan, role, activeCount }) {
  if (plan === 'pro' || plan === 'enterprise') return null;
  if (role === 'admin') return null;
  if (activeCount >= MAX_FREE_RULES) {
    return `🔒 <b>Paket Free max ${MAX_FREE_RULES} aturan aktif.</b>\n\nKamu punya ${activeCount} aktif. Upgrade ke Pro (Rp 99rb/bln) buat aturan unlimited + optimasi AI.`;
  }
  return null;
}

// Varian repo: hitung aktif dari rulesRepo + user dari userRepo/ctx.
export function ruleQuotaCheckByUser({ rulesRepo, plan, role, userId }) {
  if (plan === 'pro' || plan === 'enterprise') return null;
  if (role === 'admin') return null;
  let active = 0;
  try {
    const rules = rulesRepo?.getAll?.(userId) || [];
    active = rules.filter(r => r.enabled ?? r.is_active).length;
  } catch { /* best-effort: lolos, guard cron yang vonis */ }
  return ruleQuotaCheck({ plan, role, activeCount: active });
}
