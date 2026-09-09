// Probe 5b: resilient retry — identify issuing app for remaining tokens.
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
const ADFORGE_APP = String(process.env.FB_APP_ID);

async function g(method, path, params, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const url = new URL(`https://graph.facebook.com/v22.0/${path}`);
      if (method === 'GET') Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, v));
      const res = await fetch(url, { method: method === 'GET' ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' }, body: method === 'GET' ? undefined : JSON.stringify(params) });
      return { status: res.status, body: await res.json().catch(() => ({})) };
    } catch (e) {
      if (i === tries - 1) return { status: 0, body: { error: { message: `network: ${e.cause?.code || e.message}` } } };
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

(async () => {
  const accounts = db.prepare("SELECT id, account_name, credentials FROM platform_accounts WHERE platform='meta' AND is_active=1").all();
  for (const acc of accounts) {
    let TOKEN;
    try { TOKEN = dec(acc.credentials).access_token; } catch { console.log(`${acc.id.slice(0, 8)}: decrypt fail`); continue; }
    // Skip already-tested accounts
    if (['18356744', '28883773', '75ae98b6'].some(id => acc.id.startsWith(id))) continue;
    const dt = await g('GET', 'debug_token', { input_token: TOKEN, access_token: APP_TOKEN });
    const t = dt.body?.data;
    if (!t) {
      const msg = JSON.stringify(dt.body.error || dt.body || {}).slice(0, 140);
      // App-id mismatch means token belongs to a DIFFERENT app (not Adforge app)
      console.log(`${acc.id.slice(0, 8)} (${(acc.account_name || '').slice(0, 20)}): ${msg.includes('did not match') ? 'OTHER APP (not 2219265658828209)' : msg}`);
      continue;
    }
    const mine = String(t.application_id || '') === ADFORGE_APP;
    console.log(`${acc.id.slice(0, 8)} (${(acc.account_name || '').slice(0, 20)}): valid=${t.is_valid} app=${t.application_id || '?'} ${mine ? '<<< ADFORGE APP' : ''}`);
    if (mine && t.is_valid) {
      const creds = dec(acc.credentials);
      const ACT = creds.ad_account_id;
      if (!ACT) { console.log('  no ad_account_id'); continue; }
      const created = [];
      try {
        let r = await g('POST', `act_${ACT}/campaigns`, { name: 'ADFORGE-PROBE5B', objective: 'OUTCOME_TRAFFIC', status: 'PAUSED', special_ad_categories: ['NONE'], is_adset_budget_sharing_enabled: false, access_token: TOKEN });
        if (!r.body.id) { console.log('  campaign fail:', JSON.stringify(r.body.error || r.body).slice(0, 180)); continue; }
        created.push(r.body.id);
        r = await g('POST', `act_${ACT}/adsets`, { campaign_id: r.body.id, name: 'ADFORGE-PROBE5B-AS', daily_budget: 5000000, billing_event: 'IMPRESSIONS', optimization_goal: 'LINK_CLICKS', bid_strategy: 'LOWEST_COST_WITHOUT_CAP', targeting: { geo_locations: { countries: ['ID'] }, age_min: 21, age_max: 55, targeting_automation: { advantage_audience: 0 } }, status: 'PAUSED', access_token: TOKEN });
        if (!r.body.id) { console.log('  adset fail:', JSON.stringify(r.body.error || r.body).slice(0, 180)); continue; }
        created.push(r.body.id);
        r = await g('POST', `act_${ACT}/adcreatives`, { name: 'ADFORGE-PROBE5B-Story', object_story_id: '1249880208207067_122111007381405426', access_token: TOKEN });
        console.log(`  CREATIVE via object_story_id:`, r.status, r.body.id || JSON.stringify(r.body.error || r.body).slice(0, 250));
        if (r.body.id) created.push(r.body.id);
      } finally {
        for (const id of created.reverse()) {
          const d = await g('POST', id, { access_token: TOKEN });
          console.log(`  cleanup ${id}:`, d.status === 200 ? 'DELETED' : JSON.stringify(d.body).slice(0, 120));
        }
      }
    }
  }
})();
