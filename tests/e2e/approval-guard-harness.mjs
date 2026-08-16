// Throwaway-DB harness to verify the autonomous approval guard end-to-end.
// Does NOT touch production: boots a fresh temp SQLite DB, wires RuleEvaluator
// exactly as the app does, fires _executeAction, and asserts intercept.
import { createDatabase } from '../../db/index.js';
import { SettingsRepository } from '../../server/repositories/settings.js';
import { CampaignsRepository } from '../../server/repositories/campaigns.js';
import { RulesRepository } from '../../server/repositories/rules.js';
import { DraftsRepository } from '../../server/repositories/drafts.js';
import { DraftService } from '../../server/services/draft-service.js';
import { RuleEvaluator } from '../../server/services/rule-evaluator.js';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ads-guard-'));
const dbPath = path.join(tmp, '1ai-ads.db');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log(`  PASS: ${msg}`);
  } else {
    failed++;
    console.log(`  FAIL: ${msg}`);
  }
}

async function main() {
  const db = createDatabase(dbPath);

  // Wire exactly like server/app/repositories.js + services.js
  const settingsRepo = new SettingsRepository(db, null);
  const campaignsRepo = new CampaignsRepository(db);
  const rulesRepo = new RulesRepository(db);
  const draftsRepo = new DraftsRepository(db, settingsRepo);
  const draftService = new DraftService(draftsRepo, null);

  let apiCalls = [];
  const fakeMetaApi = {
    updateCampaign: async (campaignId, payload) => {
      apiCalls.push({ campaignId, payload });
      return { ok: true };
    },
  };

  const ruleEvaluator = new RuleEvaluator(
    settingsRepo,
    campaignsRepo,
    rulesRepo,
    {},
    {
      metaAdsAPI: fakeMetaApi,
      googleAdsAPI: {},
      tiktokAdsAPI: {},
      platformAccountsRepo: null,
    },
    draftService,
  );

  // Seed an LC_ campaign (the only kind _scaleCampaign will mutate)
  const campaign = {
    id: 'camp-1',
    user_id: 'u-1',
    platform: 'meta',
    campaign_id: 'pl-123',
    name: 'LC_black_friday',
    status: 'active',
    budget: 500,
    spend: 100,
    revenue: 400,
    impressions: 1000,
    clicks: 50,
    conversions: 5,
    roas: 4,
    last_synced: Date.now(),
  };
  campaignsRepo.upsert(campaign);

  console.log('\n[1] Guard ON -> autonomous change must be intercepted (draft created, no live API call)');
  settingsRepo.setApprovalRequired(true);
  assert(settingsRepo.getApprovalRequired() === true, 'approval_required is true');

  apiCalls = [];
  const before = campaignsRepo.getById('camp-1');
  const result = await ruleEvaluator._executeAction({ type: 'scale_up', amount: 1.5 }, campaign);

  const draftCount = db.prepare('SELECT COUNT(*) AS n FROM approval_drafts').get().n;
  assert(draftCount === 1, `exactly 1 draft created in approval_drafts (got ${draftCount})`);
  const draft = db.prepare('SELECT * FROM approval_drafts').get();
  assert(draft && draft.status === 'pending', `draft status is pending (got ${draft && draft.status})`);
  assert(apiCalls.length === 0, `metaAdsAPI.updateCampaign NOT called (got ${apiCalls.length})`);
  const after = campaignsRepo.getById('camp-1');
  assert(after.budget === before.budget, `campaign budget unchanged in DB (${before.budget} -> ${after.budget})`);
  assert(result && result.intercepted === true, `_executeAction returned intercepted=true (got ${JSON.stringify(result)})`);

  console.log('\n[2] Guard OFF -> autonomous change applies live (API called, no draft)');
  // reset drafts table for clean count
  db.prepare('DELETE FROM approval_drafts').run();
  settingsRepo.setApprovalRequired(false);
  assert(settingsRepo.getApprovalRequired() === false, 'approval_required is false');

  apiCalls = [];
  const result2 = await ruleEvaluator._executeAction({ type: 'scale_up', amount: 1.5 }, campaign);

  assert(apiCalls.length === 1, `metaAdsAPI.updateCampaign called once for live apply (got ${apiCalls.length})`);
  const draftCount2 = db.prepare('SELECT COUNT(*) AS n FROM approval_drafts').get().n;
  assert(draftCount2 === 0, `no draft created when approval off (got ${draftCount2})`);
  assert(!(result2 && result2.intercepted), `_executeAction did NOT return intercepted (got ${JSON.stringify(result2)})`);

  console.log('\n[3] checkCampaigns orchestration -> guard routes rule-triggered change to draft');
  db.prepare('DELETE FROM approval_drafts').run();
  apiCalls = [];

  await ruleEvaluator.createRule('u-1', {
    name: 'auto-scale-active',
    condition: { type: 'status', value: 'active' },
    action: { type: 'scale_up' },
    enabled: true,
  });
  const ruleRowCount = db.prepare('SELECT COUNT(*) AS n FROM autonomous_rules').get().n;
  assert(ruleRowCount >= 1, `rule persisted to autonomous_rules (got ${ruleRowCount})`);
  const enabled = await ruleEvaluator.rulesRepo.getAllEnabled('u-1');
  assert(enabled.length >= 1, `rule is enabled and fetchable (got ${enabled.length})`);

  // (a) Guard ON -> change routed to draft, no live API call
  settingsRepo.setApprovalRequired(true);
  apiCalls = [];
  db.prepare('DELETE FROM approval_drafts').run();
  const resOn = await ruleEvaluator.checkCampaigns('u-1');
  assert(resOn.length >= 1, `checkCampaigns returned >=1 result (got ${resOn.length})`);
  assert(resOn.some(r => r.intercepted === true), `checkCampaigns routed an intercepted draft (got ${JSON.stringify(resOn)})`);
  assert(apiCalls.length === 0, `no live API call while guard ON (got ${apiCalls.length})`);
  const draftOn = db.prepare('SELECT COUNT(*) AS n FROM approval_drafts').get().n;
  assert(draftOn === 1, `1 draft created by checkCampaigns with guard ON (got ${draftOn})`);

  // (b) Guard OFF -> change applied live, no draft
  settingsRepo.setApprovalRequired(false);
  apiCalls = [];
  db.prepare('DELETE FROM approval_drafts').run();
  const resOff = await ruleEvaluator.checkCampaigns('u-1');
  assert(resOff.length >= 1, `checkCampaigns returned >=1 result with guard off (got ${resOff.length})`);
  assert(resOff.some(r => r.intercepted === true) === false, `checkCampaigns applied live (no intercept) (got ${JSON.stringify(resOff)})`);
  assert(apiCalls.length === 1, `live API called once by checkCampaigns with guard OFF (got ${apiCalls.length})`);
  const draftOff = db.prepare('SELECT COUNT(*) AS n FROM approval_drafts').get().n;
  assert(draftOff === 0, `no draft created while guard OFF (got ${draftOff})`);

  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });

  console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('HARNESS ERROR:', e);
  process.exit(2);
});
