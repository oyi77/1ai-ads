import { METRICS, METRIC_CATEGORIES } from '../../lib/rule-metrics.js';
import { MetaAdsAPI } from '../../services/meta/index.js';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('monitor');
import { RULE_TEMPLATES, ConditionGroup, Condition, RuleAction, OPERATORS } from '../../lib/rule-builder.js';

const MONITOR_HEADER =
  '⚡ *Campaign Monitor*\n\n' +
  'Set rules to automatically monitor your campaigns:\n\n' +
  '• *Delivery* — Impressions, clicks, reach, frequency\n' +
  '• *Conversion* — CTR, CVR\n' +
  '• *Cost* — CPC, CPM, CPA, oCPC\n' +
  '• *Efficiency* — ROAS, ROI\n\n' +
  'Choose an action below:';

const INTERVAL_LABELS = {
  0: 'Follow FB pacing',
  15: 'Every 15 min',
  30: 'Every 30 min',
  60: 'Every 1 hour',
  360: 'Every 6 hours',
};

function metaAccounts(deps, userId) {
  const rows = deps?.repos?.platformAccountsRepo?.findByUserId?.(userId) ?? [];
  return rows.filter((r) => r.platform === 'meta');
}

function metricsByCategory() {
  const cats = {};
  for (const [key, m] of Object.entries(METRICS)) {
    if (!cats[m.category]) cats[m.category] = [];
    cats[m.category].push({ key, ...m });
  }
  return cats;
}

export function handleMonitor(deps) {
  return (ctx) => {
    const accounts = metaAccounts(deps, ctx.userId);
    const keyboard = [];
    if (accounts.length > 0) {
      keyboard.push([{ text: '⚙️ Account Rules', callback_data: 'rule:account_picker' }]);
    }
    keyboard.push([
      { text: '➕ Add Rule', callback_data: 'rule:add:start' },
      { text: '📋 My Rules', callback_data: 'rule:view:all' },
    ]);
    keyboard.push([
      { text: '📦 Templates', callback_data: 'rule:templates' },
      { text: '🔄 Sync Now', callback_data: 'monitor:sync' },
    ]);
    keyboard.push([{ text: '📋 Menu', callback_data: 'quick:menu' }]);
    return ctx.reply(MONITOR_HEADER, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } });
  };
}

function showMetricCategories(ctx) {
  const cats = metricsByCategory();
  const keyboard = [];
  for (const [catId, catName] of Object.entries(METRIC_CATEGORIES)) {
    const metrics = cats[catId];
    if (metrics && metrics.length > 0) {
      keyboard.push([{ text: catName, callback_data: `rule:add:cat:${catId}` }]);
    }
  }
  keyboard.push([{ text: '⬅️ Back', callback_data: 'menu:monitor' }]);
  return ctx.reply('📊 *Choose Metric Category*\n\nSelect the type of metric to monitor:', { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } });
}

function showMetricsInCategory(ctx, categoryId) {
  const metrics = Object.entries(METRICS).filter(([, m]) => m.category === categoryId);
  const keyboard = [];
  for (const [key, m] of metrics) {
    keyboard.push([{ text: `${m.name}`, callback_data: `rule:add:metric:${key}` }]);
  }
  keyboard.push([{ text: '⬅️ Categories', callback_data: 'rule:add:start' }]);
  return ctx.reply(`📏 *${METRIC_CATEGORIES[categoryId]}*\n\nChoose a metric:`, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } });
}

function showOperators(ctx, metric) {
  const m = METRICS[metric];
  const keyboard = [
    [{ text: '> (greater than)', callback_data: `rule:add:op:${metric}:gt` }],
    [{ text: '< (less than)', callback_data: `rule:add:op:${metric}:lt` }],
    [{ text: '>= (greater or equal)', callback_data: `rule:add:op:${metric}:gte` }],
    [{ text: '<= (less or equal)', callback_data: `rule:add:op:${metric}:lte` }],
    [{ text: '⬅️ Metrics', callback_data: `rule:add:cat:${m.category}` }],
  ];
  return ctx.reply(`📐 *${m.name}*\n\nChoose an operator:`, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } });
}

