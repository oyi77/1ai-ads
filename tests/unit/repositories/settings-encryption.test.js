import { describe, it, expect, beforeEach, vi } from 'vitest';

// Deterministic 32-byte key so encrypt↔decrypt round-trips in the test.
process.env.ENCRYPTION_KEY = 'a'.repeat(64);

vi.mock('../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }),
}));

import { createDatabase } from '../../../db/index.js';
import { SettingsRepository } from '../../../server/repositories/settings.js';

const CFG = {
  url: 'https://ai.example.com/v1/chat/completions',
  model: 'm1',
  format: 'openai',
  apiKey: 'sk-super-secret-value',
};

describe('SettingsRepository — llm_config secret is encrypted at rest', () => {
  let db, repo;

  beforeEach(() => {
    db = createDatabase(':memory:');
    db.prepare('DELETE FROM settings').run();
    repo = new SettingsRepository(db);
  });

  const rawRow = () =>
    db.prepare("SELECT value FROM settings WHERE key='llm_config'").get().value;

  it('stores the apiKey encrypted, not as plaintext', () => {
    repo.set('llm_config', CFG);
    const raw = rawRow();
    expect(raw).not.toContain('sk-super-secret-value');
    expect(raw).toContain('enc:v1:');
  });

  it('round-trips the apiKey transparently via get()', () => {
    repo.set('llm_config', CFG);
    const got = repo.get('llm_config');
    expect(got.apiKey).toBe('sk-super-secret-value');
    expect(got.url).toBe(CFG.url);
    expect(got.model).toBe('m1');
    expect(got.format).toBe('openai');
  });

  it('decrypts in getAll() too', () => {
    repo.set('llm_config', CFG);
    expect(repo.getAll().llm_config.apiKey).toBe('sk-super-secret-value');
  });

  it('reads a legacy plaintext row without breaking (no re-encrypt on read)', () => {
    db.prepare("INSERT INTO settings (key, value) VALUES ('llm_config', ?)").run(JSON.stringify(CFG));
    expect(repo.get('llm_config').apiKey).toBe('sk-super-secret-value');
    // upgrade-in-place happens on the next write
    repo.set('llm_config', repo.get('llm_config'));
    expect(rawRow()).toContain('enc:v1:');
  });

  it('does not encrypt non-secret settings', () => {
    repo.set('theme', { apiKey: 'not-a-secret-here' });
    const raw = db.prepare("SELECT value FROM settings WHERE key='theme'").get().value;
    expect(raw).not.toContain('enc:v1:');
    expect(raw).toContain('not-a-secret-here');
  });

  it('leaves a config with no apiKey untouched', () => {
    repo.set('llm_config', { url: 'http://x', model: 'y', format: 'openai' });
    const raw = rawRow();
    expect(raw).not.toContain('enc:v1:');
    expect(repo.get('llm_config').url).toBe('http://x');
  });

  it('fails safe (empty key) when the ciphertext cannot be decrypted', () => {
    repo.set('llm_config', CFG);
    // Simulate a rotated ENCRYPTION_KEY by corrupting the stored ciphertext.
    const row = JSON.parse(rawRow());
    row.apiKey = 'enc:v1:Zm9vYmFy'; // valid base64, invalid payload
    db.prepare("UPDATE settings SET value=? WHERE key='llm_config'").run(JSON.stringify(row));
    const got = repo.get('llm_config');
    expect(got.apiKey).toBe('');
    expect(got.url).toBe(CFG.url); // rest of the config survives
  });
});
