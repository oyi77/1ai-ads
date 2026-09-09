// Probe 6: identify FB_SYSTEM_TOKEN / META_ACCESS_TOKEN issuing app; if Adforge app,
// run the FULL creative ladder (object_story_id + link_data) PAUSED-only with cleanup.
require('dotenv').config();
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
  const candidates = [
    ['FB_SYSTEM_TOKEN', process.env.FB_SYSTEM_TOKEN],
    ['META_ACCESS_TOKEN', process.env.META_ACCESS_TOKEN],
  ].filter(([, t]) => t);

  let adforgeToken = null, adforgeACT = null;
  for (const [name, TOKEN] of candidates) {
    const dt = await g('GET', 'debug_token', { input_token: TOKEN, access_token: APP_TOKEN });
    const t = dt.body?.data;
    if (!t) { console.log(`${name}: debug fail ${JSON.stringify(dt.body.error || dt.body).slice(0, 140)}`); continue; }
    const mine = String(t.application_id || '') === ADFORGE_APP;
    console.log(`${name}: valid=${t.is_valid} app=${t.application_id || '?'} type=${t.token_type || '?'} ${mine ? '<<< ADFORGE APP' : ''} scopes=${(t.scopes || []).join(',')}`);
    if (mine && t.is_valid) { adforgeToken = TOKEN; }
  }

  if (!adforgeToken) { console.log('\nNo Adforge-app token found among env tokens.'); return; }

  // Which ad accounts can this token see?
  const aa = await g('GET', 'me/adaccounts', { fields: 'id,name,currency,account_status', limit: '10', access_token: adforgeToken });
  const accounts = aa.body?.data || [];
  console.log(`\nad accounts visible: ${accounts.length}`);
  accounts.forEach(a => console.log(`  ${a.id} ${a.name} currency=${a.currency} status=${a.account_status}`));
  const ACT = accounts[0]?.id?.replace('act_', '');
  if (!ACT) { console.log('no ad account'); return; }

  // FULL ladder: campaign -> adset -> creative(object_story_id) -> creative(link_data)
  const created = [];
  try {
    let r = await g('POST', `act_${ACT}/campaigns`, { name: 'ADFORGE-PROBE6', objective: 'OUTCOME_TRAFFIC', status: 'PAUSED', special_ad_categories: ['NONE'], is_adset_budget_sharing_enabled: false, access_token: adforgeToken });
    if (!r.body.id) { console.log('campaign fail:', JSON.stringify(r.body.error || r.body).slice(0, 200)); return; }
    created.push(r.body.id);
    console.log('1. campaign OK:', r.body.id);

    r = await g('POST', `act_${ACT}/adsets`, { campaign_id: r.body.id, name: 'ADFORGE-PROBE6-AS', daily_budget: 5000000, billing_event: 'IMPRESSIONS', optimization_goal: 'LINK_CLICKS', bid_strategy: 'LOWEST_COST_WITHOUT_CAP', targeting: { geo_locations: { countries: ['ID'] }, age_min: 21, age_max: 55, targeting_automation: { advantage_audience: 0 } }, status: 'PAUSED', access_token: adforgeToken });
    if (!r.body.id) { console.log('adset fail:', JSON.stringify(r.body.error || r.body).slice(0, 200)); return; }
    created.push(r.body.id);
    console.log('2. adset OK:', r.body.id, '(budget 5000000 sen = Rp 50.000, age 21-55)');

    // Path A: object_story_id (bot manual-post flow)
    r = await g('POST', `act_${ACT}/adcreatives`, { name: 'ADFORGE-PROBE6-Story', object_story_id: '1249880208207067_122111007381405426', access_token: adforgeToken });
    console.log('3. creative object_story_id:', r.status, r.body.id || JSON.stringify(r.body.error || r.body).slice(0, 260));
    if (r.body.id) created.push(r.body.id);

    // Path B: link_data (web orchestrator / custom creative flow)
    r = await g('POST', `act_${ACT}/adcreatives`, {
      name: 'ADFORGE-PROBE6-Link',
      object_story_spec: { page_id: '1249880208207067', link_data: { message: 'Probe creative', link: 'https://example.com', name: 'Probe headline' } },
      access_token: adforgeToken,
    });
    console.log('4. creative link_data:', r.status, r.body.id || JSON.stringify(r.body.error || r.body).slice(0, 260));
    if (r.body.id) created.push(r.body.id);

    // Path C: the ad itself (completes the wizard's adCreated=true path)
    if (created.length >= 3) {
      const creativeId = created[2];
      r = await g('POST', `act_${ACT}/ads`, { name: 'ADFORGE-PROBE6-Ad', adset_id: created[1], creative: JSON.stringify({ creative_id: creativeId }), status: 'PAUSED', access_token: adforgeToken });
      console.log('5. ad (completes wizard path):', r.status, r.body.id || JSON.stringify(r.body.error || r.body).slice(0, 260));
      if (r.body.id) created.push(r.body.id);
    }
  } finally {
    for (const id of created.reverse()) {
      const d = await g('POST', id, { access_token: adforgeToken });
      console.log(`cleanup ${id}:`, d.status === 200 ? 'DELETED' : JSON.stringify(d.body).slice(0, 120));
    }
  }
})();
