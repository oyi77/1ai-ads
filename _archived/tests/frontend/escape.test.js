import { describe, it, expect } from 'vitest';

// Test the client-side escape function
// Import from source since it's pure JS with no DOM dependency
import { esc } from '../../client/src/lib/escape.js';

describe('Client escape utility', () => {
  it('escapes < and >', () => {
    expect(esc('<script>')).toBe('&lt;script&gt;');
  });

  it('escapes &', () => {
    expect(esc('a & b')).toBe('a &amp; b');
  });

  it('escapes quotes', () => {
    expect(esc('"hello"')).toBe('&quot;hello&quot;');
    expect(esc("it's")).toBe("it&#39;s");
  });

  it('handles null/undefined', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
  });

  it('handles numbers', () => {
    expect(esc(42)).toBe('42');
  });

  it('handles empty string', () => {
    expect(esc('')).toBe('');
  });
});
