/**
 * Domain: Optimization — IKLAN_WORKFLOW Core
 *
 * Merges: stoploss-engine + scale-manager + profitability-calculator
 * Pure business logic. No direct DB access, no direct API calls.
 * Dependencies injected via function params.
 *
 * From IKLAN_WORKFLOW:
 * - Phase 1: 3-day evaluation (profitability)
 * - Phase 2: Scale-up (duplicate + expand interests + budget ladder)
 * - Phase 3: Stoploss (ROAS drop detection + budget cascade)
 */

import { createLogger } from '../lib/logger.js';

const log = createLogger('domain:optimization');

// ── Profitability ────────────────────────────────────────────

const PLATFORM_TAX_RATE = parseFloat(process.env.PLATFORM_TAX_RATE || '0.06');

export const ROAS_THRESHOLDS = {
  SCALE_UP: parseFloat(process.env.ROAS_SCALE_UP || '2.0'),
  PROFITABLE: parseFloat(process.env.ROAS_PROFITABLE || '1.0'),
  STOP_LOSS: parseFloat(process.env.ROAS_STOP_LOSS || '0.7'),
};

export const METRIC_THRESHOLDS = {
  CTR_MIN: parseFloat(process.env.CTR_MIN || '1.0'),
  CTR_SCALE: parseFloat(process.env.CTR_SCALE || '2.0'),
  CPC_MAX: parseFloat(process.env.CPC_MAX || '200'),
  CPC_SCALE: parseFloat(process.env.CPC_SCALE || '120'),
};

export function calculateEffectiveCost(totalSpend) {
  return totalSpend * (1 + PLATFORM_TAX_RATE);
}

export function calculateProfit(commission, totalSpend) {
  return commission - calculateEffectiveCost(totalSpend);
}

export function evaluateROAS(commission, totalSpend) {
  const cost = calculateEffectiveCost(totalSpend);
  return cost > 0 ? commission / cost : 0;
}

export function getCampaignStatus(commission, totalSpend) {
  const roas = evaluateROAS(commission, totalSpend);
  if (roas >= ROAS_THRESHOLDS.SCALE_UP) return 'WINNING';
  if (roas >= ROAS_THRESHOLDS.PROFITABLE) return 'PROFITABLE';
  if (roas >= ROAS_THRESHOLDS.STOP_LOSS) return 'MARGINAL';
  return 'LOSING';
}

export function evaluateMetrics(commission, spend) {
  const roas = evaluateROAS(commission, spend);
  const profit = calculateProfit(commission, spend);
  const status = getCampaignStatus(commission, spend);
  return { roas, profit, status, commission, spend };
}

export function shouldScale({ roas, ctr, cpc }) {
  return roas >= ROAS_THRESHOLDS.SCALE_UP
    && (ctr || 0) >= METRIC_THRESHOLDS.CTR_SCALE
    && (cpc || Infinity) <= METRIC_THRESHOLDS.CPC_SCALE;
}

export function shouldStop(roas, daysRunning) {
  return daysRunning >= 3 && roas < ROAS_THRESHOLDS.STOP_LOSS;
}

export function shouldReviewCreative({ ctr, cpc }) {
  const reasons = [];
  if ((ctr || 0) < METRIC_THRESHOLDS.CTR_MIN) reasons.push(`CTR ${(ctr || 0).toFixed(2)}% < ${METRIC_THRESHOLDS.CTR_MIN}%`);
  if ((cpc || 0) > METRIC_THRESHOLDS.CPC_MAX) reasons.push(`CPC ${cpc} > ${METRIC_THRESHOLDS.CPC_MAX}`);
  return { review: reasons.length > 0, reasons };
}

function determineDecision(status, roas) {
  if (status === 'WINNING') return 'SCALE_UP';
  if (status === 'PROFITABLE') return 'MAINTAIN';
  if (status === 'MARGINAL') return 'REVIEW_CREATIVE';
  return 'STOP_CAMPAIGN';
}

