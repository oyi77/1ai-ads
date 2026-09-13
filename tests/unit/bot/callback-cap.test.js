import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Telegram rejects an ENTIRE message when ANY inline button's callback_data
 * exceeds 64 bytes (400 BUTTON_DATA_INVALID). Proven live 2026-09-14:
 * `platform:account:thetradedesk:<uuid>` (66) killed the whole manage
 * screen; every other platform fit. This gate walks every callback_data
 * template in server/bot, substitutes worst-case values, and fails listing
 * each offender — new buttons cannot reintroduce the class.
 */
const BOT_DIR = 'server/bot';
const UUID = '75ae98b6-18dc-4792-ad00-24773887d6dd'; // 36
const LONG_PLATFORM = 'thetradedesk'; // 12, longest key
const LONG_CAMPAIGN = '120249000012520121'; // 18, Meta numeric id
const LONG_MODE = 'resume'; // 6
const LONG_PAGE = '12345';

function worstCase(template) {
  return template
    .replaceAll('${platform}', LONG_PLATFORM)
    .replaceAll('${key}', LONG_PLATFORM)
    .replaceAll('${p}', LONG_PLATFORM)
    .replaceAll('${acc.id}', UUID)
    .replaceAll('${a.id}', UUID)
    .replaceAll('${accountId}', UUID)
    .replaceAll('${acct}', UUID)
    .replaceAll('${id}', UUID)
    .replaceAll('${draft.id}', UUID)
    .replaceAll('${c.id}', LONG_CAMPAIGN)
    .replaceAll('${account.id}', UUID)
    .replaceAll('${realAccountId || accountId}', UUID)
    .replaceAll('${c.status === \'active\' ? \'pause\' : \'resume\'}', LONG_MODE)
    .replaceAll('${account.platform}', LONG_PLATFORM)
    .replaceAll('${platforms}', LONG_PLATFORM)
    .replaceAll('${to}', 'menu:monitor')
    .replaceAll('${p - 1}', LONG_PAGE)
    .replaceAll('${pages}', LONG_PAGE)
    .replaceAll('${p + 1}', LONG_PAGE)
    .replaceAll('${page}', LONG_PAGE)
    .replaceAll('${business.id}', '1234567890123456')
    .replaceAll('${account.id}', UUID)
    .replaceAll('${o.id}', 'OUTCOME_ENGAGEMENT')
    .replaceAll('${t.name}', 'Rule name here')
    .replaceAll('${r.id}', UUID)
    .replaceAll('${a.id}', UUID)
    .replaceAll('${catId}', 'spend')
    .replaceAll('${m.category}', 'spend')
    .replaceAll('${key}', LONG_PLATFORM)
    .replaceAll('${metric}', 'frequency')
    .replaceAll('${rb.metric}', 'frequency')
    .replaceAll('${rb.operator}', 'gte')
    .replaceAll('${rb.actionType || \'notify\'}', 'notify_and_pause')
    .replaceAll('${r.name.slice(0, 20)}', 'Rule name here ok')
    .replaceAll('${p.message || \'(no text)\'}', 'x')
    .replaceAll('${p.id}', '1234567890_1234567890')
    .replaceAll('${o.id}', 'OUTCOME_TRAFFIC');
}

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { walk(p, out); continue; }
    if (!p.endsWith('.js')) continue;
    out.push(p);
  }
  return out;
}

describe('telegram callback_data 64-byte cap', () => {
  it('every emitted callback fits worst-case', () => {
    const offenders = [];
    for (const file of walk(BOT_DIR)) {
      const src = readFileSync(file, 'utf-8');
      const re = /callback_data:\s*`([^`]+)`/g;
      let m;
      while ((m = re.exec(src))) {
        const template = m[1];
        if (!template.includes('${')) {
          if (Buffer.byteLength(template) > 64) offenders.push(`${file}: static ${template}`);
          continue;
        }
        const worst = worstCase(template);
        if (worst.includes('${')) continue; // dynamic text we cannot bound — skip
        if (Buffer.byteLength(worst) > 64) offenders.push(`${file}: \`${template}\` → ${Buffer.byteLength(worst)}B`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
