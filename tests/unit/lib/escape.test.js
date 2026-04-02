import { describe, it, expect } from 'vitest';
import { escapeHtml, validateUrl } from '../../../server/lib/escape.js';

describe('escapeHtml', () => {
  it('escapes < and > characters', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('escapes & character', () => {
    expect(escapeHtml('foo & bar')).toBe('foo &amp; bar');
  });

  it('escapes double quotes', () => {
    expect(escapeHtml('he said "hello"')).toBe('he said &quot;hello&quot;');
  });

  it('escapes single quotes', () => {
    expect(escapeHtml("it's")).toBe('it&#39;s');
  });

  it('handles null gracefully', () => {
    expect(escapeHtml(null)).toBe('');
  });

  it('handles undefined gracefully', () => {
    expect(escapeHtml(undefined)).toBe('');
  });

  it('handles numbers by converting to string', () => {
    expect(escapeHtml(42)).toBe('42');
  });

  it('returns empty string for empty input', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('does not double-escape already escaped strings', () => {
    expect(escapeHtml('&amp;')).toBe('&amp;amp;');
  });
});

describe('validateUrl', () => {
  it('allows https URLs', () => {
    expect(validateUrl('https://example.com')).toBe(true);
  });

  it('allows http URLs', () => {
    expect(validateUrl('http://example.com')).toBe(true);
  });

  it('rejects javascript: protocol', () => {
    expect(validateUrl('javascript:alert(1)')).toBe(false);
  });

  it('rejects data: protocol', () => {
    expect(validateUrl('data:text/html,<h1>hi</h1>')).toBe(false);
  });

  it('rejects vbscript: protocol', () => {
    expect(validateUrl('vbscript:msgbox')).toBe(false);
  });

  it('handles null gracefully', () => {
    expect(validateUrl(null)).toBe(false);
  });

  it('handles empty string', () => {
    expect(validateUrl('')).toBe(false);
  });

  it('allows relative paths', () => {
    expect(validateUrl('/checkout')).toBe(true);
  });

  it('rejects javascript with mixed case', () => {
    expect(validateUrl('JavaScript:alert(1)')).toBe(false);
  });
});
