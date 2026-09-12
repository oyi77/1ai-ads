import { beforeEach, describe, expect, it, vi } from 'vitest';

// Set before scheduler.js (and therefore config) is imported below.
process.env.TELEGRAM_CHAT_ID = '999';

// Capture registered crons so jobs can be invoked directly.
vi.mock('node-cron', () => ({ default: { schedule: vi.fn() } }));

const cron = (await import('node-cron')).default;
const { initScheduler } = await import('../../../../server/bot/scheduler.js');

const CAMPAIGN_MONITOR_CRON = '0 */6 * * *';
const DAILY_EVAL_CRON = '0 18 * * *';

/**
 * Run initScheduler with stubs and return every registered cron callback.
 *
 * @param {object[]} campaigns - rows returned by campaignsRepo.findAll()
 * @param {Record<string, string|null>} telegramIds - userId → linked telegram_id
 */
function runWith({ campaigns, telegramIds = {} }) {
  cron.schedule.mockClear();
  const sent = [];
  const settings = new Map();

  initScheduler(
    { telegram: { sendMessage: vi.fn(async (chatId, text) => { sent.push({ chatId, text }); return {}; }) } },
    {
      repos: {
        campaignsRepo: {
          findAll: () => ({ data: campaigns, total: campaigns.length }),
          update: () => true,
        },
        settingsRepo: {
          get: (key) => (settings.has(key) ? settings.get(key) : null),
          set: (key, value) => settings.set(key, value),
          delete: (key) => settings.delete(key),
        },
        usersRepo: {
          getTelegramIdByUserId: (userId) => telegramIds[userId] ?? null,
          findById: (userId) => (telegramIds[userId] ? { telegram_id: telegramIds[userId] } : null),
        },
      },
      services: {},
    }
  );

  const byExpr = (expr) => cron.schedule.mock.calls.filter(([e]) => e === expr).map(([, fn]) => fn);
  return { sent, settings, byExpr };
}

beforeEach(() => {
  cron.schedule.mockClear();
});

describe('campaign alerts reach the owner, not the admin chat', () => {
  it('routes a stop-loss warning to the owning customer', async () => {
    // REDUCE_BUDGET needs a >30% ROAS drop with at least one tracked drop.
    const campaign = {
      id: 'campaign-1',
      user_id: 'u-andi',
      status: 'active',
      name: 'Kampanye Andi',
      spend: 500000,
      revenue: 600000,
      previous_roas: 2.5,
      consecutive_drops: 1,
      budget_reduced: 0,
      budget: 100000,
      days_running: 4,
    };
    const { sent, byExpr } = runWith({ campaigns: [campaign], telegramIds: { 'u-andi': '555' } });

    const [monitor] = byExpr(CAMPAIGN_MONITOR_CRON);
    expect(monitor, 'campaign monitor cron not registered').toBeTruthy();
    await monitor();

    expect(sent).toHaveLength(1);
    expect(sent[0].chatId).toBe('555');
    expect(sent[0].text).toContain('Kampanye Andi');
    // The regression: this used to land in the admin chat, exposing one
    // customer's campaign to whoever sits in that chat.
    expect(sent.some((m) => m.chatId === '999')).toBe(false);
  });

  it('groups the daily eval digest per owner and keeps names out of the admin fallback', async () => {
    const campaigns = [
      // Losing: ROAS 0 with real spend.
      { id: 'c-a', user_id: 'u-budi', status: 'active', name: 'Kampanye Budi', spend: 1000, revenue: 0 },
      { id: 'c-b', user_id: 'u-budi', status: 'active', name: 'Kampanye Budi 2', spend: 1000, revenue: 0 },
      // Losing, but this owner never linked Telegram.
      { id: 'c-c', user_id: 'u-citra', status: 'active', name: 'Kampanye Citra', spend: 1000, revenue: 0 },
    ];
    const { sent, byExpr } = runWith({ campaigns, telegramIds: { 'u-budi': '777' } });

    const [evalGuard] = byExpr(DAILY_EVAL_CRON);
    expect(evalGuard, 'daily eval cron not registered').toBeTruthy();
    await evalGuard();

    const toBudi = sent.filter((m) => m.chatId === '777');
    expect(toBudi).toHaveLength(1);
    expect(toBudi[0].text).toContain('Kampanye Budi');
    expect(toBudi[0].text).toContain('Kampanye Budi 2');
    expect(toBudi[0].text).not.toContain('Kampanye Citra');

    const toAdmin = sent.filter((m) => m.chatId === '999');
    expect(toAdmin).toHaveLength(1);
    expect(toAdmin[0].text).not.toContain('Kampanye Citra');
  });
});
