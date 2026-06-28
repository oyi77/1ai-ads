import { createLogger } from '../lib/logger.js';

const log = createLogger('batch-service');

export class BatchService {
  constructor(metaApi) {
    this.meta = metaApi;
  }

  async batchRequest(requests) {
    log.info('batchRequest', { count: requests.length });
    return this.meta._post('/', { batch: requests });
  }

  async batchPause(entityIds, _entityType = 'campaign') {
    const requests = entityIds.map(id => ({
      method: 'POST',
      relative_url: `/${id}`,
      body: `status=PAUSED`
    }));
    return this.batchRequest(requests);
  }

  async batchActivate(entityIds, _entityType = 'campaign') {
    const requests = entityIds.map(id => ({
      method: 'POST',
      relative_url: `/${id}`,
      body: `status=ACTIVE`
    }));
    return this.batchRequest(requests);
  }

  async batchUpdateBudget(entityUpdates) {
    const requests = entityUpdates.map(({ id, daily_budget }) => ({
      method: 'POST',
      relative_url: `/${id}`,
      body: `daily_budget=${daily_budget}`
    }));
    return this.batchRequest(requests);
  }
}
