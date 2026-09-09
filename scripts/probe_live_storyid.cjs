// Probe 3: object_story_id formats — find post via /feed, else create throwaway page post.
// PAUSED-only, full reverse cleanup incl. the test post.
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
const TOKEN = dec(row.credentials).access_token;
const GRAPH = 'https://graph.facebook.com/v22.0';

async function g(method, path, params) {
  const url = new URL(`${GRAPH}/${path}`);
  if (method === 'GET') Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, v));
  url.searchParams.set('access_token', TOKEN);
  const res = await fetch(url, method === 'GET' ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params || {}) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

(async () => {
  const created = [];
  try {
    const pr = await g('GET', 'me', { fields: 'accounts{id,name,access_token}' });
    const pages = pr.body?.accounts?.data || [];
    console.log('pages:', pages.length);

    // 1) hunt for an existing post via /feed (more reliable than /posts for older pages)
    let page = null, post = null, postCreated = false;
    for (const p of pages) {
      const fr = await g('GET', `${p.id}/feed`, { fields: 'id,message', limit: '3' });
      const cand = fr.body?.data?.[0];
      if (cand) { page = p; post = cand; console.log(`found feed post on ${p.name}: ${cand.id}`); break; }
    }
    // 2) else create a throwaway post on the first page we can
    if (!post && pages.length > 0) {
      const p = pages[0];
      const mr = await g('POST', `${p.id}/feed`, { message: 'ADFORGE-PROBE throwaway post - will be deleted' });
      if (mr.body?.id) {
        page = p; post = { id: mr.body.id }; postCreated = true;
        created.push(['page-post', mr.body.id]);
        console.log(`created throwaway post ${mr.body.id} on ${p.name} (${p.id})`);
      } else {
        console.log('cannot create post:', JSON.stringify(mr.body.error || mr.body).slice(0, 200));
      }
    }
    if (!post) return;

    // Campaign shell
    let r = await g('POST', `act_1181078009580337/campaigns`, {
      name: 'ADFORGE-PROBE-StoryId', objective: 'OUTCOME_TRAFFIC', status: 'PAUSED',
      special_ad_categories: ['NONE'], is_adset_budget_sharing_enabled: false,
    });
    if (!r.body.id) { console.log('campaign fail:', JSON.stringify(r.body).slice(0, 250)); return; }
    const campaignId = r.body.id; created.push(['campaign', campaignId]);
    console.log('1. campaign:', r.status, campaignId);

    // AdSet
    r = await g('POST', `act_1181078009580337/adsets`, {
      campaign_id: campaignId, name: 'ADFORGE-PROBE-AdSet3',
      daily_budget: 5000000, billing_event: 'IMPRESSIONS', optimization_goal: 'LINK_CLICKS',
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      targeting: { geo_locations: { countries: ['ID'] }, age_min: 18, targeting_automation: { advantage_audience: 0 } },
      status: 'PAUSED',
    });
    if (!r.body.id) { console.log('adset fail:', JSON.stringify(r.body).slice(0, 250)); return; }
    const adsetId = r.body.id; created.push(['adset', adsetId]);
    console.log('2. adset:', r.status, adsetId);

    // 3) Creative A: full {page}_{post} (what posts/feed API returns)
    r = await g('POST', `act_1181078009580337/adcreatives`, { name: 'PROBE-Story-Full', object_story_id: post.id });
    console.log('3. creative full story id:', r.status, r.body.id || JSON.stringify(r.body.error || r.body).slice(0, 250));
    if (r.body.id) created.push(['creativeA', r.body.id]);

    // 4) Creative B: wizard-manual format page.id + raw numeric segment
    const rawPostId = post.id.includes('_') ? post.id.split('_')[1] : post.id;
    r = await g('POST', `act_1181078009580337/adcreatives`, { name: 'PROBE-Story-Manual', object_story_id: `${page.id}_${rawPostId}` });
    console.log('4. creative wizard format:', r.status, r.body.id || JSON.stringify(r.body.error || r.body).slice(0, 250));
    if (r.body.id) created.push(['creativeB', r.body.id]);

    // 5) Prove the OLD buggy path: raw numeric only
    if (post.id.includes('_')) {
      r = await g('POST', `act_1181078009580337/adcreatives`, { name: 'PROBE-Story-RawOnly', object_story_id: rawPostId });
      console.log('5. creative RAW postId (old bug):', r.status, r.body.id || JSON.stringify(r.body.error || r.body).slice(0, 250));
      if (r.body.id) created.push(['creativeC', r.body.id]);
    }
  } finally {
    for (const [kind, id] of created.reverse()) {
      const d = await g('POST', id, {});
      console.log(`cleanup ${kind} ${id}:`, d.status === 200 ? 'DELETED' : JSON.stringify(d.body).slice(0, 150));
    }
  }
})();