function showTemplates(ctx) {
  const keyboard = [];
  for (const [key, fn] of Object.entries(RULE_TEMPLATES)) {
    const t = fn();
    keyboard.push([{ text: t.name, callback_data: `rule:template:${key}` }]);
  }
  keyboard.push([{ text: '⬅️ Back', callback_data: 'menu:monitor' }]);
  return ctx.reply(
    '📦 *Rule Templates*\n\nPre-built rules:\n\n' +
    '• ROAS Guard — Pause when ROAS < 1x\n' +
    '• Frequency Cap — Pause when frequency > 5\n' +
    '• High CTR Alert — CTR > 5%\n' +
    '• Low CVR Alert — CVR < 1%\n' +
    '• CPC Spike — CPC > 200\n' +
    '• CPA Drop — CPA < 50k\n' +
    '• CPM Control — CPM > 15k\n' +
    '• Dayparting — Peak hours 6-11PM\n' +
    '• Auto Increase — ROAS > 2x, +20%\n' +
    '• Auto Decrease — ROAS < 1x, -30%\n' +
    '• Auto Duplicate — CVR > 3%, spend > 100k',
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } }
  );
}

function renderRuleCondition(c) {
  if (!c) return '';
  if (c.type === 'leaf') return `${c.metric} ${c.operator} ${c.value}`;
  if (c.type === 'group') {
    const op = c.logic.toUpperCase();
    return c.children.map(ch => renderRuleCondition(ch)).join(` ${op} `);
  }
  return '';
}

// Render My Rules grouped per connected account, with edit/disable buttons
function renderMyRules(deps, userId) {
  const rules = deps?.repos?.rulesRepo?.getAll?.(userId) || [];
  const accounts = metaAccounts(deps, userId);
  const acctNames = {};
  for (const a of accounts) acctNames[a.id] = a.account_name || a.id;

  if (!rules.length) {
    return {
      text: '📭 No rules yet. Tap ➕ Add Rule or 📦 Templates to create your first rule!',
      keyboard: [[{ text: '➕ Add Rule', callback_data: 'rule:add:start' }]],
    };
  }

  // Group rules by account (rules with null accountId go under "All accounts")
  const byAccount = {};
  for (const r of rules) {
    const key = r.accountId || '__all__';
    if (!byAccount[key]) byAccount[key] = [];
    byAccount[key].push(r);
  }

  const lines = [];
  const keyboard = [];
  for (const [acctId, accountRules] of Object.entries(byAccount)) {
    const label = acctId === '__all__' ? '🌐 All Accounts' : `📘 ${acctNames[acctId] || acctId}`;
    lines.push(`*${label}*`);
    for (const r of accountRules) {
      const state = r.enabled ? '🟢' : '⚪️';
      const interval = INTERVAL_LABELS[r.intervalMinutes] || INTERVAL_LABELS[15];
      lines.push(`${state} ${r.enabled ? '' : '(disabled) '}*${r.name}*\n   ${renderRuleCondition(r.condition)} → ${r.action.type} (${interval})`);
    }
    lines.push('');
  }

  const text = `📋 *My Rules*\n\n${lines.join('\n')}`;

  // Per-rule action buttons (edit/disable/enable/delete)
  for (const r of rules.slice(0, 8)) {
    const toggle = r.enabled ? '⏸ Disable' : '▶️ Enable';
    keyboard.push([
      { text: `${toggle}: ${r.name.slice(0, 20)}`, callback_data: `rule:toggle:${r.id}` },
    ]);
  }
  keyboard.push([{ text: '➕ Add Rule', callback_data: 'rule:add:start' }]);
  keyboard.push([{ text: '⬅️ Back', callback_data: 'menu:monitor' }]);
  return { text, keyboard };
}

function showAccountPicker(ctx, deps) {
  const accounts = metaAccounts(deps, ctx.userId);
  if (accounts.length === 0) {
    return ctx.reply('🔌 Connect a Meta account first via /settings to create account-scoped rules.');
  }
  const keyboard = accounts.map(a => [{ text: `⚙️ ${a.account_name || a.id}`, callback_data: `rule:account:${a.id}` }]);
  keyboard.push([{ text: '⬅️ Back', callback_data: 'menu:monitor' }]);
  return ctx.reply('⚙️ *Select Account*\n\nChoose an account to manage rules for:', { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } });
}

