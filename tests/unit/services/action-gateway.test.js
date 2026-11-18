import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionGateway } from '../../../server/services/action-gateway.js';

const actor = { userId: 'u1', role: 'user', tier: 'trust' };
const context = { source: 'manual', requestId: 'req-1' };
const envelope = (overrides = {}) => ({
  platform: 'meta',
  accountId: 'act_1',
  campaignId: 'cmp_1',
  action: 'pause',
  params: {},
  ...overrides,
});

describe('ActionGateway', () => {
  let adapter;
  let policy;
  let gateway;

  beforeEach(() => {
    adapter = {
      updateCampaign: vi.fn().mockResolvedValue({ id: 'cmp_1', status: 'PAUSED' }),
      createCampaign: vi.fn().mockResolvedValue({ id: 'cmp_new' }),
      duplicateCampaign: vi.fn().mockResolvedValue({ id: 'cmp_copy' }),
    };
    policy = { evaluate: vi.fn().mockReturnValue({ allow: true }) };
    gateway = new ActionGateway({ meta: adapter }, policy);
  });

  it('rejects invalid envelope', async () => {
    const result = await gateway.execute({ platform: 'meta' }, actor, context);
    expect(result).toMatchObject({ ok: false, reason: 'invalid_envelope' });
    expect(policy.evaluate).not.toHaveBeenCalled();
  });

  it('returns not_supported for unknown platform', async () => {
    const result = await gateway.execute(envelope({ platform: 'unknown' }), actor, context);
    expect(result).toMatchObject({ ok: false, reason: 'not_supported', platform: 'unknown' });
    expect(policy.evaluate).toHaveBeenCalledOnce();
  });

  it('returns not_supported when adapter lacks the method', async () => {
    const result = await gateway.execute(envelope({ action: 'duplicate' }), actor, context);
    // method exists in this adapter, so it succeeds
    expect(result.ok).toBe(true);

    const readOnly = new ActionGateway({ meta: {} }, policy);
    const unsupported = await readOnly.execute(envelope(), actor, context);
    expect(unsupported).toMatchObject({ ok: false, reason: 'not_supported', action: 'pause' });
  });

  it('does not call adapter when policy blocks', async () => {
    policy.evaluate.mockReturnValue({ blocked: true, reason: 'account_not_allowed' });
    const result = await gateway.execute(envelope(), actor, context);
    expect(result).toMatchObject({ ok: false, reason: 'account_not_allowed' });
    expect(adapter.updateCampaign).not.toHaveBeenCalled();
  });

  it('does not call adapter when approval is required', async () => {
    policy.evaluate.mockReturnValue({ requireApproval: true, reason: 'approval_first_tier' });
    const result = await gateway.execute(envelope(), actor, context);
    expect(result).toMatchObject({ ok: false, reason: 'require_approval' });
    expect(adapter.updateCampaign).not.toHaveBeenCalled();
  });

  it('dispatches pause with PAUSED status', async () => {
    const result = await gateway.execute(envelope(), actor, context);
    expect(adapter.updateCampaign).toHaveBeenCalledWith('cmp_1', { status: 'PAUSED' });
    expect(result).toMatchObject({ ok: true, platform: 'meta', action: 'pause' });
  });

  it('normalizes adapter errors', async () => {
    adapter.updateCampaign.mockRejectedValue(new Error('Meta unavailable'));
    const result = await gateway.execute(envelope(), actor, context);
    expect(result).toMatchObject({ ok: false, reason: 'platform_error', message: 'Meta unavailable' });
  });

  it('defaults create status to PAUSED', async () => {
    await gateway.execute(envelope({ action: 'create', campaignId: null, params: { name: 'New', objective: 'OUTCOME_SALES' } }), actor, context);
    expect(adapter.createCampaign).toHaveBeenCalledWith('act_1', expect.objectContaining({ status: 'PAUSED' }), undefined);
  });

  it('passes normalized action and identity to PolicyEngine', async () => {
    await gateway.execute(envelope({ action: 'resume' }), actor, context);
    expect(policy.evaluate).toHaveBeenCalledWith(expect.objectContaining({
      actor,
      context,
      action: expect.objectContaining({ type: 'resume', platform: 'meta', accountId: 'act_1', campaignId: 'cmp_1' }),
    }));
  });

  it('supports audit-only dry-run mode', async () => {
    const dry = new ActionGateway({ meta: adapter }, policy, { auditOnly: true });
    const result = await dry.execute(envelope(), actor, context);
    expect(result).toMatchObject({ ok: true, audit_only: true });
    expect(adapter.updateCampaign).not.toHaveBeenCalled();
  });
});
