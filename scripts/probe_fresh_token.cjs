// One-shot verifier: takes a Meta token as argv[2] (NOT from .env / NOT committed),
// debug_tokens it, hard-gates on the Adforge app id (FB_APP_ID), and only if it matches
// runs the FULL creative ladder PAUSED-only with immediate cleanup.
//
// Usage: node scripts/probe_fresh_token.cjs 'EAA...'
require('dotenv').config();
const TOKEN = process.argv[2] || process.env.FRESH_TOKEN;
const APP_TOKEN = `${process.env.FB_APP_ID}|${process.env.FB_APP_SECRET}`;
const ADFORGE_APP = String(process.env.FB_APP_ID);

if (!TOKEN) { console.log('USAGE: node scripts/probe_fresh_token.cjs <token>'); process.exit(1); }

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
  const dt = await g('GET', 'debug_token', { input_token: TOKEN, access_token: APP_TOKEN });
  const t = dt.body?.data;
  if (!t) { console.log(`debug_token failed: ${JSON.stringify(dt.body.error || dt.body).slice(0, 200)}`); process.exit(1); }
  const mine = String(t.application_id || '') === ADFORGE_APP;
  console.log(`token: valid=${t.is_valid} app=${t.application_id || '?'} type=${t.token_type || '?'} ${mine ? '<<< ADFORGE APP' : '<<< NOT ADFORGE APP'} scopes=${(t.scopes || []).join(',')}`);

  if (!mine) { console.log(`\nHARD GATE: token belongs to app ${t.application_id}, expected ${ADFORGE_APP}. Cannot prove Adforge creative path.`); process.exit(2); }
  if (!t.is_valid) { console.log('\nToken invalid/expired.'); process.exit(1); }

  const aa = await g('GET', 'me/adaccounts', { fields: 'id,name,currency,account_status', limit: '10', access_token: TOKEN });
  const accounts = aa.body?.data || [];
  console.log(`\nad accounts visible: ${accounts.length}`);
  accounts.forEach(a => console.log(`  ${a.id} ${a.name} currency=${a.currency} status=${a.account_status}`));
  const ACT = accounts[0]?.id?.replace('act_', '');
  if (!ACT) { console.log('no ad account'); process.exit(1); }

  const created = [];
  try {
    let r = await g('POST', `act_${ACT}/campaigns`, { name: 'ADFORGE-FRESH', objective: 'OUTCOME_TRAFFIC', status: 'PAUSED', special_ad_categories: ['NONE'], is_adset_budget_sharing_enabled: false, access_token: TOKEN });
    if (!r.body.id) { console.log('campaign fail:', JSON.stringify(r.body.error || r.body).slice(0, 200)); process.exit(1); }
    created.push(r.body.id); console.log('1. campaign OK:', r.body.id);

    r = await g('POST', `act_${ACT}/adsets`, { campaign_id: r.body.id, name: 'ADFORGE-FRESH-AS', daily_budget: 5000000, billing_event: 'IMPRESSIONS', optimization_goal: 'LINK_CLICKS', bid_strategy: 'LOWEST_COST_WITHOUT_CAP', targeting: { geo_locations: { countries: ['ID'] }, age_min: 21, age_max: 55, targeting_automation: { advantage_audience: 0 } }, status: 'PAUSED', access_token: TOKEN });
    if (!r.body.id) { console.log('adset fail:', JSON.stringify(r.body.error || r.body).slice(0, 200)); return; }
    created.push(r.body.id); console.log('2. adset OK:', r.body.id, '(budget 5000000 sen = Rp 50.000, age 21-55)');

    r = await g('POST', `act_${ACT}/adcreatives`, { name: 'ADFORGE-FRESH-Story', object_story_id: '1249880208207067_122111007381405426', access_token: TOKEN });
    console.log('3. creative object_story_id:', r.status, r.body.id || JSON.stringify(r.body.error || r.body).slice(0, 260));
    if (r.body.id) created.push(r.body.id);

    r = await g('POST', `act_${ACT}/adcreatives`, { name: 'ADFORGE-FRESH-Link', object_story_spec: { page_id: '1249880208207067', link_data: { message: 'Probe creative', link: 'https://example.com', name: 'Probe headline' } }, access_token: TOKEN });
    console.log('4. creative link_data:', r.status, r.body.id || JSON.stringify(r.body.error || r.body).slice(0, 260));
    if (r.body.id) created.push(r.body.id);

    if (created.length >= 3) {
      r = await g('POST', `act_${ACT}/ads`, { name: 'ADFORGE-FRESH-Ad', adset_id: created[1], creative: JSON.stringify({ creative_id: created[2] }), status: 'PAUSED', access_token: TOKEN });
      console.log('5. ad (completes wizard path):', r.status, r.body.id || JSON.stringify(r.body.error || r.body).slice(0, 260));
      if (r.body.id) created.push(r.body.id);
    }
  } finally {
    for (const id of created.reverse()) {
      const d = await g('POST', id, { access_token: TOKEN });
      console.log(`cleanup ${id}:`, d.status === 200 ? 'DELETED' : JSON.stringify(d.body).slice(0, 120));
    }
  }
})();