export function generateReport({ product, day, totalDays, spend, commission }) {
  const metrics = evaluateMetrics(commission, spend);
  const decision = determineDecision(metrics.status, metrics.roas);
  return {
    product, day, totalDays, ...metrics, decision,
    summary: `Day ${day}/${totalDays}: ROAS ${metrics.roas.toFixed(2)}x | Profit Rp ${metrics.profit.toLocaleString('id-ID')} | ${decision}`,
  };
}

// ── Stoploss Engine ──────────────────────────────────────────

const STOPLOSS_CONFIG = {
  ROAS_DROP_THRESHOLD: parseFloat(process.env.STOPLOSS_ROAS_DROP || '0.30'),
  BUDGET_REDUCTION_FACTOR: parseFloat(process.env.STOPLOSS_BUDGET_REDUCTION || '0.50'),
  MAX_CONSECUTIVE_DROPS: parseInt(process.env.STOPLOSS_MAX_DROPS || '3', 10),
};

export function calculateRoasDrop(currentROAS, previousROAS) {
  if (previousROAS <= 0) return null;
  return (previousROAS - currentROAS) / previousROAS;
}

export function detectRoasDrop(currentROAS, previousROAS) {
  const dropPercentage = calculateRoasDrop(currentROAS, previousROAS);
  if (dropPercentage === null) {
    return { dropped: false, dropPercentage: 0, exceedsThreshold: false };
  }
  return {
    dropped: dropPercentage > 0,
    dropPercentage,
    exceedsThreshold: dropPercentage >= STOPLOSS_CONFIG.ROAS_DROP_THRESHOLD,
  };
}

export function evaluateStoploss({ currentROAS, previousROAS, consecutiveDrops, alreadyReducedBudget, currentDailyBudget }) {
  const drop = detectRoasDrop(currentROAS, previousROAS);

  if (!drop.dropped) {
    return { action: 'MONITOR', newBudget: null, reason: 'ROAS stable or improving' };
  }

  if (!drop.exceedsThreshold) {
    return { action: 'MONITOR', newBudget: null, reason: `ROAS dropped ${(drop.dropPercentage * 100).toFixed(1)}% — below ${STOPLOSS_CONFIG.ROAS_DROP_THRESHOLD * 100}% threshold` };
  }

  if (consecutiveDrops >= STOPLOSS_CONFIG.MAX_CONSECUTIVE_DROPS) {
    return {
      action: 'KILL', newBudget: 0,
      reason: `ROAS dropped >30% for ${consecutiveDrops} consecutive days. Killing campaign.`,
    };
  }

  if (consecutiveDrops >= 1 && !alreadyReducedBudget) {
    const newBudget = Math.round(currentDailyBudget * STOPLOSS_CONFIG.BUDGET_REDUCTION_FACTOR);
    return {
      action: 'REDUCE_BUDGET', newBudget,
      reason: `ROAS dropped ${(drop.dropPercentage * 100).toFixed(1)}%. Reducing budget to Rp ${newBudget.toLocaleString('id-ID')} (-50%)`,
    };
  }

  return { action: 'WAIT', newBudget: null, reason: 'ROAS dropped >30% — waiting 1 day before action (could be normal fluctuation)' };
}

export function canIncreaseBudget(roasIsDropping) {
  if (roasIsDropping) {
    return { allowed: false, reason: 'Cannot increase budget while ROAS is dropping. Fix ROAS first.' };
  }
  return { allowed: true, reason: 'ROAS stable — budget increase allowed' };
}

// ── Scale Manager ────────────────────────────────────────────

const BUDGET_LADDER = (process.env.BUDGET_LADDER || '200000,500000,1000000,2000000,5000000,10000000').split(',').map(Number);

const HIDDEN_INTERESTS_PROMPT = `You are a Facebook Ads expert finding hidden interests for Shopee Affiliate products.

Product: {product}
Current interests already used: {currentInterests}

Find 5-10 hidden interests that:
1. Are NOT the obvious broad terms (e.g., not "kecantikan" for beauty)
2. Target competitor brands (e.g., "Sephora", "Wardah", "The Ordinary")
3. Target media/publications the audience reads
4. Target activities/habits correlated with high purchasing power
5. Are available as Facebook interest targeting

Return ONLY a JSON array of strings. Example: ["Sephora", "Wardah", "K-beauty"]`;

