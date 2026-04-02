import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, generateToken, verifyToken } from '../../../server/lib/auth.js';

describe('hashPassword + verifyPassword', () => {
  it('round-trip works', () => {
    const hash = hashPassword('test123');
    expect(verifyPassword('test123', hash)).toBe(true);
  });

  it('wrong password returns false', () => {
    const hash = hashPassword('test123');
    expect(verifyPassword('wrong', hash)).toBe(false);
  });

  it('hash is not the original password', () => {
    const hash = hashPassword('test123');
    expect(hash).not.toBe('test123');
  });
});

describe('generateToken + verifyToken', () => {
  it('round-trip works', () => {
    const token = generateToken({ id: 'abc', username: 'user1' });
    const decoded = verifyToken(token);
    expect(decoded.id).toBe('abc');
    expect(decoded.username).toBe('user1');
  });

  it('token has expiry', () => {
    const token = generateToken({ id: 'abc' });
    const decoded = verifyToken(token);
    expect(decoded.exp).toBeDefined();
  });

  it('invalid token throws', () => {
    expect(() => verifyToken('not-a-valid-token')).toThrow();
  });

  it('empty string throws', () => {
    expect(() => verifyToken('')).toThrow();
  });
});
