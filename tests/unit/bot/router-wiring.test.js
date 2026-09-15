import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

/**
 * Bot router wiring gate.
 *
 * Proven 2026-09-14: commit 337535a replaced the `platform:account:` router
 * with the compact `pacc:` router but also deleted the generic
 * `^platform:(.+):(.+)$` router. Boot stayed green, lint stayed green, all
 * 47 bot unit tests stayed green — the failure only surfaced live when a
 * Telethon click on `platform:meta:manage` went silent (webhook delivered,
 * no handler matched, nothing logged). Same silent class as the
 * repositories-wiring incident (a45a1a3): deleting a registration whose
 * consumers remain is invisible until a user hits the path.
 *
 * This gate parses every bot.action(/^...$/) pattern out of
 * server/bot/index.js and asserts the load-bearing set is present, so a
 * router deletion fails the suite instead of shipping silent.
 */
const INDEX = readFileSync('server/bot/index.js', 'utf8');

// Load-bearing routers. Each entry: [name, regex-source-fragment that must
// appear inside a bot.action(/.../) pattern]. Fragments, not full patterns,
// so legitimate pattern tightening still passes.
const REQUIRED = [
  ['menu', String.raw`menu:(.+)`],
  ['platform-generic', String.raw`platform:(.+):(.+)`],
  ['pacc-compact', String.raw`pacc:(.+):(.+)`],
  ['settings', String.raw`settings:(.+)`],
  ['ads-manage', String.raw`ads:manage`],
  ['ads-select', String.raw`ads:select:(.+):(.+)`],
  ['ads-ask', String.raw`ads:ask:`],
  ['ads-askbud', String.raw`ads:abud:`],
  ['ads-report', String.raw`ads:report:`],
  ['ads-platform', String.raw`ads:platform:(.+)`],
  ['ads-disconnect', String.raw`ads:disconnect`],
  ['approval-approve', String.raw`approval:approve:(.+)`],
  ['approval-reject', String.raw`approval:reject:(.+)`],
  ['monitor', String.raw`monitor:(.+)`],
  ['rule', String.raw`rule:(.+)`],
  ['dash', String.raw`dash:(.+)`],
  ['quick-menu', String.raw`quick:menu`],
  ['nav-back', String.raw`nav:back`],
  ['nav-cancel', String.raw`nav:cancel`],
  ['nav-close', String.raw`nav:close`],
  ['connect-generic', String.raw`connect:(.+)`],
  ['connect-cancel', String.raw`connect:cancel`],
];

describe('bot router wiring', () => {
  it('registers every load-bearing bot.action router', () => {
    const missing = REQUIRED.filter(([, frag]) => !INDEX.includes(`bot.action(/^${frag}`));
    expect(
      missing.map(([name]) => name),
      missing.length ? `deleted routers: ${missing.map(([n]) => n).join(', ')}` : 'all routers present',
    ).toEqual([]);
  });
});
