import { describe, expect, it, vi } from 'vitest';
import { MetaAdsAPI, toMinorUnits } from '../../../server/services/meta/index.js';

vi.mock('../../../server/lib/platform-client.js', () => ({
  safeFetch: vi.fn(),
}));

vi.mock('../../../server/config/index.js', () => ({
  default: { fbSystemToken: null, metaApiVersion: 'v19.0' },
}));

vi.mock('facebook-nodejs-business-sdk', () => ({
  FacebookAdsApi: { init: vi.fn() },
}));

describe('Meta write safety', () => {
  it('converts JPY without multiplying by 100', () => {
    expect(toMinorUnits(500, 'JPY')).toBe(500);
  });

  it('throws when the amount is less than one minor unit', () => {
    expect(() => toMinorUnits(0.5, 'JPY')).toThrow('minor units');
  });

  it('asserts account ownership when createCampaign receives userId', async () => {
    const platformAccountsRepo = { ownsAccount: vi.fn().mockReturnValue(true) };
    const api = new MetaAdsAPI('test-token', { platformAccountsRepo });
    api._post = vi.fn().mockResolvedValue({ id: 'campaign-1' });
    api._get = vi.fn().mockResolvedValue({ id: 'campaign-1', name: 'Test', status: 'PAUSED' });

    await api.createCampaign('account-1', {
      name: 'Test',
      objective: 'OUTCOME_SALES',
    }, 'user-1');

    expect(platformAccountsRepo.ownsAccount).toHaveBeenCalledWith('act_account-1', 'user-1');
  });
});
