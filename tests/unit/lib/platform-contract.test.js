import { describe, it, expect } from 'vitest';
import { PLATFORM_REGISTRY, getPlatform } from '../../../server/platforms/index.js';

// Regression guard: every platform exposed through the generic campaign router
// MUST satisfy the 5-method BasePlatformApiClient contract. Platforms that don't
// (e.g. WhatsApp — a messaging/template platform, not a campaign-buyer) MUST be
// flagged hasCustomRoutes:true and serve their own router, so they never reach
// validatePlatform via the generic mount.
//
// This catches the "missing method looks like a stub" gap automatically: if a
// generic-routed platform drops a required method, this test fails loud.
describe('platform contract', () => {
  const genericPlatforms = Object.values(PLATFORM_REGISTRY).filter(
    (cfg) => !cfg.hasCustomRoutes
  );

  it('should have at least the known campaign platforms', { timeout: 30000 }, () => {
    expect(genericPlatforms.length).toBeGreaterThan(10);
  });

  it('every generic-routed platform must pass validatePlatform via getPlatform', { timeout: 30000 }, async () => {
    const settingsRepo = { getCredentials: () => null };
    for (const cfg of genericPlatforms) {
      // getPlatform internally calls validatePlatform(); a missing required
      // method throws there — exactly the runtime failure we're guarding against.
      const instance = await getPlatform(cfg.key, settingsRepo);
      expect(instance, `getPlatform('${cfg.key}') returned a usable client`).toBeTruthy();
    }
  });

  it('whatsapp is excluded from the generic contract (custom routes)', () => {
    const wa = PLATFORM_REGISTRY.whatsapp;
    expect(wa).toBeTruthy();
    expect(wa.hasCustomRoutes).toBe(true);
    expect(wa.routeFactory).toBe('createWhatsAppAdsRouter');
  });
});
