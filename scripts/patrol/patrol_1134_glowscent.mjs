/**
 * Satpam 1134 Patrol – Glowscent
 * Fetches campaigns + insights, classifies, renames winners, kills underperformers.
 */
import https from 'node:https';
import http from 'node:http';
import fs from 'node:fs';

const ACCOUNT_ID = process.env.FB_ACCOUNT_ID || process.env.META_ACCOUNT_ID || 'act_2125021885010866';
const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || process.env.FB_ACCESS_TOKEN || '';
const API_VERSION = 'v22.0';
const BASE = `https://graph.facebook.com/${API_VERSION}/${ACCOUNT_ID}`;

const CONFIG = {
  cpcWin: { max: 3000 },          // win CPC < 3k IDR
  cpcSuper: { max: 1500 },        // super CPC < 1.5k IDR
  ctrWin: { min: 0.015, max: 0.06 },  // 1.5% - 6%
  ctrSuper: { min: 0.03, max: 0.05 },
  roasWin: { min: 2.0 },
  roasSuper: { min: 4.0 },
  kill: {
    cpcMin: 8000,                 // kill if CPC > 8k
    ctrMax: 0.008,                // kill if CTR < 0.8%
    roasMin: 0.8,                 // kill if ROAS < 0.8
  },
  killNames: ['CBO', 'ABO', 'TEST'],
};

function api(url, body = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const qs = new URLSearchParams({ access_token: ACCESS_TOKEN });
    for (const [k, v] of Object.entries(body || {})) qs.append(k, v === '' ? '' : v);
    const opts = { hostname: u.hostname, path: `${u.pathname}?${qs.toString()}` };
    if (body !== null) opts.method = 'POST';
    const req = u.protocol === 'https:' ? https.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { const j = JSON.parse(d); j.error ? reject(j.error) : resolve(j); }
        catch { reject(new Error('Invalid JSON: ' + d.slice(0, 200))); }
      });
    }) : http.request(opts, res => { /* same */ });
    req.on('error', reject);
    if (body !== null) req.write(JSON.stringify(body));
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchCampaigns() {
  const fields = [
    'id', 'name', 'status', 'objective', 'daily_budget', 'lifetime_budget',
    'configured_status', 'is_skadnetwork_enabled', 'bid_strategy', 'status',
    'special_ad_categories',
  ].join(',');
  const url = `${BASE}/campaigns?fields=${encodeURIComponent(fields)}&limit=100`;
  const data = await api(url);
  return data.data || [];
}

async function fetchInsights(campaignId) {
  const fields = [
    'campaign_name', 'spend', 'clicks', 'impressions', 'ctr', 'cpc',
    'inline_link_clicks', 'actions', 'cost_per_action_type',
  ].join(',');
  const url = `${BASE}/insights?fields=${encodeURIComponent(fields)}&filtering=[{'field':'campaign.id','operator':'EQUAL','value':'${campaignId}'}]&date_preset=last_7d&limit=200`;
  try {
    const data = await api(url);
    const arr = data.data || [];
    return arr.length ? arr[0] : null;
  } catch (e) {
    return null;
  }
}

function parseActionValue(actions, actionType) {
  if (!actions) return null;
  const a = actions.find(x => x.action_type === actionType && x.value !== null);
  return a ? parseFloat(a.value) : null;
}

function parseCPA(costPerAction, actionType) {
  if (!costPerAction) return null;
  const a = costPerAction.find(x => x.action_type === actionType);
  return a ? parseFloat(a.cost_per_action) : null;
}

function classify(ins, cpcData, roiData) {
  const cpc = ins.cpc || 0;
  const ctr = ins.ctr || 0;
  const roas = roiData ? parseFloat(roiData) : -1;

  if (CONFIG.cpcSuper.max >= cpc && CONFIG.ctrSuper.min <= ctr && CONFIG.ctrSuper.max >= ctr
      && roas >= CONFIG.roasSuper.min)
    return 'SUPER';

  if (CONFIG.cpcWin.max >= cpc && CONFIG.ctrWin.min <= ctr && CONFIG.ctrWin.max >= ctr
      && roas >= CONFIG.roasWin.min)
    return 'WIN';

  if (CONFIG.kill.cpcMin < cpc || CONFIG.kill.ctrMax > ctr || roas < CONFIG.kill.roasMin)
    return 'KILL';

  // check naming offset for CBO/ABO/TEST kiilers
  const upper = (ins.campaign_name || '');
  const isKillerName = CONFIG.killNames.some(k => upper.toUpperCase().includes(k));
  if (isKillerName) return 'KILL';

  return 'NEUTRAL';
}

async function renameCampaign(id, newName) {
  try {
    const r = await api(`/${id}`, { name: newName });
    if (r.success || r.id) return true;
    return true; // graph returns updated object
  } catch (e) {
    return false;
  }
}

async function updateStatus(id, status) {
  try {
    const r = await api(`/${id}`, { status });
    return !!r.success || !!r.id;
  } catch (e) {
    return false;
  }
}

