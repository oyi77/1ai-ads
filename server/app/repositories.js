import { UsersRepository } from '../repositories/users.js';
import { RefreshTokensRepository } from '../repositories/refresh-tokens.js';
import { SettingsRepository } from '../repositories/settings.js';
import { LandingRepository } from '../repositories/landing.js';
import { CampaignsRepository } from '../repositories/campaigns.js';
import { AdsRepository } from '../repositories/ads.js';
import { TemplatesRepository } from '../repositories/templates.js';
import { CompetitorsRepository } from '../repositories/competitors.js';
import { PlatformAccountsRepository } from '../repositories/platform-accounts.js';
import { AiSuggestionsRepository } from '../repositories/ai-suggestions.js';
import { WebhookEventsRepository } from '../repositories/webhook-events.js';
import { RulesRepository } from '../repositories/rules.js';
import { PaymentsRepository } from '../repositories/payments.js';
import { AdUtmMapRepository } from '../repositories/ad-utm-map.js';
import { ScheduleRepository } from '../repositories/schedule.js';
import { AttributionRepository } from '../repositories/attribution.js';
import { ContentSchedulerQueueRepository } from '../repositories/content-scheduler-queue.js';

export function createRepositories(db) {
  const scheduleRepo = new ScheduleRepository(db);
  scheduleRepo.ensureTable();

  const contentSchedulerQueueRepo = new ContentSchedulerQueueRepository(db);

  return {
    usersRepo: new UsersRepository(db),
    refreshTokensRepo: new RefreshTokensRepository(db),
    settingsRepo: new SettingsRepository(db),
    landingRepo: new LandingRepository(db),
    campaignsRepo: new CampaignsRepository(db),
    adsRepo: new AdsRepository(db),
    templatesRepo: new TemplatesRepository(db),
    competitorsRepo: new CompetitorsRepository(db),
    platformAccountsRepo: new PlatformAccountsRepository(db),
    suggestionsRepo: new AiSuggestionsRepository(db),
    webhookEventsRepo: new WebhookEventsRepository(db),
    rulesRepo: new RulesRepository(db),
    paymentsRepo: new PaymentsRepository(db),
    adUtmMapRepo: new AdUtmMapRepository(db),
    scheduleRepo,
    attributionRepo: new AttributionRepository(db),
    contentSchedulerQueueRepo,
  };
}
