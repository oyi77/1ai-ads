/**
 * Meta money units.
 *
 * Meta's `daily_budget` is documented in "cents" — but ONLY for currencies
 * with a minor unit (USD, EUR, ...). Zero-decimal currencies (IDR, JPY, ...)
 * travel in MAJOR units: an IDR `daily_budget` of 50000 IS Rp 50.000.
 * Blindly *100-ing every budget turned Rp 50k into Rp 5jt on IDR accounts.
 *
 * Rule: convert with the account currency. Default 'IDR' (our live base).
 */
const ZERO_DECIMAL = new Set([
  'BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW', 'PYG',
  'RWF', 'UGX', 'UYI', 'VND', 'VUV', 'XAF', 'XOF', 'XPF', 'IDR',
  'HUF', 'TWD',
]);

export function isZeroDecimalCurrency(currency) {
  return ZERO_DECIMAL.has(String(currency || '').toUpperCase());
}

/** Major (Rp 50.000) -> Meta API units. */
export function toMinorUnits(amount, currency = 'IDR') {
  const n = Number(amount) || 0;
  if (isZeroDecimalCurrency(currency)) return Math.round(n);
  return Math.round(n * 100);
}

/** Meta API units -> major (Rp 50.000). */
export function fromMinorUnits(value, currency = 'IDR') {
  const n = Number(value) || 0;
  if (isZeroDecimalCurrency(currency)) return n;
  return n / 100;
}
