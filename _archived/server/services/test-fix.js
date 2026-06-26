// Temporary: Show the exact fix needed in auto-optimizer.test.js

const testCode = `
  beforeEach(() => {
    vi.clearAllMocks();

    mockMetaApi = {
      getCampaignInsights: vi.fn(),
      updateCampaign: vi.fn(),
    };

    mockRulesRepo = {
      findActive: vi.fn(),
      markTriggered: vi.fn(),
    };

    // FIX: Add getById mock to return a campaign with LC_ prefix
    mockCampaignsRepo = {
      getById: vi.fn().mockResolvedValue({
        id: 'camp_456',
        name: 'LC_Test Campaign',  // Must start with LC_ for scaling to be allowed
      }),
    };

    optimizer = new AutoOptimizer(mockMetaApi, mockRulesRepo, mockCampaignsRepo);
  });
`;

console.log(testCode);
