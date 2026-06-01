/**
 * Profitability Calculator — Safety Gate for IKLAN_WORKFLOW
 *
 * Formula: Profit = Komisi Affiliate − (Total Spend Iklan × 1.06)
 * Tax platform 6% SELALU diperhitungkan.
 *
 * SOLID: Single Responsibility — only profitability math, no side effects.
 * KISS: Pure functions, no state.
 */

const PLATFORM_TAX_RATE = 0.06;

export const ROAS_THRESHOLDS = {
  SCALE_UP: 2.0,           // ROAS >= 2 → trigger scale-up
  MINIMUM_VIABLE: 1.0,     // ROAS >= 1 → breakeven
  STOP_LOSS: 1.0,          // ROAS < 1 after 3 days → kill
};

export const METRIC_THRESHOLDS = {
  CPC_MAX: 200,            // Rp — review if exceeded
  CPC_SCALE: 120,          // Rp — scale threshold
  CPM_MAX: 15000,          // Rp — consider changing audience
  CTR_MIN: 1.0,            // % — change creative if below
  CTR_SCALE: 2.0,          // % — good for scaling
};

/**
 * Calculate effective cost including platform tax.
 * @param {number} totalSpend - Total ad spend in Rp
 * @returns {number} Effective cost (spend + 6% tax)
 */
export function calculateEffectiveCost(totalSpend) {
  return totalSpend * (1 + PLATFORM_TAX_RATE);
}

/**
 * Calculate net profit.
 * @param {number} commission - Total affiliate commission in Rp
 * @param {number} totalSpend - Total ad spend in Rp
 * @returns {number} Net profit (can be negative)
 */
export function calculateProfit(commission, totalSpend) {
  return commission - calculateEffectiveCost(totalSpend);
}

/**
 * Calculate ROAS (Return on Ad Spend).
 * @param {number} commission - Total affiliate commission
 * @param {number} totalSpend - Total ad spend
 * @returns {number} ROAS ratio (commission / spend). 0 if no spend.
 */
export function evaluateROAS(commission, totalSpend) {
  if (totalSpend <= 0) return commission > 0 ? Infinity : 0;
  return commission / totalSpend;
}

/**
 * Determine campaign status.
 * @param {number} commission
 * @param {number} totalSpend
 * @returns {'PROFITABLE'|'BREAKEVEN'|'RUGI'}
 */
export function getCampaignStatus(commission, totalSpend) {
  const profit = calculateProfit(commission, totalSpend);
  if (profit > 0) return 'PROFITABLE';
  if (profit === 0) return 'BREAKEVEN';
  return 'RUGI';
}

/**
 * Evaluate all campaign metrics at once (DRY helper).
 * @param {number} commission
 * @param {number} spend
 * @returns {{ profit: number, roas: number, status: string, effectiveCost: number }}
 */
export function evaluateMetrics(commission, spend) {
  return {
    profit: calculateProfit(commission, spend),
    roas: evaluateROAS(commission, spend),
    status: getCampaignStatus(commission, spend),
    effectiveCost: calculateEffectiveCost(spend),
  };
}

/**
 * Should scale up? ROAS >= 2 and CTR > 2% and CPC < 120.
 * @param {object} metrics - { roas, ctr, cpc }
 * @returns {boolean}
 */
export function shouldScale({ roas, ctr, cpc }) {
  return (
    roas >= ROAS_THRESHOLDS.SCALE_UP &&
    ctr >= METRIC_THRESHOLDS.CTR_SCALE &&
    cpc <= METRIC_THRESHOLDS.CPC_SCALE
  );
}

/**
 * Should stop campaign? ROAS < 1 after given days.
 * @param {number} roas
 * @param {number} daysRunning
 * @returns {boolean}
 */
export function shouldStop(roas, daysRunning) {
  return daysRunning >= 3 && roas < ROAS_THRESHOLDS.STOP_LOSS;
}

/**
 * Should review creative? CTR below threshold or CPC above threshold.
 * @param {object} metrics - { ctr, cpc }
 * @returns {{ review: boolean, reasons: string[] }}
 */
export function shouldReviewCreative({ ctr, cpc }) {
  const reasons = [];
  if (ctr < METRIC_THRESHOLDS.CTR_MIN) reasons.push(`CTR ${ctr}% < ${METRIC_THRESHOLDS.CTR_MIN}%`);
  if (cpc > METRIC_THRESHOLDS.CPC_MAX) reasons.push(`CPC Rp${cpc} > Rp${METRIC_THRESHOLDS.CPC_MAX}`);
  return { review: reasons.length > 0, reasons };
}

/**
 * Generate campaign report in IKLAN_WORKFLOW format.
 * @param {object} params
 * @returns {string} Formatted report
 */
export function generateReport({ product, day, totalDays, spend, commission }) {
  const effectiveCost = calculateEffectiveCost(spend);
  const profit = calculateProfit(commission, spend);
  const roas = evaluateROAS(commission, spend);
  const status = getCampaignStatus(commission, spend);

  let decision = 'LANJUT';
  if (status === 'RUGI') decision = 'HENTIKAN';
  else if (roas >= ROAS_THRESHOLDS.SCALE_UP) decision = 'SCALE UP';

  return `📊 LAPORAN CAMPAIGN — ${new Date().toISOString().split('T')[0]}

Produk      : ${product}
Periode     : Hari ke-${day} / ${totalDays} hari berjalan

METRIK:
  Spend         : Rp ${spend.toLocaleString('id-ID')}
  Komisi        : Rp ${commission.toLocaleString('id-ID')}
  Biaya Efektif : Rp ${effectiveCost.toLocaleString('id-ID')}
  Profit Bersih : Rp ${profit.toLocaleString('id-ID')}
  ROAS          : ${roas.toFixed(2)}

STATUS: ${status}
KEPUTUSAN: ${decision}`;
}