function showRulesForAccount(deps, userId, accountId) {
  const rules = deps?.repos?.rulesRepo?.getAll?.(userId) || [];
  const acctRules = rules.filter(r => r.accountId === accountId || !r.accountId);
  if (!acctRules.length) {
    return {
      text: '📭 No rules for this account yet. Create one now!',
      keyboard: [[{ text: '➕ Add Rule', callback_data: 'rule:add:start' }]],
    };
  }
  const lines = acctRules.map((r, i) => {
    const state = r.enabled ? '🟢' : '⚪️';
    return `${i + 1}. ${state} *${r.name}*\n   ${renderRuleCondition(r.condition)} → ${r.action.type}`;
  });
  const keyboard = [];
  for (const r of acctRules.slice(0, 8)) {
    const toggle = r.enabled ? '⏸ Disable' : '▶️ Enable';
    keyboard.push([{ text: `${toggle}: ${r.name.slice(0, 20)}`, callback_data: `rule:toggle:${r.id}` }]);
  }
  keyboard.push([{ text: '➕ Add Rule', callback_data: 'rule:add:start' }]);
  keyboard.push([{ text: '⬅️ Back', callback_data: 'menu:monitor' }]);
  return { text: `⚙️ *Rules for account*\n\n${lines.join('\n\n')}`, keyboard };
}

export function handleMonitorCallback(deps) {
  return async (ctx) => {
    const action = ctx.match[1];
    await ctx.answerCbQuery();

    if (action === 'add:start') return showMetricCategories(ctx);
    if (action.startsWith('add:cat:')) return showMetricsInCategory(ctx, action.split(':')[2]);
    if (action.startsWith('add:metric:')) {
      // FIX: use pop() instead of [3] since callback is rule:add:metric:ctr
      const metric = action.split(':').pop();
      return showOperators(ctx, metric);
    }
    if (action.startsWith('add:op:')) {
      // callback is rule:add:op:<metric>:<operator> → action='add:op:<metric>:<operator>'
      const parts = action.split(':');
      const metric = parts[2];
      const op = parts[3];
      if (!metric || !METRICS[metric] || !op) return ctx.reply('⚠️ Invalid operator selection. Start again with /monitor → Add Rule.');
      ctx.session = ctx.session || {};
      ctx.session.ruleBuilder = { metric, operator: op };
      return showActionPicker(ctx);
    }
    if (action.startsWith('add:action:')) {
      const actionType = action.split(':')[2];
      ctx.session = ctx.session || {};
      ctx.session.ruleBuilder = { ...(ctx.session.ruleBuilder || {}), actionType };
      return showIntervalPicker(ctx);
    }
    if (action.startsWith('add:interval:')) {
      const interval = parseInt(action.split(':')[2], 10);
      ctx.session = ctx.session || {};
      ctx.session.ruleBuilder = { ...(ctx.session.ruleBuilder || {}), interval };
      const rb = ctx.session.ruleBuilder;
      if (!rb.value) {
        // Ask for the numeric threshold, capture it via the text handler
        ctx.session.ruleBuilder.awaitingValue = true;
        return ctx.reply(
          `📝 *Threshold Value*

Rule: ${rb.metric} ${rb.operator} [value]

Send the number to compare against.
Example: for CTR > 5, send \`5\``,
          { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '⬅️ Cancel', callback_data: 'menu:monitor' }]] } }
        );
      }
      return createRule(ctx, deps, ctx.session.ruleBuilder.actionType, interval);
    }
    if (action.startsWith('toggle:')) {
      const ruleId = action.split(':')[1];
      const rule = deps.repos.rulesRepo.getById(ruleId);
      if (!rule) return ctx.reply('⚠️ Rule not found.');
      if (rule.user_id && rule.user_id !== ctx.userId) return ctx.reply('⚠️ Rule not found.');
      deps.repos.rulesRepo.update(ruleId, { enabled: !rule.enabled });
      return ctx.reply(`✅ Rule *${rule.name}* ${rule.enabled ? 'disabled' : 'enabled'}.`, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '📋 My Rules', callback_data: 'rule:view:all' }], [{ text: '📋 Menu', callback_data: 'quick:menu' }]] },
      });
    }
    if (action === 'templates') return showTemplates(ctx);
    if (action.startsWith('template:')) return applyTemplate(ctx, deps, action.split(':')[1]);
    if (action === 'view:all') {
      const { text, keyboard } = renderMyRules(deps, ctx.userId);
      return ctx.reply(text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } });
    }
    if (action === 'account_picker') return showAccountPicker(ctx, deps);
    if (action.startsWith('account:')) {
      const accountId = action.split(':')[1];
      ctx.session = ctx.session || {};
      ctx.session.ruleBuilder = { ...(ctx.session.ruleBuilder || {}), accountId };
      const { text, keyboard } = showRulesForAccount(deps, ctx.userId, accountId);
      return ctx.reply(text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } });
    }
    if (action === 'sync') {
      let synced = 0;
      let failed = 0;
      const accounts = (deps.repos?.platformAccountsRepo?.findByUserId?.(ctx.userId) || [])
        .filter(a => a.platform === 'meta' && a.credentials?.access_token);
      for (const acct of accounts) {
        try {
          const adAccountId = acct.credentials?.ad_account_id;
          if (!adAccountId) { failed++; continue; }
          const api = MetaAdsAPI.withToken(acct.credentials.access_token);
          const campaigns = await api.getCampaigns(adAccountId, { limit: 50 });
          for (const c of campaigns) {
            deps.repos?.campaignsRepo?.upsert?.({
              platform: 'meta',
              campaign_id: c.id,
              name: c.name,
              status: c.status,
              budget: (c.dailyBudget || 0) / 100,
              userId: ctx.userId,
            });
          }
          synced += campaigns.length;
        } catch (e) {
          failed++;
          log.warn('Sync failed for account', { accountId: acct.id, error: e.message });
        }
      }
      return ctx.reply(`🔄 Campaign sync selesai. ${synced} campaign dari Meta${failed ? `, ${failed} gagal.` : '.'}`);
    }
    return ctx.reply('Unknown rule action.');
  };
}

