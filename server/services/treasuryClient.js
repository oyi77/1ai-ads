/**
 * treasuryClient.js — ESM
 *
 * Fire-and-forget HTTP client for posting revenue/loss entries to
 * 1ai-hub /treasury/entry (Capital Pool).
 *
 * Required env vars:
 *   TREASURY_HUB_URL   - e.g. http://localhost:8000
 *   TREASURY_HUB_TOKEN - optional bearer token
 *
 * Design constraints:
 *   - NEVER throws. AdForge budget decisions must not block on hub availability.
 *   - 5-second timeout; silent log on failure.
 *   - Works in Node.js ESM (native fetch, Node 18+).
 */

import { createLogger } from '../lib/logger.js';

const log = createLogger('treasuryClient');

const HUB_URL   = () => process.env.TREASURY_HUB_URL?.replace(/\/$/, '') ?? '';
const HUB_TOKEN = () => process.env.TREASURY_HUB_TOKEN ?? '';

/**
 * @param {object} entry
 * @param {'in'|'out'} entry.direction
 * @param {string}     entry.source       - 'adforge' | '1ai-ads'
 * @param {number}     entry.amount_usd   - absolute value, always positive
 * @param {string}     [entry.note]
 * @param {string}     [entry.workflow]   - e.g. 'wf5_ad_profit', 'wf5_ad_loss'
 * @param {object}     [entry.metadata]
 * @returns {Promise<boolean>}
 */
export async function recordToTreasury(entry) {
  const hubUrl = HUB_URL();
  if (!hubUrl) {
    log.debug('[treasuryClient] TREASURY_HUB_URL not set — skipping');
    return false;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);

  const headers = { 'Content-Type': 'application/json' };
  const token = HUB_TOKEN();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const res = await fetch(`${hubUrl}/treasury/entry`, {
      method: 'POST',
      headers,
      body: JSON.stringify(entry),
      signal: controller.signal,
    });

    if (!res.ok) {
      log.warn('[treasuryClient] Hub rejected entry', { status: res.status, entry });
      return false;
    }
    return true;
  } catch (err) {
    if (err.name !== 'AbortError') {
      log.warn('[treasuryClient] Failed to reach hub', { err, entry });
    }
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Check if WF5 (ad optimization) is enabled in the hub treasury.
 * Returns true when hub is unreachable (fail-open: don't block ads on hub downtime).
 * Returns false only when hub explicitly says wf5_enabled=false.
 * @returns {Promise<boolean>}
 */
export async function checkWf5Enabled() {
  const hubUrl = HUB_URL();
  if (!hubUrl) return true; // no hub configured → run normally

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);

  const headers = {};
  const token = HUB_TOKEN();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const res = await fetch(`${hubUrl}/treasury/status`, {
      headers,
      signal: controller.signal,
    });
    if (!res.ok) return true; // hub error → fail-open
    const data = await res.json();
    // Hub returns { rules: { wf5_enabled: "true"|"false" } } inside /treasury/status
    const flag = data?.rules?.wf5_enabled;
    if (flag === 'false' || flag === false) {
      log.warn('[treasuryClient] wf5_enabled=false — optimizer will be skipped');
      return false;
    }
    return true;
  } catch (err) {
    if (err.name !== 'AbortError') {
      log.debug('[treasuryClient] wf5 health check unreachable — failing open', { err });
    }
    return true; // unreachable → fail-open
  } finally {
    clearTimeout(timer);
  }
}
