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
    telegram: { setWebhook: vi.fn(() => Promise.resolve(true)) },
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
    WizardScene: class { constructor() {} command() { return this; } },
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

  it('mounts webhook callback and registers /metaapp without throwing', async () => {
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
    // /metaapp command registered:
    const metaappCall = fakeBot.command.mock.calls.find((c) => c[0] === 'metaapp');
    expect(metaappCall).toBeTruthy();
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
});
