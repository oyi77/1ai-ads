import { describe, it, expect, beforeAll } from 'vitest';

// Set ENCRYPTION_KEY before importing crypto module
process.env.ENCRYPTION_KEY = 'a'.repeat(64); // 32 bytes hex

const { encryptToken, decryptToken, tokenHint } = await import('../../../server/lib/crypto.js');

describe('crypto.js — AES-256-GCM Encryption', () => {
  describe('encryptToken / decryptToken round-trip', () => {
    it('encrypts and decrypts a simple string', () => {
      const plaintext = 'EAAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
      const encrypted = encryptToken(plaintext);
      expect(encrypted).not.toBe(plaintext);
      expect(typeof encrypted).toBe('string');
      const decrypted = decryptToken(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('encrypts and decrypts a long token', () => {
      const plaintext = 'EAA' + 'x'.repeat(500);
      const encrypted = encryptToken(plaintext);
      const decrypted = decryptToken(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('encrypts and decrypts empty-ish string', () => {
      const plaintext = 'a';
      const encrypted = encryptToken(plaintext);
      const decrypted = decryptToken(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('encrypts and decrypts unicode', () => {
      const plaintext = 'token-dengan-karakter-特殊-🔑';
      const encrypted = encryptToken(plaintext);
      const decrypted = decryptToken(encrypted);
      expect(decrypted).toBe(plaintext);
    });
  });

  describe('encryption properties', () => {
    it('produces different ciphertext for same plaintext (random IV)', () => {
      const plaintext = 'same-token';
      const enc1 = encryptToken(plaintext);
      const enc2 = encryptToken(plaintext);
      expect(enc1).not.toBe(enc2); // Different IV each time
      expect(decryptToken(enc1)).toBe(decryptToken(enc2)); // Both decrypt to same
    });

    it('output is base64', () => {
      const encrypted = encryptToken('test');
      // base64 regex
      expect(encrypted).toMatch(/^[A-Za-z0-9+/=]+$/);
    });

    it('encrypted length > plaintext length (iv + tag overhead)', () => {
      const plaintext = 'short';
      const encrypted = encryptToken(plaintext);
      const buf = Buffer.from(encrypted, 'base64');
      // iv(16) + tag(16) + plaintext(5) = 37
      expect(buf.length).toBe(IV_LENGTH + TAG_LENGTH + Buffer.byteLength(plaintext));
    });
  });

  describe('tamper detection', () => {
    it('rejects tampered ciphertext', () => {
      const plaintext = 'valid-token';
      const encrypted = encryptToken(plaintext);
      const buf = Buffer.from(encrypted, 'base64');
      // Flip a byte in the ciphertext
      buf[buf.length - 1] ^= 0xff;
      const tampered = buf.toString('base64');
      expect(() => decryptToken(tampered)).toThrow();
    });

    it('rejects tampered auth tag', () => {
      const plaintext = 'valid-token';
      const encrypted = encryptToken(plaintext);
      const buf = Buffer.from(encrypted, 'base64');
      // Flip a byte in the auth tag (bytes 16-31)
      buf[20] ^= 0xff;
      const tampered = buf.toString('base64');
      expect(() => decryptToken(tampered)).toThrow();
    });
  });

  describe('tokenHint', () => {
    it('shows last 4 chars', () => {
      expect(tokenHint('EAAxxxxxxxxxxxxxxabcd')).toBe('*****************abcd');
    });

    it('masks short tokens fully', () => {
      expect(tokenHint('abc')).toBe('***');
      expect(tokenHint('ab')).toBe('**');
    });

    it('handles 4-char token', () => {
      expect(tokenHint('abcd')).toBe('****');
    });

    it('handles 5-char token', () => {
      expect(tokenHint('abcde')).toBe('*bcde');
    });
  });

  describe('error handling', () => {
    it('throws on missing ENCRYPTION_KEY', () => {
      const original = process.env.ENCRYPTION_KEY;
      delete process.env.ENCRYPTION_KEY;
      expect(() => encryptToken('test')).toThrow('ENCRYPTION_KEY not set');
      process.env.ENCRYPTION_KEY = original;
    });

    it('throws on invalid key length', () => {
      const original = process.env.ENCRYPTION_KEY;
      process.env.ENCRYPTION_KEY = 'tooshort';
      expect(() => encryptToken('test')).toThrow('64-character hex');
      process.env.ENCRYPTION_KEY = original;
    });
  });
});

const IV_LENGTH = 16;
const TAG_LENGTH = 16;