function showActionPicker(ctx) {
  const rb = ctx.session?.ruleBuilder;
  if (!rb) return ctx.reply('⚠️ Session expired. Start again with /monitor.');
  const m = METRICS[rb.metric];
  const keyboard = [
    [{ text: '🔴 Pause', callback_data: 'rule:add:action:pause' }],
    [{ text: '🟢 Resume', callback_data: 'rule:add:action:resume' }],
    [{ text: '📈 Increase Budget', callback_data: 'rule:add:action:increase_budget' }],
    [{ text: '📉 Decrease Budget', callback_data: 'rule:add:action:decrease_budget' }],
    [{ text: '📋 Duplicate', callback_data: 'rule:add:action:duplicate_campaign' }],
    [{ text: '💰 Scale Budget', callback_data: 'rule:add:action:scale_budget' }],
    [{ text: '📢 Notify', callback_data: 'rule:add:action:notify' }],
    [{ text: '🔴📢 Notify + Pause', callback_data: 'rule:add:action:notify_and_pause' }],
    [{ text: '⬅️ Back', callback_data: `rule:add:metric:${rb.metric}` }],
  ];
  return ctx.reply(
    `🎯 *Create Rule*\n\nMetric: *${m.name}*\nOperator: ${OPERATORS[rb.operator] || rb.operator}\nValue: ${rb.value || '?'}\n\nChoose an action:`,
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } }
  );
}

function showIntervalPicker(ctx) {
  const rb = ctx.session?.ruleBuilder;
  if (!rb) return ctx.reply('⚠️ Session expired. Start again with /monitor.');
  const keyboard = [
    [{ text: '⏱ Every 15 minutes', callback_data: 'rule:add:interval:15' }],
    [{ text: '⏱ Every 30 minutes', callback_data: 'rule:add:interval:30' }],
    [{ text: '⏱ Every 1 hour', callback_data: 'rule:add:interval:60' }],
    [{ text: '⏱ Every 6 hours', callback_data: 'rule:add:interval:360' }],
    [{ text: '⏱ Follow FB pacing', callback_data: 'rule:add:interval:0' }],
    [{ text: '⬅️ Back', callback_data: `rule:add:action:${rb.actionType || 'notify'}` }],
  ];
  const ACTION_LABELS = {
    pause: 'Pause campaign', resume: 'Resume campaign',
    increase_budget: 'Increase budget', decrease_budget: 'Decrease budget',
    duplicate_campaign: 'Duplicate campaign', scale_budget: 'Scale budget',
    notify: 'Notify', notify_and_pause: 'Notify + Pause',
  };
  const opSymbol = OPERATORS[rb.operator] || rb.operator;
  return ctx.reply(
    `🎯 *Create Rule*\n\nMetric: *${METRICS[rb.metric]?.name}*\nCondition: ${METRICS[rb.metric]?.name} ${opSymbol} ${rb.value || '?'}\nAction: ${ACTION_LABELS[rb.actionType] || rb.actionType}\n\n⏱ *Evaluation Interval*\n\nHow often should this rule be checked?`,
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } }
  );
}

