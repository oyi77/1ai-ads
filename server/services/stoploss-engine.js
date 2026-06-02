/**
 * Stoploss Engine — ROAS Drop Detection & Budget Cascade
 *
 * Protocol (from IKLAN_WORKFLOW):
 * 1. ROAS turun >30% dalam 1 hari → tunggu 1 hari (bisa fluktuasi normal)
 * 2. Hari berikutnya masih turun → potong budget 50%
 * 3. Setelah potong budget masih turun → matikan campaign
 * 4. Jangan pernah tambah budget saat ROAS sedang turun
 *
 * SOLID: Single Responsibility — only stoploss decisions.
 * KISS: State machine with clear transitions.
 */

const CONFIG = {
  ROAS_DROP_THRESHOLD: 0.30,    // 30% drop triggers concern
  BUDGET_REDUCTION_FACTOR: 0.50, // 50% budget cut
  MAX_CONSECUTIVE_DROPS: 3,      // 3 consecutive drops → kill
  WAIT_AFTER_FIRST_DROP: true,   // Wait 1 day after first drop
};

/**
 * Calculate ROAS drop percentage.
 * @param {number} currentROAS
 * @param {number} previousROAS
 * @returns {number} Drop percentage (0.3 = 30% drop). Negative means improvement.
 */
export function calculateRoasDrop(currentROAS, previousROAS) {
  if (previousROAS <= 0) return null;
  return (previousROAS - currentROAS) / previousROAS;
}

/**
 * Detect if ROAS drop exceeds threshold.
 * @param {number} currentROAS
 * @param {number} previousROAS
 * @returns {{ dropped: boolean, dropPercentage: number, exceedsThreshold: boolean }}
 */
export function detectRoasDrop(currentROAS, previousROAS) {
  const dropPercentage = calculateRoasDrop(currentROAS, previousROAS);
  if (dropPercentage === null) {
    return { dropped: false, dropPercentage: 0, exceedsThreshold: false };
  }
  return {
    dropped: dropPercentage > 0,
    dropPercentage,
    exceedsThreshold: dropPercentage >= CONFIG.ROAS_DROP_THRESHOLD,
  };
}

/**
 * Determine stoploss action based on campaign history.
 * @param {object} params
 * @param {number} params.currentROAS
 * @param {number} params.previousROAS
 * @param {number} params.consecutiveDrops - How many consecutive days ROAS dropped
 * @param {boolean} params.alreadyReducedBudget - Whether budget was already cut
 * @param {number} params.currentDailyBudget
 * @returns {{ action: string, newBudget: number|null, reason: string }}
 */
function handleKillCampaign(consecutiveDrops) {
  return {
    action: 'KILL', newBudget: 0,
    reason: `ROAS dropped >30% for ${consecutiveDrops} consecutive days. Killing campaign.`,
  };
}

function handleReduceBudget(consecutiveDrops, currentDailyBudget) {
  const newBudget = Math.floor(currentDailyBudget * CONFIG.BUDGET_REDUCTION_FACTOR);
  return {
    action: 'REDUCE_BUDGET', newBudget,
    reason: `ROAS dropped >30% for ${consecutiveDrops} days. Reducing budget 50%: Rp${currentDailyBudget} → Rp${newBudget}`,
  };
}

function handleWaitOrMonitor(consecutiveDrops) {
  if (CONFIG.WAIT_AFTER_FIRST_DROP && consecutiveDrops === 1) {
    return { action: 'WAIT', newBudget: null, reason: 'First ROAS drop >30%. Waiting 1 day (could be normal fluctuation).' };
  }
  return { action: 'MONITOR', newBudget: null, reason: 'Monitoring ROAS trend' };
}

export function evaluateStoploss({ currentROAS, previousROAS, consecutiveDrops, alreadyReducedBudget, currentDailyBudget }) {
  const { dropped, exceedsThreshold } = detectRoasDrop(currentROAS, previousROAS);
  if (!dropped) return { action: 'NONE', newBudget: null, reason: 'ROAS stable or improving' };
  if (!exceedsThreshold) {
    const dropPct = calculateRoasDrop(currentROAS, previousROAS);
    return { action: 'MONITOR', newBudget: null, reason: `ROAS drop ${(dropPct ?? 0) * 100}% < 30% threshold` };
  }
  if (consecutiveDrops >= CONFIG.MAX_CONSECUTIVE_DROPS) return handleKillCampaign(consecutiveDrops);
  if (consecutiveDrops >= 2 && !alreadyReducedBudget) return handleReduceBudget(consecutiveDrops, currentDailyBudget);
  return handleWaitOrMonitor(consecutiveDrops);
}

/**
 * Check if budget increase is allowed (never increase while ROAS dropping).
 * @param {boolean} roasIsDropping
 * @returns {{ allowed: boolean, reason: string }}
 */
export function canIncreaseBudget(roasIsDropping) {
  if (roasIsDropping) {
    return { allowed: false, reason: 'Cannot increase budget while ROAS is dropping' };
  }
  return { allowed: true, reason: 'ROAS stable — budget increase allowed' };
}