async function main() {
  console.log('🍃 Starting Satpam 1134 Glowscent patrol...');
  const campaigns = await fetchCampaigns();
  console.log(`Fetched campaigns: ${campaigns.length}`);

  const active = campaigns.filter(c => ['ACTIVE', 'PAUSED', 'PENDING_REVIEW', 'DISAPPROVED'].includes(c.configured_status || c.status));
  console.log(`Active/Pervasive: ${active.length}`);

  const enriched = [];
  for (const c of active) {
    console.log(`  Fetching insights for ${c.id} (${c.name})`);
    await sleep(1500);
    const ins = await fetchInsights(c.id);
    const cpc = ins?.cpc ? ins.cpc : null;
    const ctr = ins?.ctr ?? ((ins?.clicks && ins?.impressions) ? (ins.clicks / ins.impressions) : null);
    const spend = ins?.spend ? parseFloat(ins.spend) : 0;
    const clicks = ins?.clicks || 0;
    const impressions = ins?.impressions || 0;
    const costPerPurchase = parseCPA(ins?.cost_per_action_type, 'PURCHASE');
    const purchases = parseActionValue(ins?.actions, 'PURCHASE');
    const inlineClicks = ins?.inline_link_clicks || 0;
    const roas = (costPerPurchase && costPerPurchase > 0) ? (spend / costPerPurchase) : -1;

    // spend > 0 AND at least one KPI present
    const hasKpi = spend > 0 && !!(cpc || clicks || costPerPurchase);

    const { tierName } = hasKpi ? { tierName: classify(ins, cpc, roas) } : { tierName: 'NO_DATA' };

    enriched.push({
      id: c.id,
      name: c.name,
      raw: c,
      insights: ins,
      metrics: { cpc, ctr, spend, clicks, impressions, purchases, costPerPurchase, roas, inlineClicks },
      tier: tierName,
    });
  }

  const winners = enriched.filter(e => e.tier === 'WIN');
  const supers = enriched.filter(e => e.tier === 'SUPER');
  const kills = enriched.filter(e => e.tier === 'KILL');
  const neutrals = enriched.filter(e => e.tier === 'NEUTRAL');
  const noData = enriched.filter(e => e.tier === 'NO_DATA');

  const renameOps = [];
  for (const e of winners) {
    const newName = `🌟_${e.name.replace(/^🌟_/, '')}`;
    if (e.name !== newName) renameOps.push({ id: e.id, oldName: e.name, newName });
  }
  for (const e of supers) {
    const newName = `🌟_${e.name.replace(/^🌟_/, '')}`;
    if (e.name !== newName) renameOps.push({ id: e.id, oldName: e.name, newName });
  }

  // Execute mutations
  let renamedCount = 0;
  let renameErrors = [];
  for (const op of renameOps) {
    await sleep(1500);
    console.log(`Renaming campaing ${op.id}: ${op.oldName} -> ${op.newName}`);
    if (await renameCampaign(op.id, op.newName)) {
      renamedCount++;
      op.status = 'RENAMED';
    } else {
      renameErrors.push(op);
      op.status = 'FAILED';
    }
  }

  let killedCount = 0;
  let killErrors = [];
  for (const e of kills) {
    await sleep(1500);
    console.log(`Killing campaing ${e.id}: ${e.name}`);
    if (await updateStatus(e.id, 'PAUSED')) {
      killedCount++;
      e.tier = 'KILLED';
    } else {
      killErrors.push(e);
    }
  }

  // Build report
  const winnersList = enriched.filter(e => e.tier === 'WIN').map(e => e.name);
  const winnersData = enriched.filter(e => e.tier === 'WIN').map(e => ({
    name: e.name,
    cpc: e.metrics.cpc,
    ctr: e.metrics.ctr ? `${(e.metrics.ctr * 100).toFixed(2)}%` : null,
    roas: e.metrics.roas,
    spend: e.metrics.spend,
  }));
  const supersList = enriched.filter(e => e.tier === 'SUPER').map(e => e.name);
  const supersData = enriched.filter(e => e.tier === 'SUPER').map(e => ({
    name: e.name,
    cpc: e.metrics.cpc,
    ctr: e.metrics.ctr ? `${(e.metrics.ctr * 100).toFixed(2)}%` : null,
    roas: e.metrics.roas,
    spend: e.metrics.spend,
  }));
  const killedList = kills.map(e => e.name);
  const neutralsList = neutrals.map(e => e.name);
  const noDataList = noData.map(e => e.name);

  const report = `
# 🍃 Satpam 1134 Glowscent Patrol Report
Account: ${ACCOUNT_ID}
Date: ${new Date().toISOString()}

## Summary
- Total campaigns fetched: ${campaigns.length}
- Active/Pervasive: ${active.length}
- Renamed: ${renamedCount} (${renameErrors.length} failures)
- Killed (paused): ${killedCount} (${killErrors.length} failures)
- No data / unmeasurable: ${noData.length}

## Winners (${winnersList.length})
${winnersList.map(n => '- ' + n).join('\n') || '(none)'}
### Winner metrics
${winnersData.map(w => `- ${w.name}: CPC ${w.cpc ?? '-'}, CTR ${w.ctr ?? '-'}, ROAS ${w.roas ?? '-'}, spend ${w.spend ?? '-'}`).join('\n') || '(none)'}

## Supers (${supersList.length})
${supersList.map(n => '- ' + n).join('\n') || '(none)'}
### Super metrics
${supersData.map(w => `- ${w.name}: CPC ${w.cpc ?? '-'}, CTR ${w.ctr ?? '-'}, ROAS ${w.roas ?? '-'}, spend ${w.spend ?? '-'}`).join('\n') || '(none)'}

## Killed (${killedList.length})
${killedList.map(n => '- ' + n).join('\n') || '(none)'}

## Neutrals (${neutralsList.length})
${neutralsList.map(n => '- ' + n).join('\n') || '(none)'}

## No Data / Unmeasurable (${noDataList.length})
${noDataList.map(n => '- ' + n).join('\n') || '(none)'}
`.trim();

  const outPath = '/home/openclaw/projects/1ai-ads/outputs/1134_glowscent_patrol_report.md';
  fs.mkdirSync('/home/openclaw/projects/1ai-ads/outputs', { recursive: true });
  fs.writeFileSync(outPath, report);
  console.log('Report saved to', outPath);
  console.log('\n' + report);
}

main().catch(e => { console.error(e); process.exit(1); });
