import { METRICS, METRIC_CATEGORIES } from '../../lib/rule-metrics.js';
import { RULE_TEMPLATES, ConditionGroup, Condition, RuleAction } from '../../lib/rule-builder.js';

const MONITOR_HEADER =
  '⚡ *Campaign Monitor*\n\n' +
  'Set rules to automatically monitor your campaigns:\n\n' +
  '• *Delivery* — Impressions, clicks, reach, frequency\n' +
  '• *Conversion* — CTR, CVR\n' +
  '• *Cost* — CPC, CPM, CPA, oCPC\n' +
  '• *Efficiency* — ROAS, ROI\n\n' +
  'Choose an action below:';

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
    '📦 *Rule Templates*\n\nPre-built rules for common scenarios:\n\n' +
    '• ROAS Guard — Pause when ROAS < 1x\n' +
    '• Frequency Cap — Pause when frequency > 5\n' +
    '• High CTR Alert — Notify on high CTR\n' +
    '• Low CVR Alert — Notify on low CVR\n' +
    '• CPA Drop Alert — Notify on CPA increase\n' +
    '• CPM Budget Control — Pause when CPM too high',
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } }
  );
}

function renderRulesList(deps, userId) {
  const rules = deps?.repos?.rulesRepo?.getAllEnabled?.(userId) || [];
  if (!rules.length) return '📭 No active rules. Add your first rule!';
  const lines = rules.map((r, i) => {
    const c = r.condition;
    let condStr = '';
    if (c.type === 'leaf') {
      condStr = `${c.metric} ${c.operator} ${c.value}`;
    } else if (c.type === 'group') {
      const op = c.logic.toUpperCase();
      condStr = c.children.map(ch => `${ch.metric} ${ch.operator} ${ch.value}`).join(` ${op} `);
    }
    return `${i + 1}. *${r.name}*\n   ${condStr} → ${r.action.type}`;
  });
  return `📋 *Your Rules:*\n\n${lines.join('\n\n')}`;
}

function showActionPicker(ctx) {
  const rb = ctx.session?.ruleBuilder;
  if (!rb) return ctx.reply('⚠️ Session expired. Start again with /monitor.');
  const m = METRICS[rb.metric];
  const keyboard = [
    [{ text: '🔴 Pause', callback_data: 'rule:add:action:pause' }],
    [{ text: '🟢 Resume', callback_data: 'rule:add:action:resume' }],
    [{ text: '💰 Scale Budget', callback_data: 'rule:add:action:scale_budget' }],
    [{ text: '📢 Notify', callback_data: 'rule:add:action:notify' }],
    [{ text: '🔴📢 Notify + Pause', callback_data: 'rule:add:action:notify_and_pause' }],
    [{ text: '⬅️ Back', callback_data: `rule:add:metric:${rb.metric}` }],
  ];
  return ctx.reply(
    `🎯 *Create Rule*\n\nMetric: *${m.name}*\nOperator: ${rb.operator}\nValue: ${rb.value || '?'}\n\nChoose an action:`,
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } }
  );
}

function createRule(ctx, deps, actionType) {
  const rb = ctx.session?.ruleBuilder;
  if (!rb) return ctx.reply('⚠️ Session expired. Start again with /monitor.');
  if (!rb.value) {
    return ctx.reply(
      `📝 Enter a value for this rule:\n\n${rb.metric} ${rb.operator} [your value]\n\nExample: If CTR > 5, send "5"`,
      { reply_markup: { inline_keyboard: [[{ text: '⬅️ Cancel', callback_data: 'menu:monitor' }]] } }
    );
  }
  const condition = ConditionGroup.and().add(new Condition(rb.metric, rb.operator, parseFloat(rb.value)));
  const action = new RuleAction(actionType);
  try {
    deps.repos.rulesRepo.create({
      userId: ctx.userId,
      name: `${rb.metric} ${rb.operator} ${rb.value}`,
      description: 'Auto-created rule',
      condition: condition.toJSON(),
      action: action.toJSON(),
      priority: 1,
      enabled: true,
    });
    delete ctx.session.ruleBuilder;
    return ctx.reply(
      `✅ Rule created!\n\n${rb.metric} ${rb.operator} ${rb.value} → ${actionType}`,
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
    });
    return ctx.reply(
      `✅ Template applied!\n\n📦 ${tpl.name}\n${tpl.description}`,
      { reply_markup: { inline_keyboard: [[{ text: '📋 View Rules', callback_data: 'rule:view:all' }], [{ text: '📋 Menu', callback_data: 'quick:menu' }]] } }
    );
  } catch (err) {
    return ctx.reply(`❌ Failed: ${err.message}`);
  }
}

function showAccountPicker(ctx, deps) {
  const accounts = metaAccounts(deps, ctx.userId);
  const keyboard = accounts.map(a => [{ text: `⚙️ ${a.account_name || a.id}`, callback_data: `rule:account:${a.id}` }]);
  keyboard.push([{ text: '⬅️ Back', callback_data: 'menu:monitor' }]);
  return ctx.reply('⚙️ *Select Account*\n\nChoose an account to manage rules for:', { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } });
}

export function handleMonitorCallback(deps) {
  return async (ctx) => {
    const action = ctx.match[1];
    await ctx.answerCbQuery();

    if (action === 'start') return showMetricCategories(ctx);
    if (action.startsWith('cat:')) return showMetricsInCategory(ctx, action.split(':')[1]);
    if (action.startsWith('metric:')) return showOperators(ctx, action.split(':')[2]);
    if (action.startsWith('op:')) {
      const parts = action.split(':');
      const metric = parts[2];
      const op = parts[3];
      ctx.session = ctx.session || {};
      ctx.session.ruleBuilder = { metric, operator: op };
      return showActionPicker(ctx);
    }
    if (action.startsWith('action:')) return createRule(ctx, deps, action.split(':')[1]);
    if (action.startsWith('template:')) return applyTemplate(ctx, deps, action.split(':')[1]);
    if (action === 'view:all') {
      return ctx.reply(renderRulesList(deps, ctx.userId), {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '⬅️ Back', callback_data: 'menu:monitor' }]] },
      });
    }
    if (action === 'account_picker') return showAccountPicker(ctx, deps);
    if (action === 'sync') return ctx.reply('🔄 Campaign sync triggered. Check /status for results.');
    return ctx.reply('Unknown rule action.');
  };
}

export default { handleMonitor, handleMonitorCallback };
