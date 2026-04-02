import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase } from '../../../db/index.js';
import { UsersRepository } from '../../../server/repositories/users.js';

describe('UsersRepository', () => {
  let db;
  let repo;

  beforeEach(() => {
    db = createDatabase(':memory:');
    repo = new UsersRepository(db);
  });

  it('create inserts user and returns id', () => {
    const id = repo.create({ username: 'testuser', password_hash: 'hash123' });
    expect(id).toBeDefined();
    expect(typeof id).toBe('string');
  });

  it('findByUsername returns user', () => {
    repo.create({ username: 'alice', password_hash: 'hash' });
    const user = repo.findByUsername('alice');
    expect(user).not.toBeNull();
    expect(user.username).toBe('alice');
    expect(user.password_hash).toBe('hash');
  });

  it('findByUsername returns null for nonexistent', () => {
    expect(repo.findByUsername('nobody')).toBeNull();
  });

  it('findById returns user', () => {
    const id = repo.create({ username: 'bob', password_hash: 'hash' });
    const user = repo.findById(id);
    expect(user.username).toBe('bob');
  });

  it('duplicate username throws', () => {
    repo.create({ username: 'unique', password_hash: 'hash' });
    expect(() => repo.create({ username: 'unique', password_hash: 'hash2' })).toThrow();
  });
});
