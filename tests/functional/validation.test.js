import { describe, it, expect } from 'vitest';
import { validateAd, validateLandingPage, validateRequired, validateEnum } from '../../server/lib/validate.js';
import { escapeHtml, validateUrl } from '../../server/lib/escape.js';
import { hashPassword, verifyPassword, generateToken, verifyToken } from '../../server/lib/auth.js';

describe('Functional: Validation Pipeline', () => {
  it('ad with all valid fields passes', () => {
    const result = validateAd({
      name: 'Summer Campaign',
      platform: 'meta',
      format: 'carousel',
      status: 'active'
    });
    expect(result.valid).toBe(true);
  });

  it('ad pipeline rejects invalid then valid fix', () => {
    const bad = validateAd({ platform: 'meta' }); // missing name
    expect(bad.valid).toBe(false);

    const fixed = validateAd({ name: 'Fixed', platform: 'meta' });
    expect(fixed.valid).toBe(true);
  });

  it('landing page validation chain', () => {
    expect(validateLandingPage({}).valid).toBe(false);
    expect(validateLandingPage({ name: 'LP', theme: 'neon' }).valid).toBe(false);
    expect(validateLandingPage({ name: 'LP', theme: 'dark' }).valid).toBe(true);
  });
});

describe('Functional: XSS Prevention Pipeline', () => {
  it('user input -> escape -> safe HTML', () => {
    const malicious = '<script>alert(document.cookie)</script>';
    const safe = escapeHtml(malicious);
    expect(safe).not.toContain('<script>');
    expect(safe).toContain('&lt;script&gt;');
  });

  it('URL validation blocks javascript: protocol', () => {
    expect(validateUrl('javascript:alert(1)')).toBe(false);
    expect(validateUrl('https://example.com')).toBe(true);
    expect(validateUrl('http://wa.me/123')).toBe(true);
  });

  it('combined: escape + URL for landing page CTA', () => {
    const safeUrl = validateUrl('javascript:void(0)');
    expect(safeUrl).toBe(false);
    const escaped = escapeHtml('"><img onerror=alert(1) src=x>');
    expect(escaped).not.toContain('<img');
  });
});

describe('Functional: Auth Pipeline', () => {
  it('password hash -> verify round-trip', () => {
    const hash = hashPassword('mypassword');
    expect(verifyPassword('mypassword', hash)).toBe(true);
    expect(verifyPassword('wrongpassword', hash)).toBe(false);
  });

  it('token generate -> verify round-trip', () => {
    const token = generateToken({ id: '123', username: 'test' });
    const decoded = verifyToken(token);
    expect(decoded.id).toBe('123');
    expect(decoded.username).toBe('test');
  });

  it('expired/bad token throws', () => {
    expect(() => verifyToken('garbage.token.here')).toThrow();
  });
});

describe('Functional: Ad Generation Parsing', () => {
  it('parseJsonResponse from ai.js handles code blocks', async () => {
    const { parseJsonResponse } = await import('../../server/services/ai.js');
    const result = parseJsonResponse('```json\n{"ads":[{"hook":"Test"}]}\n```');
    expect(result.ads[0].hook).toBe('Test');
  });

  it('parseJsonResponse handles plain JSON', async () => {
    const { parseJsonResponse } = await import('../../server/services/ai.js');
    const result = parseJsonResponse('{"ads":[]}');
    expect(result.ads).toEqual([]);
  });

  it('parseJsonResponse handles invalid JSON gracefully', async () => {
    const { parseJsonResponse } = await import('../../server/services/ai.js');
    const result = parseJsonResponse('not json');
    expect(result.error).toBeDefined();
    expect(result.raw_content).toBe('not json');
  });
});

describe('Functional: Template Rendering', () => {
  it('renderLandingPage produces valid HTML', async () => {
    const { renderLandingPage } = await import('../../server/services/templates.js');
    const html = renderLandingPage({
      product_name: 'Test Product',
      theme: 'dark',
      price: 'Rp 500.000',
      benefits: ['Fast', 'Cheap'],
      pain_points: ['Slow'],
      cta_primary: 'Buy Now',
    });
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Test Product');
    expect(html).toContain('Fast');
    expect(html).toContain('Buy Now');
  });

  it('renderLandingPage uses responsive grid', async () => {
    const { renderLandingPage } = await import('../../server/services/templates.js');
    const html = renderLandingPage({ product_name: 'Test', benefits: ['A'], pain_points: ['B'] });
    expect(html).toContain('sm:grid-cols-2');
    expect(html).toContain('md:grid-cols-3');
  });
});
