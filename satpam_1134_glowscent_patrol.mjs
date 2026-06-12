/**
 * Satpam 1134 Patrol – Glowscent
 * Corrected 2026-06-12: 3-layer decision engine per meta-ads-operations skill.
 */
import https from 'node:https';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { URL, URLSearchParams } from 'node:url';

const ENV_PATH = '/home/openclaw/projects/1ai-ads/.env';
const ACCOUNT_ID = 'act_2125021885010866';
const API_BASE = `https://graph.facebook.com/v22.0/${ACCOUNT_ID}`;
const REPORT_PATH = '/home/openclaw/projects/1ai-ads/outputs/satpam_1134_glowscent_report.json';

const TRACKED_TAGS = new Set(['abera', 'pintulipatgeser', 'hijab']);

function loadEnvToken() {
  const raw = fs.readFileSync(ENV_PATH, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const [k, ...v] = line.split('=');
    if (k === 'META_ACCESS_TOKEN') return v.join('=').trim();
  }
  throw new Error('META_ACCESS_TOKEN missing from .env');
}

let tokenCache = null;
function token() {
  if (!tokenCache) tokenCache = loadEnvToken();
  return tokenCache;
}

function request(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request(u, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(d);
          if (j.error) reject(new Error(JSON.stringify(j.error)));
          else resolve(j);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function graphGet(pathname, params = {}) {
  const qs = new URLSearchParams({ access_token: token(), ...params });
  const url = `${API_BASE}/${pathname}?${qs.toString()}`;
  const j = await request(url);
  return j.data || [];
}

async function graphPost(pathname, body = {}, retry = 0) {
  const qs = new URLSearchParams({ access_token: token() });
  for (const [k, v] of Object.entries(body)) qs.set(k, String(v));
  const url = `${API_BASE}/${pathname}?${qs.toString()}`;
  const j = await request(url);
  if (!j.id && !j.success && retry < 2) {
    await sleep((retry + 1) * 2000);
    return graphPost(pathname, body, retry + 1);
  }
  return j;
}

async function fetchAllCampaigns() {
  const out = [];
  let next = `${API_BASE}/campaigns?fields=id,name,status,configured_status,special_ad_categories,bid_strategy&limit=100&access_token=${token()}`;
  while (next) {
    const j = await request(next);
    const data = j.data || [];
    out.push(...data);
    const paging = j.paging || {};
    next = paging.next || null;
    if (next && !next.includes('access_token')) {
      // rebuild stale next URL with current token
      const u = new URL(next);
      u.searchParams.set('access_token', token());
      next = u.toString();
    }
    if (out.length >= 400) break;
  }
  return out;
}

async function fetchInsights(campaignId) {
  const qs = new URLSearchParams({
    fields: 'campaign_id,campaign_name,spend,cpc,clicks,ctr,impressions',
    time_range: JSON.stringify({ since: '-7d', until: 'today' }),
    level: 'campaign',
    limit: '200',
    access_token: token(),
    'filtering': JSON.stringify([{ field: 'campaign.id', operator: 'EQUAL', value: String(campaignId) }]),
  });
  const url = `${API_BASE}/insights?${qs.toString()}`;
  const j = await request(url);
  return (j.data && j.data[0]) || null;
}

function detectCampaignType(name = '') {
  const u = name.toUpperCase();
  if (/TEST|TESTING/.test(u)) return 'TEST';
  if (u.startsWith('ABO')) return 'ABO';
  if (u.startsWith('BIDCAP')) return 'BIDCAP';
  if (/^(CBO|BC_|LC_|TC_|GLW|ON_LC_|ON_BC|🌟_)/.test(u)) return 'CBO';
  return 'UNKNOWN';
}

function parseNum(v) {
  if (v == null) return null;
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function extractTag(name = '') {
  const lower = name.toLowerCase();
  // strip prefixes
  const cleaned = lower.replace(/^(off_|dead_|🌟_|on_lc_|on_bc_|scale_|cbo_|abo_|bidcap_|lc_|tc_|bc_|glw_)\s*/g, '');
  const segs = cleaned.split(/[^a-z0-9]+/).filter(Boolean);
  for (const s of segs) {
    if (TRACKED_TAGS.has(s)) return s;
  }
  return segs[0] || null;
}

async function pauseCampaign(id) {
  return graphPost(String(id), { status: 'PAUSED' });
}

async function renameCampaign(id, name) {
  return graphPost(String(id), { name });
}

function classifyRow(c) {
  const name = c.name || '';
  const type = detectCampaignType(name);
  const spend = c.spend || 0;
  const cpc = parseNum(c.cpc);
  const ctr = parseNum(c.ctr) != null ? parseNum(c.ctr) / 100 : parseNum(c.ctr);
  const impressions = parseNum(c.impressions) || 0;
  const clicks = parseNum(c.clicks) || 0;
  const lower = name.toLowerCase();

  const isTag = [...TRACKED_TAGS].some(t => lower.includes(t));

  // OFF_ guard
  if (name.startsWith('OFF_') || name.startsWith('DEAD_')) return { verdict: 'OFF_LIMITS' };

  // CPC hard kill (Glowscent: 400)
  const cpcKill = 400;
  const cpcDangerCbo = 140;
  const cpcDangerAbo = 250;
  const cpcDanger = type === 'CBO' ? cpcDangerCbo : (type === 'ABO' || type === 'TEST' || type === 'BIDCAP') ? cpcDangerAbo : cpcDangerCbo;

  if (cpc != null && cpc > cpcKill && spend > 2000) return { verdict: 'OFF' };
  if (cpc != null && cpc > cpcDanger && spend > 5000) return { verdict: 'WATCH_CPC' };
  // CTR hard pause
  if (ctr != null && ctr < 0.01 && impressions > 1000) return { verdict: 'WATCH_CTR' };

  // Winner tag
  if (cpc != null && cpc < cpcDanger && spend > 50000 && clicks > 0 && isTag) return { verdict: 'WINNER' };

  // Non-tag watch
  if (!isTag && spend > 50000) return { verdict: 'WATCH_SPEND' };

  return { verdict: 'KEEP' };
}

(async () => {
  try {
    const campaigns = await fetchAllCampaigns();
    const rows = [];
    for (let i = 0; i < campaigns.length; i++) {
      const c = campaigns[i];
      if (i % 25 === 0) console.error(`insights_fetch_progress ${i}/${campaigns.length}`);
      await sleep(1500);
      const ins = await fetchInsights(c.id);
      rows.push({
        id: c.id,
        name: c.name || '',
        status: c.status || c.configured_status || '',
        spend: parseNum(ins?.spend) || 0,
        cpc: parseNum(ins?.cpc),
        ctr: parseNum(ins?.ctr),
        clicks: parseNum(ins?.clicks) || 0,
        impressions: parseNum(ins?.impressions) || 0,
        impressionsRaw: ins?.impressions || 0,
      });
    }

    let pauseOps = [];
    let offOps = [];
    let winnerOps = [];
    let watchOps = [];

    for (const r of rows) {
      if (r.status === 'PAUSED') continue;
      const { verdict } = classifyRow(r);
      switch (verdict) {
        case 'OFF':
          offOps.push(r);
          break;
        case 'WATCH_CPC':
        case 'WATCH_CTR':
        case 'WATCH_SPEND':
          watchOps.push(r);
          pauseOps.push(r);
          break;
        case 'WINNER':
          winnerOps.push(r);
          break;
        default:
          break;
      }
    }

    // Execute OFF (pause + rename)
    const offRenamed = [];
    const offPaused = [];
    for (const r of offOps) {
      await sleep(1500);
      try { await pauseCampaign(r.id); offPaused.push(r.id); } catch (e) { console.error('pause_fail', r.id, e.message); }
      await sleep(1500);
      const newName = `OFF_${r.name}`;
      try { const j = await renameCampaign(r.id, newName); if (j.success || j.id) offRenamed.push({ id: r.id, newName }); else console.error('rename_fail', r.id); } catch (e) { console.error('rename_fail', r.id, e.message); }
    }

    // Execute WATCH pauses
    const watchPaused = [];
    for (const r of pauseOps) {
      await sleep(1500);
      try { await pauseCampaign(r.id); watchPaused.push(r.id); } catch (e) { console.error('pause_watch_fail', r.id, e.message); }
    }

    // Execute winner rename
    const winnerRenamed = [];
    for (const r of winnerOps) {
      await sleep(1500);
      const newName = `🌟_${r.name}`;
      try { const j = await renameCampaign(r.id, newName); if (j.success || j.id) winnerRenamed.push({ id: r.id, newName }); else console.error('rename_fail', r.id); } catch (e) { console.error('rename_fail', r.id, e.message); }
    }

    const active = rows.filter(r => r.status === 'ACTIVE').length;
    const offCount = (await fetchAllCampaigns()).filter(c => /^OFF_/.test(c.name)).length;
    const starCount = (await fetchAllCampaigns()).filter(c => /^🌟_/.test(c.name)).length;

    const report = {
      account: '1134 Glowscent',
      act_id: ACCOUNT_ID,
      timestamp: new Date().toISOString(),
      counts: {
        active,
        off: offCount,
        star: starCount,
        kill_count: offOps.length,
        watch_count: watchOps.length,
        winner_count: winnerOps.length,
      },
      lists: {
        kill: offOps.map(r => ({ id: r.id, name: r.name, spend: r.spend, cpc: r.cpc })),
        watch: watchOps.map(r => ({ id: r.id, name: r.name, spend: r.spend, cpc: r.cpc, ctr: r.ctr })),
        winners: winnerOps.map(r => ({ id: r.id, name: r.name, spend: r.spend, cpc: r.cpc, ctr: r.ctr, clicks: r.clicks })),
      },
      totals: {
        spend7d: rows.reduce((s, r) => s + (r.spend || 0), 0),
      },
    };

    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, Buffer.from(JSON.stringify(report, null, 2)));

    const totalSpend = report.totals.spend7d;
    console.log(JSON.stringify({ active, off: offCount, star: starCount, kill_count: offOps.length, watch_count: watchOps.length, winner_count: winnerOps.length, spend7d: totalSpend }, null, 2));
    console.error('report_saved');
  } catch (e) {
    console.error('patrol_error', e.message);
    process.exit(1);
  }
})();
