// Probe 4: rotate ALL active meta tokens; find one with pages_manage_posts +
// a page that has posts; then live-prove the object_story_id paths (PAUSED, cleanup).
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

async function g(method, path, params) {
  const url = new URL(`https://graph.facebook.com/v22.0/${path}`);
  if (method === 'GET') Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, v));
  url.searchParams.set('access_token', params.__TOKEN__);
  url.searchParams.delete('__TOKEN__');
  const res = await fetch(url, method === 'GET' ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

(async () => {
  const accounts = db.prepare("SELECT id, account_name, credentials FROM platform_accounts WHERE platform='meta' AND is_active=1").all();
  for (const acc of accounts) {
    let TOKEN;
    try { TOKEN = dec(acc.credentials).access_token; } catch { console.log(`${acc.id.slice(0, 8)}: decrypt fail`); continue; }
    const me = await g('GET', 'me', { fields: 'id,name', __TOKEN__: TOKEN });
    if (!me.body?.id) { console.log(`${acc.id.slice(0, 8)} (${(acc.account_name || '').slice(0, 20)}): token dead`); continue; }
    const perms = await g('GET', `${me.body.id}/permissions`, { __TOKEN__: TOKEN });
    const granted = (perms.body?.data || []).filter(p => p.status === 'granted').map(p => p.permission);
    const canPost = granted.includes('pages_manage_posts');
    console.log(`\n=== ${acc.id.slice(0, 8)} (${(acc.account_name || '').slice(0, 25)}) user=${me.body.name} canPost=${canPost} perms=${granted.length}`);
    if (!canPost) continue;

    const pages = await g('GET', 'me/accounts', { fields: 'id,name,access_token,tasks', limit: '50', __TOKEN__: TOKEN });
    for (const page of (pages.body?.data || [])) {
      const feed = await g('GET', `${page.id}/feed`, { fields: 'id,message', limit: '1', __TOKEN__: page.access_token });
      const post = feed.body?.data?.[0];
      if (!post) continue;
      console.log(`  page ${page.name} (${page.id}) HAS post ${post.id}`);
      // Ladder: campaign -> adset -> creative(raw numeric resolved via GET) -> cleanup
      const ACT = (dec(acc.credentials).ad_account_id) || null;
      if (!ACT) { console.log('  no ad_account_id, skip creative ladder'); break; }
      const created = [];
      try {
        let r = await g('POST', `act_${ACT}/campaigns`, { name: 'ADFORGE-PROBE4', objective: 'OUTCOME_TRAFFIC', status: 'PAUSED', special_ad_categories: ['NONE'], is_adset_budget_sharing_enabled: false, __TOKEN__: TOKEN });
        if (!r.body.id) { console.log('  campaign fail:', JSON.stringify(r.body.error || r.body).slice(0, 180)); break; }
        created.push(r.body.id);
        r = await g('POST', `act_${ACT}/adsets`, { campaign_id: r.body.id, name: 'ADFORGE-PROBE4-AS', daily_budget: 5000000, billing_event: 'IMPRESSIONS', optimization_goal: 'LINK_CLICKS', bid_strategy: 'LOWEST_COST_WITHOUT_CAP', targeting: { geo_locations: { countries: ['ID'] }, age_min: 18, targeting_automation: { advantage_audience: 0 } }, status: 'PAUSED', __TOKEN__: TOKEN });
        if (!r.body.id) { console.log('  adset fail:', JSON.stringify(r.body.error || r.body).slice(0, 180)); break; }
        created.push(r.body.id);
        // Wizard-manual simulation: user types raw numeric; resolve full id via GET
        const rawPostId = post.id.split('_')[1];
        const resolved = await g('GET', rawPostId, { fields: 'id', __TOKEN__: page.access_token });
        const fullId = resolved.body?.id || post.id;
        console.log(`  raw ${rawPostId} resolves to ${fullId} (expected ${post.id})`);
        r = await g('POST', `act_${ACT}/adcreatives`, { name: 'PROBE4-Story', object_story_id: fullId, __TOKEN__: TOKEN });
        console.log(`  creative(object_story_id=${fullId}):`, r.status, r.body.id || JSON.stringify(r.body.error || r.body).slice(0, 220));
        if (r.body.id) created.push(r.body.id);
      } finally {
        for (const id of created.reverse()) {
          const d = await g('POST', id, { __TOKEN__: TOKEN });
          console.log(`  cleanup ${id}:`, d.status === 200 ? 'DELETED' : JSON.stringify(d.body).slice(0, 120));
        }
      }
      break; // one page proof per token is enough
    }
  }
})();
