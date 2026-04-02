import { describe, it, expect } from 'vitest';
import { validateRequired, validateEnum, validateAd, validateLandingPage } from '../../../server/lib/validate.js';

describe('validateRequired', () => {
  it('returns error for missing fields', () => {
    const result = validateRequired({ name: '' }, ['name']);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('name');
  });

  it('returns error for null fields', () => {
    const result = validateRequired({ name: null }, ['name']);
    expect(result.valid).toBe(false);
  });

  it('returns error for undefined fields', () => {
    const result = validateRequired({}, ['name']);
    expect(result.valid).toBe(false);
  });

  it('passes for present fields', () => {
    const result = validateRequired({ name: 'Test' }, ['name']);
    expect(result.valid).toBe(true);
  });

  it('checks multiple fields and reports first missing', () => {
    const result = validateRequired({ name: 'Test' }, ['name', 'product']);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('product');
  });
});

describe('validateEnum', () => {
  it('rejects invalid values', () => {
    const result = validateEnum('invalid', ['meta', 'google'], 'platform');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('platform');
  });

  it('accepts valid values', () => {
    const result = validateEnum('meta', ['meta', 'google'], 'platform');
    expect(result.valid).toBe(true);
  });

  it('passes for null/undefined (optional field)', () => {
    const result = validateEnum(null, ['meta', 'google'], 'platform');
    expect(result.valid).toBe(true);
  });

  it('passes for empty string (optional field)', () => {
    const result = validateEnum('', ['meta', 'google'], 'platform');
    expect(result.valid).toBe(true);
  });
});

describe('validateAd', () => {
  it('requires name field', () => {
    const result = validateAd({});
    expect(result.valid).toBe(false);
    expect(result.error).toContain('name');
  });

  it('validates platform enum', () => {
    const result = validateAd({ name: 'Test', platform: 'linkedin' });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('platform');
  });

  it('accepts valid platform values', () => {
    for (const platform of ['meta', 'google', 'tiktok', 'x']) {
      const result = validateAd({ name: 'Test', platform });
      expect(result.valid).toBe(true);
    }
  });

  it('validates format enum', () => {
    const result = validateAd({ name: 'Test', format: 'banner' });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('format');
  });

  it('accepts valid format values', () => {
    for (const format of ['single_image', 'carousel', 'video']) {
      const result = validateAd({ name: 'Test', format });
      expect(result.valid).toBe(true);
    }
  });

  it('validates status enum', () => {
    const result = validateAd({ name: 'Test', status: 'published' });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('status');
  });

  it('accepts valid status values', () => {
    for (const status of ['draft', 'active', 'archived']) {
      const result = validateAd({ name: 'Test', status });
      expect(result.valid).toBe(true);
    }
  });

  it('passes with only name provided (defaults are fine)', () => {
    const result = validateAd({ name: 'My Ad' });
    expect(result.valid).toBe(true);
  });
});

describe('validateLandingPage', () => {
  it('requires name field', () => {
    const result = validateLandingPage({});
    expect(result.valid).toBe(false);
    expect(result.error).toContain('name');
  });

  it('validates theme enum', () => {
    const result = validateLandingPage({ name: 'Test', theme: 'neon' });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('theme');
  });

  it('accepts valid theme values', () => {
    for (const theme of ['dark', 'slate', 'obsidian', 'light']) {
      const result = validateLandingPage({ name: 'Test', theme });
      expect(result.valid).toBe(true);
    }
  });

  it('passes with only name provided', () => {
    const result = validateLandingPage({ name: 'My Landing Page' });
    expect(result.valid).toBe(true);
  });
});