function createRule(ctx, deps, actionType, intervalMinutes = 15) {
  const rb = ctx.session?.ruleBuilder;
  if (!rb) return ctx.reply('⚠️ Session expired. Start again with /monitor.');
  if (!rb.value) {
    return ctx.reply(
      `📝 Enter a value for this rule:\n\n${rb.metric} ${rb.operator} [your value]\n\nExample: If CTR > 5, send "5"`,
      { reply_markup: { inline_keyboard: [[{ text: '⬅️ Cancel', callback_data: 'menu:monitor' }]] } }
    );
  }
  // rb.operator comes from callbacks as 'gt'/'lt'/'gte'/'lte'; Condition needs '>'/'<'/'>='/'<='
  const opSymbol = OPERATORS[rb.operator] || rb.operator;
  const condition = ConditionGroup.and().add(new Condition(rb.metric, opSymbol, parseFloat(rb.value)));
  const action = new RuleAction(actionType);
  try {
    deps.repos.rulesRepo.create({
      userId: ctx.userId,
      accountId: rb.accountId || null,
      name: `${rb.metric} ${rb.operator} ${rb.value}`,
      description: 'Auto-created rule',
      condition: condition.toJSON(),
      action: action.toJSON(),
      priority: 1,
      enabled: true,
      intervalMinutes,
    });
    delete ctx.session.ruleBuilder;
    return ctx.reply(
      `✅ Rule created!\n\n${rb.metric} ${OPERATORS[rb.operator] || rb.operator} ${rb.value} → ${actionType}\n⏱ ${intervalMinutes === 0 ? 'Follows FB pacing' : 'Checks every ' + (INTERVAL_LABELS[intervalMinutes] || intervalMinutes + ' min')}`,
      { reply_markup: { inline_keyboard: [[{ text: '📋 View Rules', callback_data: 'rule:view:all' }], [{ text: '📋 Menu', callback_data: 'quick:menu' }]] } }
    );
  } catch (err) {
    return ctx.reply(`❌ Failed: ${err.message}`);
  }
}

function applyTemplate(ctx, deps, tplKey) {
  const fn = RULE_TEMPLATES[tplKey];
  if (!fn) return ctx.reply('⚠️ Template not found.');
  const tpl = fn();
  try {
    deps.repos.rulesRepo.create({
      userId: ctx.userId,
      name: tpl.name,
      description: tpl.description,
      condition: tpl.condition.toJSON(),
      action: tpl.action.toJSON(),
      priority: tpl.priority,
      enabled: true,
      intervalMinutes: tpl.intervalMinutes || 15,
    });
    return ctx.reply(
      `✅ Template applied!\n\n📦 ${tpl.name}\n${tpl.description}`,
      { reply_markup: { inline_keyboard: [[{ text: '📋 View Rules', callback_data: 'rule:view:all' }], [{ text: '📋 Menu', callback_data: 'quick:menu' }]] } }
    );
  } catch (err) {
    return ctx.reply(`❌ Failed: ${err.message}`);
  }
}

export function handleMonitorText(deps) {
  return async (ctx) => {
    const rb = ctx.session?.ruleBuilder;
    if (!rb || !rb.awaitingValue) return false;
    const text = (ctx.message?.text || '').trim();
    if (!text || !/^[0-9.]+$/.test(text)) {
      await ctx.reply(`⚠️ Please send a valid number for the threshold (e.g. 5 or 1.5).`);
      return true;
    }
    rb.value = text;
    rb.awaitingValue = false;
    await createRule(ctx, deps, rb.actionType, rb.interval);
    return true;
  };
}

export default { handleMonitor, handleMonitorCallback };
