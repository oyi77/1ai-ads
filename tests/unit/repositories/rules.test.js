import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { RulesRepository } from '../../../server/repositories/rules.js';

function makeRepo() {
  const repo = new RulesRepository(new Database(':memory:'));
  return repo;
}

describe('RulesRepository — account scoping', () => {
  it('persists account_id on create and returns it from getAll', () => {
    const repo = makeRepo();
    repo.create({
      user_id: 'u1',
      name: 'Acc Rule',
      condition: '{}',
      action: '{}',
      priority: 1,
      enabled: true,
      account_id: 'acc1',
    });
    const rows = repo.getAll('u1');
    expect(rows).toHaveLength(1);
    expect(rows[0].account_id).toBe('acc1');
  });

  it('stores null account_id for global rules', () => {
    const repo = makeRepo();
    repo.create({
      user_id: 'u1',
      name: 'Global Rule',
      condition: '{}',
      action: '{}',
      priority: 1,
      enabled: true,
    });
    const rows = repo.getAll('u1');
    expect(rows[0].account_id).toBeNull();
  });

  it('getAllEnabledForScope returns account + global rules, excluding other accounts', () => {
    const repo = makeRepo();
    repo.create({ user_id: 'u1', name: 'Acc Rule', condition: '{}', action: '{}', priority: 1, enabled: true, account_id: 'acc1' });
    repo.create({ user_id: 'u1', name: 'Other Rule', condition: '{}', action: '{}', priority: 1, enabled: true, account_id: 'other2' });
    repo.create({ user_id: 'u1', name: 'Global Rule', condition: '{}', action: '{}', priority: 1, enabled: true, account_id: null });
    repo.create({ user_id: 'u1', name: 'Disabled Rule', condition: '{}', action: '{}', priority: 1, enabled: false, account_id: 'acc1' });

    const rows = repo.getAllEnabledForScope('u1', 'acc1');
    const names = rows.map((r) => r.name).sort();
    expect(names).toEqual(['Acc Rule', 'Global Rule']);
  });

  it('getAllEnabledForScope with null scope returns only global rules', () => {
    const repo = makeRepo();
    repo.create({ user_id: 'u1', name: 'Acc Rule', condition: '{}', action: '{}', priority: 1, enabled: true, account_id: 'acc1' });
    repo.create({ user_id: 'u1', name: 'Global Rule', condition: '{}', action: '{}', priority: 1, enabled: true, account_id: null });

    const rows = repo.getAllEnabledForScope('u1', null);
    const names = rows.map((r) => r.name);
    expect(names).toEqual(['Global Rule']);
  });
});
