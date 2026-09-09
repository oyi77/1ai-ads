// Live Meta probe: prove budget (sen), age targeting, object_story_id format.
// PAUSED-only, immediate cleanup in reverse order. Never logs tokens.
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

const row = db.prepare("SELECT credentials FROM platform_accounts WHERE id='18356744-d2c7-4897-a3ef-9318aac986ec'").get();
const creds = dec(row.credentials);
const TOKEN = creds.access_token;
const ACT = creds.ad_account_id;
const GRAPH = 'https://graph.facebook.com/v22.0';

async function g(method, path, params) {
  const url = new URL(`${GRAPH}/${path}`);
  if (method === 'GET') Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, v));
  url.searchParams.set('access_token', TOKEN);
  const res = await fetch(url, method === 'GET' ? {} : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params || {}),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

(async () => {
  console.log(`Probe target: act_${ACT}`);
  const created = [];

  try {
    // Step 1: campaign shell (PAUSED)
    let r = await g('POST', `act_${ACT}/campaigns`, {
      name: 'ADFORGE-PROBE-Budget-Age-StoryId',
      objective: 'OUTCOME_TRAFFIC',
      status: 'PAUSED',
      special_ad_categories: ['NONE'],
      is_adset_budget_sharing_enabled: false,
    });
    console.log('1. campaign:', r.status, r.body.id || JSON.stringify(r.body.error || r.body).slice(0, 200));
    if (!r.body.id) return;
    const campaignId = r.body.id;
    created.push(['campaign', campaignId]);
    // Step 2: adset with dailyBudget=50000 (IDR) -> expect Meta daily_budget=5000000 (sen)
    //         age 21-55, gender all
    r = await g('POST', `act_${ACT}/adsets`, {
      campaign_id: campaignId,
      name: 'ADFORGE-PROBE-AdSet',
      daily_budget: 50000 * 100,          // what createAdSet does: Math.round(dailyBudget * 100)
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'LINK_CLICKS',
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      targeting: {
        geo_locations: { countries: ['ID'] },
        age_min: 21,                      // what fixed wizard sends
        age_max: 55,
        targeting_automation: { advantage_audience: 0 },
      },
      status: 'PAUSED',
    });
    console.log('2. adset:', r.status, r.body.id || JSON.stringify(r.body.error || r.body).slice(0, 300));
    if (!r.body.id) return;
    const adsetId = r.body.id;
    created.push(['adset', adsetId]);

    // Step 3: read back the adset - prove what Meta actually stored
    r = await g('GET', adsetId, { fields: 'daily_budget,targeting,bid_strategy' });
    console.log('3. adset readback:', JSON.stringify(r.body).slice(0, 500));
    const storedBudget = r.body?.daily_budget;
    const storedAgeMin = r.body?.targeting?.age_min;
    const storedAgeMax = r.body?.targeting?.age_max;
    console.log(`   => daily_budget stored: ${storedBudget} (input 5000000)  age_min: ${storedAgeMin} (input 21)  age_max: ${storedAgeMax} (input 55)`);

    // Step 4: find a page + post for object_story_id probe
    r = await g('GET', 'me', { fields: 'accounts{id,name,access_token}' });
    const pages = r.body?.accounts?.data || [];
    console.log(`4. pages found: ${pages.length}`);
    let storyIdResult = 'no page';
    if (pages.length > 0) {
      const page = pages[0];
      // Try finding a recent post on this page
      const pr = await g('GET', `${page.id}/posts`, { fields: 'id', limit: '1' });
      const post = pr.body?.data?.[0];
      if (post) {
        // object_story_id probe with {page}_{post} format
        r = await g('POST', `act_${ACT}/adcreatives`, {
          name: 'ADFORGE-PROBE-Creative',
          object_story_id: post.id,   // posts API already returns {page}_{post}
        });
        storyIdResult = r.status === 200 ? `OK creative=${r.body.id}` : JSON.stringify(r.body.error || r.body).slice(0, 300);
        if (r.body?.id) created.push(['creative', r.body.id]);
      } else {
        storyIdResult = `page ${page.id} has no posts to reference`;
      }
    }
    console.log('5. object_story_id creative:', storyIdResult);

  } finally {
    // Cleanup in reverse order
    for (const [kind, id] of created.reverse()) {
      const d = await g('POST', `${id}`, { status: 'DELETED' });
      console.log(`cleanup ${kind} ${id}: ${d.status === 200 ? 'DELETED' : JSON.stringify(d.body).slice(0, 150)}`);
    }
  }
})();
