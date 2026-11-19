import { describe, expect, it, vi } from 'vitest';
import { CrossNetworkAllocator } from '../../../server/services/cross-network-allocator.js';

function repo(rows) {
  return { findAll: ({ userId, platform }) => ({ data: rows.filter(r => (!platform || r.platform === platform)) }) };
}

describe('CrossNetworkAllocator', () => {
  it('requires a positive budget and user', () => {
    const allocator = new CrossNetworkAllocator({ campaignsRepo: repo([]) });
    expect(() => allocator.recommend('', 100)).toThrow('userId is required');
    expect(() => allocator.recommend('u1', -1)).toThrow('totalBudget must be positive');
  });

  it('allocates by ROAS and remains advisory', () => {
    const allocator = new CrossNetworkAllocator({
      campaignsRepo: repo([
        { platform: 'meta', spend: 100, revenue: 300 },
        { platform: 'google', spend: 100, revenue: 100 },
      ]),
    });
    const result = allocator.recommend('u1', 1000);
    expect(result.advisory).toBe(true);
    expect(result.allocations.find(a => a.platform === 'meta').recommendedBudget).toBe(750);
    expect(result.allocations.find(a => a.platform === 'google').recommendedBudget).toBe(250);
  });

  it('does not apply without the explicit environment gate', async () => {
    const execute = vi.fn();
    const allocator = new CrossNetworkAllocator({ campaignsRepo: repo([]), actionGateway: { execute } });
    const result = await allocator.applyRecommendation('u1', { allocations: [] });
    expect(result.applied).toBe(false);
    expect(execute).not.toHaveBeenCalled();
  });
});
