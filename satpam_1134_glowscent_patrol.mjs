/**
 * Satpam 1134 Patrol – Glowscent
 * - Fetches campaigns and 7-day insights
 * - Classifies by 3-layer decision matrix
 * - Renames WINNER / SUPER campaigns with 🌟_
 * - Pauses (kills) CBO / ABO / TEST offender campaigns
 * - Writes aggregate patrol report
 */
import https from 'node:https';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ENV_PATH = '/home/openclaw/projects/1ai-ads/.env';
const ACCOUNT_ID = 'act_2125021885010866';
const API_VERSION = 'v22.0';
const REPORT_PATH = '/home/openclaw/projects/1ai-ads/outputs/satpam_1134_glowscent_report.json';

function loadEnvToken() {
  const raw = fs.readFileSync(ENV_PATH, 'utf8');
  const m = raw.match(/^META_ACCESS_TOKEN=(.+)$/m);
  if (!m || !m[1]) throw new Error('META_ACCESS_TOKEN missing from .env');
  return m[1].trim();
}

function api(url, body = null) {
  const u = new URL(url);
  const qs = new URLSearchParams({ access_token: loadEnvToken() });
  for (const [k, v] of Object.entries(body || {})) qs.append(k, String(v));
  u.search = qs.toString();
  return new Promise((resolve, reject) => {
    const req = u.protocol === 'https:'
      ? https.request(u, res => collect(res, resolve, reject))
      : http.request(u, res => collect(res, resolve, reject));
    req.on('error', reject);
    if (body !== null) req.write(JSON.stringify(body));
    req.end();
  });
}

