import { EventEmitter } from 'events';
import { createLogger } from './logger.js';

const log = createLogger('event-bus');

export const EVENTS = Object.freeze({
  // Campaign lifecycle
  CAMPAIGN_PAUSED: 'campaign:paused',
  CAMPAIGN_UPDATED: 'campaign:updated',
  CAMPAIGN_CREATED: 'campaign:created',
  CAMPAIGN_SYNCED: 'campaign:synced',

  // Spend guard
  SPEND_LIMIT_REACHED: 'spend:limit:reached',
  SPEND_LIMIT_WARNING: 'spend:limit:warning',
  SPEND_CHECK_RESULT: 'spend:check:result',

  // Rules
  RULE_TRIGGERED: 'rule:triggered',
  RULE_EVALUATED: 'rule:evaluated',

  // Webhooks
  WEBHOOK_RECEIVED: 'webhook:received',

  // Health
  HEALTH_ALERT: 'health:alert',
  SYNC_COMPLETE: 'sync:complete',

  // Scale
  SCALE_DECIDED: 'scale:decided',
  OPTIMIZER_ACTION: 'optimizer:action',

  // Creative fatigue
  CREATIVE_FATIGUE_DETECTED: 'creative:fatigue:detected',
  CREATIVE_REFRESH_NEEDED: 'creative:refresh:needed',

  // A/B testing
  AB_TEST_STARTED: 'ab:test:started',
  AB_TEST_COMPLETED: 'ab:test:completed',
  AB_TEST_WINNER_SELECTED: 'ab:test:winner:selected',

  // Bulk
  BULK_PROGRESS: 'bulk:progress',

  // Notifications
  NOTIFY: 'notify',
});

class Bus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
  }

  fire(event, payload) {
    log.debug('fire', { event });
    this.emit(event, payload);
  }

  onEvent(event, handler) {
    this.on(event, handler);
    return () => this.off(event, handler);
  }
}

export const bus = new Bus();
