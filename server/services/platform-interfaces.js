/**
 * Platform API Interfaces (DIP)
 *
 * Defines contracts for platform API clients.
 * Services depend on these interfaces, not concrete implementations.
 *
 * SOLID: Dependency Inversion Principle — abstractions, not concretions.
 *
 * NOTE: JS has no native interfaces. These are documented contracts.
 * Each platform client (meta-api, google-ads-api, tiktok-api) must implement these methods.
 */

/**
 * @interface PlatformAPI
 * Contract for all platform ad API clients.
 *
 * Required methods:
 * - getCampaigns(accountId, opts) → Campaign[]
 * - getCampaignInsights(campaignId, opts) → Insights
 * - createCampaign(accountId, params) → Campaign
 * - updateCampaign(campaignId, updates) → Result
 * - createAdSet(accountId, campaignId, params) → AdSet
 * - createAdCreative(accountId, params) → Creative
 * - createAd(accountId, params) → Ad
 */

/**
 * @interface ConnectionService
 * Contract for platform connection services.
 *
 * Required methods:
 * - connect(authCode, redirectUri) → { accessToken, expires }
 * - getAccounts(accessToken) → { personal: Account[], business: Account[] }
 * - linkAccount(userId, accountId, name, accessToken) → Result
 */

/**
 * @interface RuleEngine
 * Contract for rule evaluation engines.
 *
 * Required methods:
 * - createRule(userId, opts) → Rule
 * - evaluateRule(rule, campaign) → ActionResult | null
 * - checkCampaigns(userId) → ActionResult[]
 */

/**
 * @interface Reporter
 * Contract for campaign reporting services.
 *
 * Required methods:
 * - sendDailyReport(userId) → Report
 */

/**
 * @interface ProfitabilityCalculator
 * Contract for profitability calculations.
 *
 * Required (pure functions):
 * - calculateProfit(commission, spend) → number
 * - evaluateROAS(commission, spend) → number
 * - getCampaignStatus(commission, spend) → 'PROFITABLE'|'BREAKEVEN'|'RUGI'
 * - shouldScale({ roas, ctr, cpc }) → boolean
 * - shouldStop(roas, daysRunning) → boolean
 */

/**
 * @interface StoplossEngine
 * Contract for stoploss evaluation.
 *
 * Required (pure functions):
 * - calculateRoasDrop(currentROAS, previousROAS) → number
 * - detectRoasDrop(currentROAS, previousROAS) → { dropped, dropPercentage, exceedsThreshold }
 * - evaluateStoploss(params) → { action, newBudget, reason }
 * - canIncreaseBudget(roasIsDropping) → { allowed, reason }
 */

/**
 * @interface WorkflowEngine
 * Contract for workflow orchestration.
 *
 * Required methods:
 * - runDailyCheck(userId) → CampaignStatus[]
 * - run3DayEvaluation(campaignId) → EvaluationResult
 * - getWeeklyAction() → { day, action, description }
 * - generateCampaignReport(campaignId) → string
 */

/**
 * @interface ScaleManager
 * Contract for scale-up management.
 *
 * Required methods:
 * - evaluateScaleEligibility(metrics) → { canScale, reason }
 * - duplicateCampaign(accountId, sourceCampaignId, newInterests) → DuplicateResult
 * - expandHiddenInterests(product, currentInterests) → string[]
 * - discoverBudgetCap(currentBudget, roasIsDropping) → { newBudget, action, reason }
 */

// Export as documentation marker
export const INTERFACES_VERSION = '1.0.0';
