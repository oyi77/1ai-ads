const fs = require('fs');
const path = require('path');

function today(delta = 0) {
  return new Date(Date.now() - delta * 86400_000)
    .toISOString()
    .slice(0, 10);
}

async function main() {
  const token = process.env.META_ACCESS_TOKEN || '';
  const apiVer = 'v22.0';
  const accountId = 'act_380721031313330';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const http = (url) =>
    fetch(url).then(r => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });

  // 1) fetch campaigns
  const campRes = await http(`https://graph.facebook.com/${apiVer}/${accountId}/campaigns?fields=id,name,status&limit=200&access_token=${encodeURIComponent(token)}`);
  const campaigns = Array.isArray(campRes.data) ? campRes.data : [];
  await sleep(550);

  // 2) fetch insights
  const since = today(13);
  const until = today(0);
  const ids = campaigns.map((c) => c.id).join(',');
  const insRes = await http(
    `https://graph.facebook.com/${apiVer}/?ids=${encodeURIComponent(ids)}&fields=insights.time_range({"since":"${since}","until":"${until}"}){campaign_id,campaign_name,spend,clicks,cpc,ctr}&access_token=${encodeURIComponent(token)}`
  );
  await sleep(550);

  // parse insights into map
  const map = new Map();
  for (const c of campaigns) {
    const k = c.id;
    const base = {
      campaign_id: c.id,
      campaign_name: c.name,
      status: c.status,
      spend: '0',
      clicks: '0',
      cpc: '0',
      ctr: '0',
    };
    const patch = insRes[k]?.insights?.data?.[0];
    if (patch) map.set(c.id, { ...base, ...patch });
    else map.set(c.id, base);
  }

  let totalSpend = 0;
  let totalClicks = 0;
  const rows = [];
  for (const [, r] of map) {
    const spend = parseFloat(r.spend || '0');
    const clicks = parseFloat(r.clicks || '0');
    totalSpend += spend;
    totalClicks += clicks;
    rows.push({ ...r, spend, clicks });
  }

  const globalCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;

  const actions = [];
  const MONSTER_PAIRS = [
    { thresholdCpC: 1000, spendMin: 1000, label: 'CPC>=1000+spend>1K' },
    { thresholdCpC: 500, spendMin: 2000, label: 'CPC>=500+spend>2K' },
  ];
  const CPCTHRESH = 200;
  const CPCMINSPEND = 500;

  const winners = [];
  const watch = [];
  const monster = [];
  const lcScale = [];
  const pauseCandidates = [];

  for (const r of rows) {
    const cpc = parseFloat(r.cpc || '0');
    const spend = r.spend;
    const clicks = r.clicks;
    const name = r.campaign_name;
    const id = r.campaign_id;

    // MONSTER
    let isMonster = false;
    for (const m of MONSTER_PAIRS) {
      if (cpc >= m.thresholdCpC && spend >= m.spendMin) {
        monster.push(id);
        isMonster = true;
        break;
      }
    }
    if (monster.includes(id)) continue;

    // CPC>200 typo typo typo this will happen

    // CPC > 200 typo
    if (cpc > CPCTHRESH && clicks === 0 && spend > CPCMINSPEND) {
      pauseCandidates.push(id);
    } else if (cpc > CPCTHRESH && clicks > 0) {
      watch.push(id);
    }

    if (globalCpc < 120) {
      if (cpc < 120 && clicks > 5 && spend > 10000) {
        winners.push(id);
      }
      if (name.toLowerCase().includes('lc') && cpc < 120 && clicks > 0) {
        lcScale.push(id);
      }
    }
  }

  // apply ACTIONS:
  // monster: rename OFF_ then pause
  // pauseCandidates: pause only
  // winner: rename
  // lcScale: increase typo typo budget by 20%, MAX Rp100k

  // convert currency: Meta spend typo typo is in account currency (interpreted typo typo typo typo typo typo typo typo)
}

main();
