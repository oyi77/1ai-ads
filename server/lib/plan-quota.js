// Batas SaaS paket free/pro: campaign, iklan, akun iklan (enterprise/admin
// unlimited). Satu sumber kebenaran dipakai bot (wizard create-campaign,
// connect akun) + web routes (/api/campaigns/create, /api/settings/accounts).
// Angka dibaca dari tabel `plans` (max_campaigns/max_ads/max_platform_accounts)
// — jangan hardcode, itu sudah punya migrasi.
import { PlanCheck } from './plan-check.js';

export const LIMIT_LABEL = { campaign: 'campaign', ad: 'iklan', account: 'akun iklan' };

/**
 * Gate teks siap-reply buat bot, atau null kalau masih boleh.
 * Pola sama dengan rule-quota.js: null = lolos.
 */
export function planQuotaCheck(db, userId, limitType) {
  const res = new PlanCheck(db).getLimitMessage(userId, limitType);
  if (!res || res.allowed) return null;
  return (
    `${res.message}\n\n` +
    '💎 <b>Upgrade ke Lifetime — Rp 99rb sekali bayar</b>\n' +
    'Campaign, iklan & akun unlimited + optimasi AI. Nggak ada tagihan bulanan.'
  );
}

/** Varian untuk Express route: 403 { error, upgrade } atau null. */
export function planQuotaGate(db, userId, limitType) {
  const res = new PlanCheck(db).getLimitMessage(userId, limitType);
  if (!res || res.allowed) return null;
  return {
    status: 403,
    body: {
      success: false,
      error: res.message.replace(/^[^A-Za-z]+/, ''),
      code: 'plan_limit',
      limitType,
      current: res.current,
      limit: res.limit,
      upgrade: { callback: 'pricing:order', url: 'https://adforge.aitradepulse.com/pricing' },
    },
  };
}
