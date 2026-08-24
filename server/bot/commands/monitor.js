/**
 * /monitor command — Campaign monitoring & rules
 * Ported from asisten-jualan/bot/handlers/monitor.py
 *
 * Rules can be scoped per Meta ads account or global:
 *  - account_id IS NULL  → global rule, applies to every account
 *  - account_id = <id>   → rule applies only to that account
 */

const MONITOR_HEADER =
  '⚡ *Campaign Monitor*\n\n' +
  'Set rules to automatically monitor your campaigns:\n\n' +
  '• *Spend Guard* — Alert when daily spend exceeds threshold\n' +
  '• *ROAS Guard* — Alert when ROAS drops below target\n' +
  '• *CTR Guard* — Alert when CTR falls below minimum\n' +
  '• *Auto-Pause* — Pause campaigns that violate rules\n\n' +
  'Configure via inline buttons below:';

const MONITOR_FOOTER = [
  [{ text: '📊 View Rules', callback_data: 'rule:view:global' }],
  [{ text: '➕ Add Spend Rule', callback_data: 'rule:set:spend:global' }],
  [{ text: '➕ Add ROAS Rule', callback_data: 'rule:set:roas:global' }],
  [{ text: '🔄 Sync Now', callback_data: 'monitor:sync' }],
];

function metaAccounts(deps, userId) {
  const rows = deps?.repos?.platformAccountsRepo?.findByUserId?.(userId) ?? [];
  return rows.filter((r) => r.platform === 'meta');
}

export function handleMonitor(deps) {
  return (ctx) => {
    const accounts = metaAccounts(deps, ctx.userId);
    if (accounts.length === 0) {
      return ctx.reply(MONITOR_HEADER, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: MONITOR_FOOTER },
      });
    }

    const keyboard = accounts.map((a) => [
      { text: `⚙️ ${a.account_name || a.id}`, callback_data: `rule:view:${a.id}` },
    ]);
    keyboard.push([
      { text: '🌐 Global (all accounts)', callback_data: 'rule:view:global' },
    ]);
    keyboard.push(MONITOR_FOOTER[3]);

    return ctx.reply(
      '⚡ *Campaign Monitor*\n\n' +
        'Select an ads account to manage its rules, or choose *Global* to apply rules to every account:',
      {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard },
      }
    );
  };
}

function renderRulesList(rules, scope) {
  if (rules.length === 0) {
    return {
      msg: `📭 Belum ada rule untuk ${scope === 'global' ? 'semua akun (global)' : 'akun ini'}.`,
      keyboard: [],
    };
  }
  const lines = rules.map((r, i) => {
    const cond = r.condition || '';
    const act = r.action || '';
    const enabled = r.enabled ? '✅' : '⛔';
    return `${i + 1}. ${enabled} *${r.name}*\n   kondisi: ${cond}\n   aksi: ${act}\n   prioritas: ${r.priority}`;
  });
  return {
    msg: `📋 *Rules — ${scope === 'global' ? 'Global' : 'Akun'}:*\n\n${lines.join('\n\n')}`,
    keyboard: rules.map((r) => [
      { text: `🗑️ Hapus ${r.name}`, callback_data: `rule:del:${r.id}` },
    ]),
  };
}

export function handleMonitorCallback(deps) {
  return async (ctx) => {
    const [base, ...rest] = ctx.match[1].split(':');
    await ctx.answerCbQuery();

    const scope = rest[0] || 'global';

    switch (base) {
      case 'sync':
        return ctx.reply('🔄 Campaign sync triggered. Check /status for results.');
      case 'view': {
        const all = deps?.repos?.rulesRepo?.getAll?.(ctx.userId) ?? [];
        const rules = all.filter((r) =>
          scope === 'global'
            ? r.account_id === null
            : r.account_id === null || String(r.account_id) === String(scope)
        );
        const { msg, keyboard } = renderRulesList(rules, scope);
        return ctx.reply(msg, {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: keyboard },
        });
      }
      case 'set': {
        const sub = rest[1] || 'spend';
        const metric = sub === 'roas' ? 'roas' : 'spend';
        deps?.repos?.rulesRepo?.create?.({
          user_id: ctx.userId,
          name: `${metric === 'roas' ? 'ROAS Guard' : 'Spend Guard'} (${scope})`,
          condition: JSON.stringify({ metric, operator: 'gt', threshold: 0 }),
          action: JSON.stringify({ type: 'alert' }),
          priority: 1,
          enabled: true,
          account_id: scope === 'global' ? null : scope,
        });
        const target = scope === 'global' ? 'semua akun (global)' : `akun ${scope}`;
        return ctx.reply(
          `✅ Rule *${metric === 'roas' ? 'ROAS Guard' : 'Spend Guard'}* dibuat untuk ${target}.\n` +
            'Atur threshold detailnya di dashboard: /app'
        );
      }
      case 'del': {
        const id = rest[0];
        if (!id) return ctx.reply('⚠️ Rule tidak ditemukan.');
        deps?.repos?.rulesRepo?.delete?.(id);
        return ctx.reply('✅ Rule dihapus.');
      }
      default:
        return ctx.reply('Monitor action received. Configure rules via the dashboard: /app');
    }
  };
}
