/**
 * Format a number as Indonesian Rupiah.
 * Used across analytics, campaigns, trending, competitor-spy views.
 * @param {number} n - Number to format
 * @returns {string} Formatted string like "1.234.567"
 */
export const fmtIdr = (n) => {
  if (n == null || isNaN(n)) return '0';
  return Math.round(Number(n)).toLocaleString('id-ID');
};

/**
 * Format a number as IDR currency with symbol.
 * @param {number} amount
 * @returns {string} Formatted string like "IDR 1.234.567"
 */
export const formatCurrency = (amount) => {
  return `IDR ${fmtIdr(amount)}`;
};