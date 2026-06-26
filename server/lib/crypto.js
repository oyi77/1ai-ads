/**
 * AES-256-GCM Encryption — Credential Security
 *
 * Encrypts API tokens before storage. Decrypts on read.
 * Ported from asisten-jualan/security/crypto.py.
 *
 * ENCRYPTION_KEY must be a 64-character hex string (32 bytes) in env.
 * Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;  // 128-bit IV
const TAG_LENGTH = 16; // 128-bit auth tag

function getKey() {
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex) {
    throw new Error('ENCRYPTION_KEY not set in environment');
  }
  if (keyHex.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be 64-character hex string (32 bytes)');
  }
  return Buffer.from(keyHex, 'hex');
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * @param {string} plaintext — text to encrypt
 * @returns {string} base64-encoded(iv + auth_tag + ciphertext)
 */
export function encryptToken(plaintext) {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  // Pack: iv (16) + tag (16) + ciphertext
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

/**
 * Decrypt a token encrypted with encryptToken().
 * @param {string} encrypted — base64-encoded ciphertext
 * @returns {string} decrypted plaintext
 */
export function decryptToken(encrypted) {
  const key = getKey();
  const buf = Buffer.from(encrypted, 'base64');

  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const data = buf.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  return decipher.update(data, null, 'utf8') + decipher.final('utf8');
}

/**
 * Show last 4 chars of token for identification without exposure.
 * @param {string} token
 * @returns {string} masked token (e.g., "****abcd")
 */
export function tokenHint(token) {
  const clean = token.trim();
  if (clean.length <= 4) return '*'.repeat(clean.length);
  return '*'.repeat(clean.length - 4) + clean.slice(-4);
}
