import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import express from 'express';

/**
 * Telegram webhook mount gate.
 *
 * Proven 2026-09-25: `app.use(webhookPath, bot.webhookCallback(webhookPath))`
 * makes Express strip the mount prefix, so the handler sees `req.url === '/'`
 * while Telegraf's filter compares against its own `hookPath`. The filter never
 * matched, every update fell through to the SPA catch-all and got 200 text/html,
 * and the bot answered nothing — no log line, no error. Boot green, lint green,
 * all bot unit tests green. The bot was deaf and silent.
 *
 * Two halves, each guarding the other's blind spot:
 *   1. Static — the bot source must register the callback path-less. This is the
 *      actual gate; it is what fails if someone reintroduces the mount path.
 *   2. Behavioural — proves the mechanism, so the static rule is not cargo cult:
 *      path-less keeps req.url intact, path-mounted demonstrably strips it, and
 *      non-webhook requests still fall through to later middleware.
 */
const INDEX = readFileSync('server/bot/index.js', 'utf8');
const WEBHOOK_PATH = '/webhook/telegram';

const PATHLESS_MOUNT = [
  'const telegramWebhook = bot.webhookCallback(webhookPath);',
  'app.use((req, res, next) => telegramWebhook(req, res, next));',
];

// Shapes Express strips req.url for. Either one leaves Telegraf comparing
// its hookPath against '/'.
const STRIPPED_MOUNT_SHAPES = [
  'app.use(webhookPath, bot.webhookCallback',
  'app.use(bot.webhookCallback(',
];

/** Mirror of initBot()'s wiring, parameterised by whether the path is mounted. */
async function probeMount({ mountPath }) {
  const seen = [];
  const downstream = [];

  const telegramWebhook = (req, res, next) => {
    seen.push({ url: req.url, method: req.method });
    if (req.url !== WEBHOOK_PATH) return next();
    res.status(200).json({ ok: true });
  };

  const app = express();
  app.use(express.json());
  if (mountPath) app.use(WEBHOOK_PATH, telegramWebhook);
  else app.use((req, res, next) => telegramWebhook(req, res, next));
  app.use((req, res) => {
    downstream.push(req.path);
    res.status(200).type('html').send('<!doctype html>spa');
  });

  const server = await new Promise((resolve) => {
    const srv = app.listen(0, () => resolve(srv));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    const hook = await fetch(`${base}${WEBHOOK_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ update_id: 1 }),
    });
    const hookBody = await hook.text();

    const page = await fetch(`${base}/dashboard`);
    return {
      hookStatus: hook.status,
      hookBody,
      pageBody: await page.text(),
      webhookUrls: seen.filter((r) => r.method === 'POST').map((r) => r.url),
      downstream,
    };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

describe('telegram webhook mount', () => {
  it('registers the webhook callback path-less, never under a mount path', () => {
    const missing = PATHLESS_MOUNT.filter((frag) => !INDEX.includes(frag));
    const offenders = STRIPPED_MOUNT_SHAPES.filter((shape) => INDEX.includes(shape));

    expect(
      { missing, offenders },
      [
        missing.length ? `path-less mount deleted: ${missing.join(' | ')}` : null,
        offenders.length
          ? `path-mounted (Express strips req.url, bot goes deaf): ${offenders.join(', ')}`
          : null,
      ]
        .filter(Boolean)
        .join('; ') || 'webhook mounted path-less',
    ).toEqual({ missing: [], offenders: [] });
  });

  it('path-less mount keeps req.url intact; a mount path strips it to "/"', async () => {
    const pathless = await probeMount({ mountPath: false });
    const mounted = await probeMount({ mountPath: true });

    // Path-less: Telegraf's own hookPath comparison can match, so the update is
    // answered by the webhook rather than falling through to the SPA.
    expect(pathless.webhookUrls).toEqual([WEBHOOK_PATH]);
    expect(pathless.hookBody).toBe(JSON.stringify({ ok: true }));
    expect(pathless.pageBody).toContain('spa');
    expect(pathless.downstream).toContain('/dashboard');

    // Path-mounted: the same wiring hands the handler '/', which is the exact
    // reason the filter missed and the bot went silent. If this ever stops being
    // true, the static rule above needs revisiting rather than blindly keeping.
    expect(mounted.webhookUrls).toEqual(['/']);
    expect(mounted.hookBody).toContain('spa');
  });
});