export function evaluateScaleEligibility(metrics) {
  if (shouldScale(metrics)) {
    return { canScale: true, reason: `ROAS ${metrics.roas} >= 2, CTR ${metrics.ctr}% >= 2%, CPC ${metrics.cpc} <= 120` };
  }
  const reasons = [];
  if (metrics.roas < ROAS_THRESHOLDS.SCALE_UP) reasons.push(`ROAS ${metrics.roas} < ${ROAS_THRESHOLDS.SCALE_UP}`);
  if ((metrics.ctr || 0) < METRIC_THRESHOLDS.CTR_SCALE) reasons.push(`CTR ${metrics.ctr}% < ${METRIC_THRESHOLDS.CTR_SCALE}%`);
  if ((metrics.cpc || 0) > METRIC_THRESHOLDS.CPC_SCALE) reasons.push(`CPC ${metrics.cpc} > ${METRIC_THRESHOLDS.CPC_SCALE}`);
  return { canScale: false, reason: reasons.join(', ') };
}

export async function expandHiddenInterests(llmClient, product, currentInterests = []) {
  const prompt = HIDDEN_INTERESTS_PROMPT
    .replace('{product}', product)
    .replace('{currentInterests}', currentInterests.join(', '));

  try {
    const raw = await llmClient.call('You are a Facebook Ads targeting expert.', prompt);
    return parseInterests(raw, currentInterests);
  } catch (err) {
    log.warn('Failed to expand hidden interests', { error: err.message });
    return [];
  }
}

function parseInterests(rawResult, currentInterests) {
  try {
    const jsonMatch = rawResult.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) return [];
    const interests = JSON.parse(jsonMatch[0]);
    const currentSet = new Set(currentInterests.map(i => i.toLowerCase()));
    return interests.filter(i => typeof i === 'string' && !currentSet.has(i.toLowerCase()));
  } catch {
    return [];
  }
}

export function discoverBudgetCap(currentBudget, roasIsDropping) {
  if (roasIsDropping) return { nextBudget: currentBudget, reason: 'ROAS dropping — hold budget' };
  const currentIdx = BUDGET_LADDER.findIndex(b => b >= currentBudget);
  if (currentIdx === -1 || currentIdx >= BUDGET_LADDER.length - 1) {
    return { nextBudget: currentBudget, reason: 'Already at max budget ladder step' };
  }
  const nextBudget = BUDGET_LADDER[currentIdx + 1];
  return { nextBudget, reason: `Scale up: Rp ${currentBudget.toLocaleString('id-ID')} → Rp ${nextBudget.toLocaleString('id-ID')}` };
}


// ── Dayparting Engine ────────────────────────────────────────

/**
 * Evaluate time-of-day budget adjustment.
 * All values configurable via environment variables.
 * @param {object} campaign — campaign record
 * @param {number} hourOfDay — 0-23 in configured timezone
 * @returns {{ action: string, factor: number, reason: string }}
 */
export function evaluateDayparting(campaign, hourOfDay) {
  const peakHours = (process.env.DAYPARTING_PEAK_HOURS || '9,10,11,18,19,20,21').split(',').map(Number);
  const offPeakHours = (process.env.DAYPARTING_OFFPEAK_HOURS || '0,1,2,3,4,5,6').split(',').map(Number);
  const peakFactor = parseFloat(process.env.DAYPARTING_PEAK_FACTOR || '1.3');
  const offPeakFactor = parseFloat(process.env.DAYPARTING_OFFPEAK_FACTOR || '0.5');

  if (peakHours.includes(hourOfDay)) {
    return {
      action: 'INCREASE_BUDGET',
      factor: peakFactor,
      reason: `Peak hours (${hourOfDay}:00) — increase spend by ${Math.round((peakFactor - 1) * 100)}%`,
    };
  }
  if (offPeakHours.includes(hourOfDay)) {
    return {
      action: 'DECREASE_BUDGET',
      factor: offPeakFactor,
      reason: `Off-peak hours (${hourOfDay}:00) — reduce spend by ${Math.round((1 - offPeakFactor) * 100)}%`,
    };
  }
  return { action: 'MAINTAIN', factor: 1.0, reason: `Normal hours (${hourOfDay}:00)` };
}
