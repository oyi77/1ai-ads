import { beforeEach, describe, expect, it, vi } from 'vitest';

// Capture the crons initScheduler registers so the 6-hourly token health
// check can be invoked directly instead of waiting for a real schedule.
vi.mock('node-cron', () => ({ default: { schedule: vi.fn() } }));

let getMeImpl = async () => ({ id: 'fb-1', name: 'QA' });

// Collapse the platform fan-out to a single controllable platform.
let getPlatformImpl = async () => ({
  setActiveAccount() {},
  getMe() {
    return getMeImpl();
  },
});
vi.mock('../../../../server/platforms/index.js', () => ({
  listPlatformKeys: () => ['meta'],
  getPlatform: (...args) => getPlatformImpl(...args),
}));

const cron = (await import('node-cron')).default;
const { initScheduler } = await import('../../../../server/bot/scheduler.js');

const HEALTH_CRON = '15 */6 * * *';

/** Run initScheduler with stubs and return the health-check cron callback. */
function healthCheckWith({ accounts, telegramId = '555', settings = new Map() }) {
  cron.schedule.mockClear();
  const updates = [];
  const sendMessage = vi.fn(async () => ({}));

  const settingsRepo = {
    get: (key) => (settings.has(key) ? settings.get(key) : null),
    set: (key, value) => settings.set(key, value),
    delete: (key) => settings.delete(key),
  };

  initScheduler(
    { telegram: { sendMessage } },
    {
      repos: {
        platformAccountsRepo: {
          getDistinctUserPlatforms: () => accounts.map((a) => ({ user_id: a.user_id, platform: 'meta' })),
          findAllActiveByUserAndPlatform: (userId) => accounts.filter((a) => a.user_id === userId),
          update: (id, fields) => {
            updates.push({ id, fields });
            return { id };
          },
        },
        settingsRepo,
        usersRepo: {
          getTelegramIdByUserId: (userId) => (userId === 'u1' ? telegramId : null),
          findById: () => ({ telegram_id: telegramId }),
        },
      },
    }
  );

  const entry = cron.schedule.mock.calls.find(([expr]) => expr === HEALTH_CRON);
  expect(entry, `no cron registered for ${HEALTH_CRON}`).toBeTruthy();
  return { run: entry[1], updates, sendMessage, settings };
}

const deadAccount = (extra = {}) => ({
  id: 'acct-dead',
  user_id: 'u1',
  platform: 'meta',
  account_name: 'Emr Yeah',
  access_token: 'EAAdeadToken0000000000',
  health_status: 'ok',
  last_error: null,
  ...extra,
});

beforeEach(() => {
  getMeImpl = async () => ({ id: 'fb-1', name: 'QA' });
  getPlatformImpl = async () => ({
    setActiveAccount() {},
    getMe() {
      return getMeImpl();
    },
  });
});

describe('token health check', () => {
  it('notifies the token owner and records the failure when the token is dead', async () => {
    getMeImpl = async () => {
      throw new Error('Error validating access token: Session has expired');
    };
    const { run, updates, sendMessage } = healthCheckWith({ accounts: [deadAccount()] });

    await run();

    // The owner must hear about it — routing this to the admin chat left the
    // customer with a silent failure.
    expect(sendMessage).toHaveBeenCalledWith('555', expect.stringContaining('Token meta kamu sudah tidak valid'), expect.anything());

    // The status has to land on the real row id. The previous implementation
    // passed `id = undefined` (the fan-out projection has no id), so the
    // update silently no-op'd and dead accounts stayed flagged 'ok'.
    expect(updates).toContainEqual({
      id: 'acct-dead',
      fields: { health_status: 'expired', last_error: expect.stringContaining('Session has expired') },
    });
  });

  it('alerts at most once per account per day', async () => {
    getMeImpl = async () => {
      throw new Error('Error validating access token: Session has expired');
    };
    const { run, sendMessage } = healthCheckWith({ accounts: [deadAccount()] });

    await run();
    const afterFirst = sendMessage.mock.calls.filter(([chatId]) => chatId === '555').length;
    await run();
    const afterSecond = sendMessage.mock.calls.filter(([chatId]) => chatId === '555').length;

    expect(afterFirst).toBe(1);
    expect(afterSecond).toBe(1);
  });

  it('leaves a healthy token unflagged and notifies nobody', async () => {
    const { run, updates, sendMessage } = healthCheckWith({ accounts: [deadAccount()] });

    await run();

    expect(sendMessage).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
  });

  it('clears a stale flag once the token works again', async () => {
    const { run, updates } = healthCheckWith({
      accounts: [deadAccount({ health_status: 'expired', last_error: 'Session has expired' })],
    });

    await run();

    expect(updates).toContainEqual({
      id: 'acct-dead',
      fields: { health_status: 'ok', last_error: null },
    });
  });

  it('does not treat a transient network failure as token expiry', async () => {
    getMeImpl = async () => {
      throw new Error('ETIMEDOUT');
    };
    const { run, updates, sendMessage } = healthCheckWith({ accounts: [deadAccount()] });

    await run();

    expect(sendMessage).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
  });

  it('never leaks a token that was pasted as the account label', async () => {
    const pasted = 'EAAfakeToken1234567890abcdefghij';
    getMeImpl = async () => {
      throw new Error('Error validating access token: Session has expired');
    };
    const { run, sendMessage } = healthCheckWith({
      accounts: [deadAccount({ account_name: `✅ ${pasted} connected for Meta (Facebook/Instagram)!` })],
    });

    await run();

    const text = sendMessage.mock.calls.map(([, body]) => body).join('\n');
    expect(text).not.toContain(pasted);
    expect(text).toContain('EAA[REDACTED]');
  });

  it('does not flag or notify anyone when the platform client cannot be built', async () => {
    // A fresh process has not warmed the platform map, and the sync accessor
    // throws until it has. Treating that internal error as token expiry marked
    // every account expired and messaged every owner.
    getPlatformImpl = async () => {
      throw new Error('Platform map not loaded. Call getPlatform() or loadPlatforms() first.');
    };
    const { run, updates, sendMessage } = healthCheckWith({ accounts: [deadAccount()] });

    await run();

    expect(sendMessage).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
  });
});
