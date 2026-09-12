import { describe, it, expect, vi } from 'vitest';
import {
  isAccountTokenUsable,
  filterUsableAccounts,
  hasUsableAccount,
  isTokenExpiryError,
  flagAccountTokenInvalid,
  normalizeHealthStatus,
  UNUSABLE_HEALTH_STATUSES,
} from '../../../server/lib/token-health.js';

const acc = (over = {}) => ({ id: 'a1', access_token: 'EAA-token', is_active: 1, health_status: 'ok', ...over });

describe('isAccountTokenUsable', () => {
  it('accepts healthy and unverified accounts', () => {
    expect(isAccountTokenUsable(acc())).toBe(true);
    // Never verified / null health must not be treated as dead, or a brand-new
    // account would be permanently skipped.
    expect(isAccountTokenUsable(acc({ health_status: null }))).toBe(true);
    expect(isAccountTokenUsable(acc({ health_status: undefined }))).toBe(true);
  });

  it('rejects every known-dead health status', () => {
    for (const status of UNUSABLE_HEALTH_STATUSES) {
      expect(isAccountTokenUsable(acc({ health_status: status }))).toBe(false);
    }
  });

  it('rejects the exact statuses the token-health cron writes', () => {
    // 'expired' is what the cron and the expiry-flag helper record;
    // 'invalid_token' is what the campaigns route records on Meta code 190.
    expect(isAccountTokenUsable(acc({ health_status: 'expired' }))).toBe(false);
    expect(isAccountTokenUsable(acc({ health_status: 'invalid_token' }))).toBe(false);
  });

  it('is case-insensitive about the status', () => {
    expect(isAccountTokenUsable(acc({ health_status: 'EXPIRED' }))).toBe(false);
    expect(isAccountTokenUsable(acc({ health_status: ' Expired ' }))).toBe(false);
  });

  it('rejects accounts the owner paused', () => {
    expect(isAccountTokenUsable(acc({ is_active: 0 }))).toBe(false);
    expect(isAccountTokenUsable(acc({ is_active: false }))).toBe(false);
  });

  it('rejects null/undefined accounts', () => {
    expect(isAccountTokenUsable(null)).toBe(false);
    expect(isAccountTokenUsable(undefined)).toBe(false);
  });
});

describe('filterUsableAccounts / hasUsableAccount', () => {
  it('drops only the unusable accounts', () => {
    const list = [acc({ id: 'a' }), acc({ id: 'b', health_status: 'expired' }), acc({ id: 'c', is_active: 0 })];
    expect(filterUsableAccounts(list).map(a => a.id)).toEqual(['a']);
  });

  it('tolerates non-array input', () => {
    expect(filterUsableAccounts(null)).toEqual([]);
    expect(filterUsableAccounts(undefined)).toEqual([]);
  });

  it('reports whether any account can be used', () => {
    expect(hasUsableAccount([acc({ health_status: 'expired' })])).toBe(false);
    expect(hasUsableAccount([acc({ health_status: 'expired' }), acc({ id: 'ok' })])).toBe(true);
    expect(hasUsableAccount([])).toBe(false);
  });
});

describe('isTokenExpiryError', () => {
  it('detects Meta token expiry by code, subcode and message', () => {
    expect(isTokenExpiryError({ code: 190 })).toBe(true);
    expect(isTokenExpiryError({ code: 'META_TOKEN_EXPIRED' })).toBe(true);
    expect(isTokenExpiryError({ error_subcode: 463 })).toBe(true);
    expect(isTokenExpiryError({ message: 'Error validating access token: Session has expired on Friday' })).toBe(true);
    expect(isTokenExpiryError({ message: 'Invalid OAuth access token' })).toBe(true);
  });

  it('detects the nested Meta error shape', () => {
    expect(isTokenExpiryError({ error: { code: 190, message: 'OAuthException' } })).toBe(true);
    expect(isTokenExpiryError({ data: { error: { code: 190 } } })).toBe(true);
  });

  it('does NOT treat transient or rate-limit failures as expiry', () => {
    // Flagging these would silently pause a paying customer's automations.
    expect(isTokenExpiryError({ message: 'ETIMEDOUT' })).toBe(false);
    expect(isTokenExpiryError({ message: 'socket hang up' })).toBe(false);
    expect(isTokenExpiryError({ code: 429, message: 'too many requests' })).toBe(false);
    expect(isTokenExpiryError({ message: 'Service temporarily unavailable' })).toBe(false);
    expect(isTokenExpiryError({ code: 500 })).toBe(false);
  });

  it('does NOT treat our own internal faults as expiry', () => {
    expect(isTokenExpiryError({ message: 'Platform map not loaded. Call getPlatform() first.' })).toBe(false);
    expect(isTokenExpiryError({ message: 'api.getAds is not a function' })).toBe(false);
  });

  it('handles empty and string input', () => {
    expect(isTokenExpiryError(null)).toBe(false);
    expect(isTokenExpiryError('')).toBe(false);
    expect(isTokenExpiryError('Session has expired')).toBe(true);
  });
});

describe('flagAccountTokenInvalid', () => {
  it('writes the dead-token flag via the repository', () => {
    const repo = { update: vi.fn() };
    const ok = flagAccountTokenInvalid(repo, 'acct-1', { message: 'Session has expired' }, (s) => s);
    expect(ok).toBe(true);
    expect(repo.update).toHaveBeenCalledWith('acct-1', expect.objectContaining({ health_status: 'expired' }));
  });

  it('truncates the stored error and applies the redactor', () => {
    const repo = { update: vi.fn() };
    flagAccountTokenInvalid(repo, 'a', { message: 'x'.repeat(500) }, (s) => s.replace(/x/g, 'y'));
    const stored = repo.update.mock.calls[0][1].last_error;
    expect(stored.length).toBe(200);
    expect(stored).toMatch(/^y+$/);
  });

  it('swallows repository failure so it cannot break the caller loop', () => {
    const repo = { update: () => { throw new Error('db locked'); } };
    expect(flagAccountTokenInvalid(repo, 'a', { message: 'Session has expired' })).toBe(false);
  });

  it('no-ops without a repo or account id', () => {
    expect(flagAccountTokenInvalid(null, 'a', {})).toBe(false);
    expect(flagAccountTokenInvalid({ update: vi.fn() }, undefined, {})).toBe(false);
  });
});

describe('normalizeHealthStatus', () => {
  it('normalizes missing values to an empty string', () => {
    expect(normalizeHealthStatus({})).toBe('');
    expect(normalizeHealthStatus(null)).toBe('');
    expect(normalizeHealthStatus({ health_status: ' OK ' })).toBe('ok');
  });
});
