import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock telegraf so initBot() never hits the real Telegram network.
const noop = () => {};
const fakeBot = new Proxy(
  {
    use: vi.fn(),
    command: vi.fn(),
    action: vi.fn(),
    on: vi.fn(),
    catch: vi.fn(),
    webhookCallback: vi.fn(() => () => (req, res) => res.sendStatus(200)),
    telegram: {
      setWebhook: vi.fn(() => Promise.resolve(true)),
      getMyCommands: vi.fn(() => Promise.resolve([])),
      setMyCommands: vi.fn(() => Promise.resolve(true)),
      setChatMenuButton: vi.fn(() => Promise.resolve(true)),
      getChatMenuButton: vi.fn(() => Promise.resolve({ type: 'web_app' })),
    },
    context: {},
  },
  {
    get(target, prop) {
      if (prop in target) return target[prop];
      // Any other Telegraf method (start, help, settings, …) → no-op.
      return vi.fn(noop);
    },
  }
);

vi.mock('telegraf', () => ({
  Telegraf: class { constructor() { return fakeBot; } },
  Scenes: {
    Stage: class { constructor() {} use() {} },
    WizardScene: class { constructor() {} command() { return this; } action() { return this; } },
  },
}));
vi.mock('telegraf/session', () => ({ session: () => () => (next) => next() }));

vi.mock('../../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: () => {}, error: () => {}, warn: () => {}, debug: () => {} }),
}));

const OLD_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

describe('initBot smoke', () => {
  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = 'TEST_BOT_TOKEN:abc';
    vi.clearAllMocks();
  });
  afterEach(() => {
    if (OLD_TOKEN === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = OLD_TOKEN;
  });

  it('mounts webhook callback and registers /metaapp without throwing', { timeout: 30000 }, async () => {
    const { initBot } = await import('../../../../server/bot/index.js');
    const app = { use: vi.fn() };
    const deps = { repos: {}, services: {} };

    let err = null;
    let bot = null;
    try {
      bot = initBot(app, deps);
    } catch (e) {
      err = e;
    }
    expect(err).toBeNull();
    expect(bot).toBeTruthy();
    // webhook callback mounted on Express:
    expect(app.use).toHaveBeenCalled();
    // /metaapp + /create handled by custom command router (not bot.command)
    // Stage middleware registered:
    expect(fakeBot.use).toHaveBeenCalled();
    // setWebhook invoked (network swallowed by .catch in impl):
    expect(fakeBot.telegram.setWebhook).toHaveBeenCalled();
  });

  it('returns null and disables when token missing', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    const { initBot } = await import('../../../../server/bot/index.js');
    const app = { use: vi.fn() };
    const result = initBot(app, { repos: {}, services: {} });
    expect(result).toBeNull();
  });
  it('trusts a successful set instead of retrying on a lagging readback', { timeout: 30000 }, async () => {
    // Live-proven 2026-10-13: setChatMenuButton returns {ok:true} while
    // getChatMenuButton keeps reading back 'commands' for 10s-90s+ (server-side
    // readback lag). Retrying on that mismatch burned the rate limit and flooded
    // logs (51 warns / 3 min across 6 chats). The boot path must set once and
    // trust the ok:true; scheduled re-asserts cover a genuine late reset.
    fakeBot.telegram.setChatMenuButton.mockImplementation(() => Promise.resolve(true));
    fakeBot.telegram.getChatMenuButton.mockImplementation(() => Promise.resolve({ type: 'commands' }));

    const { initBot } = await import('../../../../server/bot/index.js');
    initBot({ use: vi.fn() }, { repos: {}, services: {} });
    await new Promise((r) => setTimeout(r, 6000));

    // One set for the bot-wide target; no retry storm from the stale readback.
    const setCalls = fakeBot.telegram.setChatMenuButton.mock.calls;
    expect(setCalls.length).toBe(1);
    const arg = setCalls[0][0];
    expect(arg.menu_button.type).toBe('web_app');
    expect(arg.menu_button.web_app.url).toBeTruthy();
  });

  it('stops retrying once the Mini App button is confirmed', { timeout: 30000 }, async () => {
    fakeBot.telegram.setChatMenuButton.mockImplementation(() => Promise.resolve(true));
    fakeBot.telegram.getChatMenuButton.mockImplementation(() => Promise.resolve({ type: 'web_app' }));

    const { initBot } = await import('../../../../server/bot/index.js');
    initBot({ use: vi.fn() }, { repos: {}, services: {} });
    await new Promise((r) => setTimeout(r, 200));

    // Read-first: an already-correct button is confirmed without re-setting it,
    // which is what keeps the periodic re-assert off Telegram's rate limit.
    expect(fakeBot.telegram.getChatMenuButton).toHaveBeenCalled();
    expect(fakeBot.telegram.setChatMenuButton).not.toHaveBeenCalled();
  });

  it('skips setMyCommands when the registered list is unchanged (no button clobber)', { timeout: 30000 }, async () => {
    // Root cause (proven live 2026-09-24): setMyCommands resets the menu button
    // to 'commands', clobbering the Mini App button set in the same boot. A boot
    // that finds the list already registered must therefore NOT call it again.
    const { initBot } = await import('../../../../server/bot/index.js');

    fakeBot.telegram.getMyCommands.mockImplementation(() => Promise.resolve([]));
    fakeBot.telegram.getChatMenuButton.mockImplementation(() => Promise.resolve({ type: 'web_app' }));
    initBot({ use: vi.fn() }, { repos: {}, services: {} });
    await new Promise((r) => setTimeout(r, 50));
    const registered = fakeBot.telegram.setMyCommands.mock.calls[0]?.[0];
    expect(Array.isArray(registered)).toBe(true);
    expect(registered.length).toBeGreaterThan(0);

    // Next boot: Telegram already holds that exact list.
    vi.clearAllMocks();
    fakeBot.telegram.getMyCommands.mockImplementation(() => Promise.resolve(registered));
    fakeBot.telegram.getChatMenuButton.mockImplementation(() => Promise.resolve({ type: 'web_app' }));
    initBot({ use: vi.fn() }, { repos: {}, services: {} });
    await new Promise((r) => setTimeout(r, 50));

    expect(fakeBot.telegram.setMyCommands).not.toHaveBeenCalled();
    expect(fakeBot.telegram.getChatMenuButton).toHaveBeenCalled();
    expect(fakeBot.telegram.setChatMenuButton).not.toHaveBeenCalled();
  });
});
