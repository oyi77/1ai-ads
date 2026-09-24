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
  it('re-asserts the Mini App menu button until the readback confirms it', { timeout: 30000 }, async () => {
    // Regression (proven live 2026-09-24): setWebhook causes Telegram to reset
    // the chat menu button to 'commands', and that reset lands *after*
    // setWebhook resolves — so a single chained setChatMenuButton still lost the
    // race while the boot log claimed success. The boot path must read the
    // button back and retry until Telegram reports the Mini App button.
    let reads = 0;
    fakeBot.telegram.setChatMenuButton.mockImplementation(() => Promise.resolve(true));
    fakeBot.telegram.getChatMenuButton.mockImplementation(() => {
      reads += 1;
      // First two reads: the webhook reset has not been observed as applied.
      return Promise.resolve(reads <= 2 ? { type: 'commands' } : { type: 'web_app' });
    });

    const { initBot } = await import('../../../../server/bot/index.js');
    initBot({ use: vi.fn() }, { repos: {}, services: {} });
    // Two reverted reads must be retried through: 1.5s then 3s of backoff.
    await new Promise((r) => setTimeout(r, 6000));

    expect(fakeBot.telegram.getChatMenuButton).toHaveBeenCalled();
    // Retried past the reverted reads instead of trusting a single set.
    expect(fakeBot.telegram.setChatMenuButton.mock.calls.length).toBe(3);
    const arg = fakeBot.telegram.setChatMenuButton.mock.calls[2][0];
    expect(arg.menu_button.type).toBe('web_app');
    expect(arg.menu_button.web_app.url).toBeTruthy();
  });

  it('stops retrying once the Mini App button is confirmed', { timeout: 30000 }, async () => {
    fakeBot.telegram.setChatMenuButton.mockImplementation(() => Promise.resolve(true));
    fakeBot.telegram.getChatMenuButton.mockImplementation(() => Promise.resolve({ type: 'web_app' }));

    const { initBot } = await import('../../../../server/bot/index.js');
    initBot({ use: vi.fn() }, { repos: {}, services: {} });
    await new Promise((r) => setTimeout(r, 200));

    expect(fakeBot.telegram.setChatMenuButton.mock.calls.length).toBe(1);
  });
});
