// Probe 5: identify which Meta app each active token belongs to (debug_token),
// then run the creative ladder ONLY with a token belonging to the Adforge app (2219265658828209).
require('dotenv').config();
const crypto = require('crypto');
const db = require('better-sqlite3')('data/1ai-ads.db', { readonly: true });

const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
function dec(b64) {
  const p = Buffer.from(b64, 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', key, p.subarray(0, 16));
  d.setAuthTag(p.subarray(16, 32));
  return JSON.parse(Buffer.concat([d.update(p.subarray(32)), d.final()]).toString());
}
const APP_TOKEN = `${process.env.FB_APP_ID}|${process.env.FB_APP_SECRET}`;
const ADFORGE_APP = process.env.FB_APP_ID;

async function g(method, path, params) {
  const url = new URL(`https://graph.facebook.com/v22.0/${path}`);
  if (method === 'GET') Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, method === 'GET' ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

(async () => {
  const accounts = db.prepare("SELECT id, account_name, user_id, credentials FROM platform_accounts WHERE platform='meta' AND is_active=1").all();
  const adforgeTokens = [];
  for (const acc of accounts) {
    let creds;
    try { creds = dec(acc.credentials); } catch { console.log(`${acc.id.slice(0, 8)}: decrypt fail`); continue; }
    const TOKEN = creds.access_token;
    const dt = await g('GET', 'debug_token', { input_token: TOKEN, access_token: APP_TOKEN });
    const t = dt.body?.data;
    if (!t) { console.log(`${acc.id.slice(0, 8)} (${(acc.account_name || '').slice(0, 20)}): debug fail ${JSON.stringify(dt.body.error || dt.body).slice(0, 120)}`); continue; }
    const mine = String(t.application_id || t.app_id || '') === String(ADFORGE_APP);
    console.log(`${acc.id.slice(0, 8)} (${(acc.account_name || '').slice(0, 20)}): valid=${t.is_valid} app=${t.application_id || t.app_id || '?'} ${mine ? '<<< ADFORGE APP' : ''} scopes=${(t.scopes || []).slice(0, 8).join(',')}`);
    if (mine && t.is_valid) adforgeTokens.push({ acc, TOKEN, ACT: creds.ad_account_id });
  }

  console.log(`\ntokens belonging to Adforge app: ${adforgeTokens.length}`);
  for (const { acc, TOKEN, ACT } of adforgeTokens) {
    if (!ACT) { console.log(`${acc.id.slice(0, 8)}: no ad_account_id in creds, skip ladder`); continue; }
    const created = [];
    try {
      let r = await g('POST', `act_${ACT}/campaigns`, { name: 'ADFORGE-PROBE5', objective: 'OUTCOME_TRAFFIC', status: 'PAUSED', special_ad_categories: ['NONE'], is_adset_budget_sharing_enabled: false, access_token: TOKEN });
      if (!r.body.id) { console.log(`${acc.id.slice(0, 8)} campaign fail:`, JSON.stringify(r.body.error || r.body).slice(0, 180)); continue; }
      created.push(r.body.id);
      r = await g('POST', `act_${ACT}/adsets`, { campaign_id: r.body.id, name: 'ADFORGE-PROBE5-AS', daily_budget: 5000000, billing_event: 'IMPRESSIONS', optimization_goal: 'LINK_CLICKS', bid_strategy: 'LOWEST_COST_WITHOUT_CAP', targeting: { geo_locations: { countries: ['ID'] }, age_min: 21, age_max: 55, targeting_automation: { advantage_audience: 0 } }, status: 'PAUSED', access_token: TOKEN });
      if (!r.body.id) { console.log(`${acc.id.slice(0, 8)} adset fail:`, JSON.stringify(r.body.error || r.body).slice(0, 180)); continue; }
      created.push(r.body.id);
      // creative: use the QA page post (known to exist) — page post is public content access gated; try it
      r = await g('POST', `act_${ACT}/adcreatives`, { name: 'ADFORGE-PROBE5-Story', object_story_id: '1249880208207067_122111007381405426', access_token: TOKEN });
      console.log(`${acc.id.slice(0, 8)} CREATIVE via object_story_id:`, r.status, r.body.id || JSON.stringify(r.body.error || r.body).slice(0, 250));
      if (r.body.id) created.push(r.body.id);
    } finally {
      for (const id of created.reverse()) {
        const d = await g('POST', id, { access_token: TOKEN });
        console.log(`  cleanup ${id}:`, d.status === 200 ? 'DELETED' : JSON.stringify(d.body).slice(0, 120));
      }
    }
  }
})();
