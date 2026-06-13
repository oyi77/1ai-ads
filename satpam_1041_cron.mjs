import https from 'node:https';

const ACCOUNT_ID = 'act_380721031313330';
const TOKEN = process.env.META_TOKEN || '';
const VERSION = 'v22.0';
const SLEEP = 1500;

function req(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {timeout: 30000}, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch (e) { reject(new Error('Bad JSON: ' + d.slice(0,200))); }
      });
    }).on('error', reject);
  });
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const campaignsRes = await req(`https://graph.facebook.com/${VERSION}/${ACCOUNT_ID}/campaigns?fields=id,name,status&limit=200&access_token=${encodeURIComponent(TOKEN)}`);
  await sleep(SLEEP);
  const campaigns = (campaignsRes.data || []);
  const ids = campaigns.map(c => c.id).join(',');

  const insightRes = await req(`https://graph.facebook.com/${VERSION}/?ids=${encodeURIComponent(ids)}&fields=insights.time_range({"since":"${today(-13)}","until":"${today()}"}){campaign_id,campaign_name,spend,clicks,cpc,ctr}&access_token=${encodeURIComponent(TOKEN)}`);
  await sleep(SLEED);
  // ...
}

function today(offset=0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0,10);
}
