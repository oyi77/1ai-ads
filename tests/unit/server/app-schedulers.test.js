import { describe, it, expect, vi, afterEach } from 'vitest';
import { startServices } from '../../../server/app.js';

function makeApp() {
  return {
    locals: {
      _services: {
        autonomousAgent: { runAutonomousMode: vi.fn() },
        autoOptimizer: { start: vi.fn() },
        aiAgent: { startScheduler: vi.fn() },
        webhookProcessor: { start: vi.fn() },
        dataCleanup: { start: vi.fn() },
        fatigueDetector: { start: vi.fn() },
        capiMonitor: { start: vi.fn() },
        alertingService: {},
        usersRepo: { findAll: vi.fn(() => []) },
        platformAccountsRepo: { getAccounts: vi.fn(() => []) },
        settingsRepo: {},
        bot: null,
      },
    },
  };
}

describe('startServices kill-switch', () => {
  afterEach(() => {
    delete process.env.SCHEDULERS_DISABLED;
    vi.restoreAllMocks();
  });

  it('starts every scheduler when the kill-switch is off', () => {
    delete process.env.SCHEDULERS_DISABLED;
    const app = makeApp();
    startServices(app);
    const s = app.locals._services;
    expect(s.autonomousAgent.runAutonomousMode).toHaveBeenCalled();
    expect(s.autoOptimizer.start).toHaveBeenCalled();
    expect(s.webhookProcessor.start).toHaveBeenCalled();
    expect(s.dataCleanup.start).toHaveBeenCalled();
    expect(s.fatigueDetector.start).toHaveBeenCalled();
    expect(s.capiMonitor.start).toHaveBeenCalled();
  });

  it('skips every scheduler when SCHEDULERS_DISABLED=1', () => {
    process.env.SCHEDULERS_DISABLED = '1';
    const app = makeApp();
    startServices(app);
    const s = app.locals._services;
    expect(s.autonomousAgent.runAutonomousMode).not.toHaveBeenCalled();
    expect(s.autoOptimizer.start).not.toHaveBeenCalled();
    expect(s.webhookProcessor.start).not.toHaveBeenCalled();
    expect(s.dataCleanup.start).not.toHaveBeenCalled();
    expect(s.fatigueDetector.start).not.toHaveBeenCalled();
    expect(s.capiMonitor.start).not.toHaveBeenCalled();
  });
});