function collect(res, resolve, reject) {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    try {
      const j = JSON.parse(d);
      j.error ? reject(new Error(JSON.stringify(j.error))) : resolve(j);
    } catch (e) {
      reject(e);
    }
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchCampaigns() {
  const fields = [
    'id', 'name', 'status', 'configured_status', 'special_ad_categories',
    'bid_strategy',
  ].join(',');
  const url = `https://graph.facebook.com/${API_VERSION}/${ACCOUNT_ID}/campaigns?fields=${fields}&limit=100&access_token=<SECRET_9a86de34>`;k`
  const j = await api(url);
  return j.data || [];
}

async function fetchInsights(campaignId) {
  const fields = [
    'campaign_name', 'spend', 'clicks', 'impressions', 'ctr', 'cpc',
    'inline_link_clksers', 'actions', 'cost_per_action_type',
    'cpp', 'cpm',
  ].join(',');
  const url = `https://graph.facebook.com/${API_VERSION}/${ACCOUNT_ID}/insights?fields=${fields}&filtering=[{"field":"campaign.id","operator":"EQUAL","value":"${campaignId}"}]&date_preset=last_7d&limit=200&access_token=<SECRET_9a86de34>`;k`
  const j = await api(url);
  return (j.data && j.data[0]) || null;
}

function parseVal(actions, actionType) {
  if (!actions) return null;
  const x = actions.find(a => a.action_type === actionType && a.value != null);
  return x ? parseFloat(x.value) : null;
}
function parseCPA(cpa, actionType) {
  if (!cpa) return null;
  const x = cpa.find(a => a.action_type === actionType);
  return x ? parseFloat(x.cost_per_action) : null;
}

function classify(cpc, ctr, roas, name) {
  const upper = (name || '').toUpperCase();
  // Killer name override
  const isKiller = /(?:^|[\s\-_])?(?:CBO|ABO|TEST)(?:[\s\-_]|$)/.test(upper);
  // Layer 1: KILL conditions
  if (isKiller || cpc > 8000 || (ctr < 0.008 && ctr >= 0) || (roas > -1 && roas < 0.8)) {
    return 'KILL';
  }
  if (roas < 0 && cpc > 0 && ctr < 0.008) return 'KILL';
  // Layer 2: SUPER exceptions
  if (cpc <= 1500 && ctr >= 0.03 && ctr <= 0.05 && roas >= 4.0) return 'SUPER';
  // Layer 3: WIN
  if (cpc <= 3000 && ctr >= 0.015 && ctr <= 0.06 && roas >= 2.0) return 'WIN';
  // Fallback
  if (ctr < 0.008 || (roas > -1 && roas < 1.0) || cpc > 6000) return 'KILL';
  return 'NEUTRAL';
}

async function renameCampaign(id, name) {
  const url = `https://graph.facebook.com/${API_VERSION}/${id}?access_token=<SECRET_9a86de34>`;k`
  const j = await api(url, { name });
  return j.success || j.id ? true : false;
}

async function pauseCampaign(id) {
  const url = `https://graph.facebook.com/${API_VERSION}/${id}?access_token=<SECRET_9a86de34>`;k`
  const j = await api(url, { status: 'PAUSED' });
  return j.success || j.id ? true : false;
}

function fmt(x) {
  if (x == null) return '-';
  if (typeof x === 'number') return Number.isInteger(x) ? String(x) : x.toFixed(2);
  return String(x);
}

(async () => {
  try {
    const campaigns = await fetchCampaigns();
    console.error(`campaigns_fetched=${campaigns.length}`);
    const rows = [];
    for (const c of campaigns) {
      console.error(`insights_start campaign_id=${c.id}`);
      await sleep(1500);
      const ins = await fetchInsights(c.id);
      const spend = ins?.spend ? parseFloat(ins.spend) : 0;
      const cpc = ins?.cpc ? parseFloat(ins.cpc) : null;
      const ctr = ins?.ctr ? parseFloat(ins.ctr) / 100 : (ins?.ctr != null ? parseFloat(ins.ctr) : null);
      const clicks = ins?.clicks ?? 0;
      const impressions = ins?.impressions ?? 0;
      const purchases = parseVal(ins?.actions, 'PURCHASE');
      const cpa = parseCPA(ins?.cost_per_action_type, 'PURCHASE');
      const roas = (cpa && cpa > 0 && spend > 0) ? (spend / cpa) : -1;
      const cpm = ins?.cpm ? parseFloat(ins.cpm) : null;
      const cpp = ins?.cpp ? parseFloat(ins.cpp) : null;
      const tier = classify(cpc, ctr, roas, c.name);
      rows.push({ id: c.id, name: c.name, status: c.status, configured_status: c.configured_status, tier, spend, cpc, ctr, roas, clicks, impressions, purchases, cpa, cpm, cpp });
    }
    console.error('classification_complete');

    const winners = rows.filter(r => r.tier === 'WIN');
    const supers = rows.filter(r => r.tier === 'SUPER');
    const kills = rows.filter(r => r.tier === 'KILL');
    const neutrals = rows.filter(r => r.tier === 'NEUTRAL');

    // Mutations
    const renameOps = [];
    for (const r of [...winners, ...supers]) {
      const target = r.name.startsWith('🌟_') ? r.name : `🌟_${r.name}`;
      if (r.name !== target) renameOps.push({ id: r.id, old: r.name, new: target });
    }
    let renamedCount = 0;
    let renameOk = [];
    let renameFail = [];
    for (const op of renameOps) {
      await sleep(1500);
      console.error(`rename_start campaign_id=${op.id}`);
      const ok = await renameCampaign(op.id, op.new);
      console.error(`rename_end campaign_id=${op.id} ${ok ? 'ok' : 'failed'}`);
      if (ok) { renamedCount++; renameOk.push({ id: op.id, old: op.old, new: op.new }); }
      else renameFail.push(id: op.id, old: op.old, new: op.new });
    }

    let killedCount = 0;
    let killOk = [];
    let killFail = [];
    for (const r of kills) {
      await sleep(1500);
      console.error(`kill_start campaign_id=${r.id}`);
      const ok = await pauseCampaign(r.id);
      console.error(`kill_end campaign_id=${r.id} ${ok ? 'ok' : 'failed'}`);
      if (ok) { killedCount++; killOk.push({ id: r.id, name: r.name }); }
      else killFail.push({ id: r.id, name: r.name });
    }

    // Write report
    const report = {
      account: ACCOUNT_ID,
      timestamp: new Date().toISOString(),
      counts: {
        total_campaigns: campaigns.length,
        winners: winners.length,
        supers: supers.length,
        kills: kills.length,
        neutrals: neutrals.length,
        renamed_success: renamedCount,
        rename_failed: renameFail.length,
        killed_success: killedCount,
        kill_failed: killFail.length,
      },
      lists: {
        winners: winners.map(r => ({ id: r.id, name: r.name, cpc: r.cpc, ctr: r.ctr, roas: fmt(r.roas) })),
        supers: supers.map(r => ({ id: r.id, name: r.name, cpc: r.cpc, ctr: r.ctr, roas: fmt(r.roas) })),
        kills: kills.map(r => ({ id: r.id, name: r.name, spend: fmt(r.spend), cpc: r.cpc, ctr: r.ctr, roas: r.roas < 0 ? 'n/a' : fmt(r.roas) })),
        neutrals: neutrals.map(r => ({ id: r.id, name: r.name, spend: fmt(r.spend) })),
        renamed_success: renameOk,
        renamed_failed: renameFail,
        killed_success: killOk,
        killed_failed: killFail,
      },
    };
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, Buffer.from(JSON.stringify(report)));
    console.error('report_saved');

    console.log(JSON.stringify(report, null, 2));
  } catch (e) {
    console.error('patrol_error', e.message);
    process.exit(1);
  }
})();
