/**
 * Telegram Mini App bootstrap.
 * When the SPA is launched inside Telegram, WebApp.initData carries a signed
 * payload — exchange it for our JWT so the user lands already authenticated.
 */
import { api } from './api';

/* eslint-disable no-unused-vars */
declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        ready: () => void;
        expand: () => void;
        initDataUnsafe?: { user?: { first_name?: string; username?: string } };
      };
    };
  }
}

export function initTelegramWebApp(): boolean {
  const tg = window.Telegram?.WebApp;
  if (!tg?.initData) return false;

  try {
    tg.ready();
    tg.expand();
  } catch {
    /* non-fatal */
  }

  if (!api.isAuthenticated()) {
    api
      .telegramLogin(tg.initData)
      .then(() => {
        // Reload once so RequireAuth picks up the fresh token on the current route.
        window.location.reload();
      })
      .catch(() => {
        // Invalid/expired initData — fall through to the normal login page.
      });
    return true;
  }
  return false;
}
