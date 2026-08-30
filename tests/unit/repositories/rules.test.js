import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { RulesRepository } from '../../../server/repositories/rules.js';

function makeRepo() {
  return new RulesRepository(new Database(':memory:'));
}

describe('RulesRepository — enhanced schema', () => {
  it('persists accountId on create and returns it from getAll', () => {
    const repo = makeRepo();
    repo.create({
      userId: 'u1',
      name: 'Acc Rule',
      description: 'Test rule',
      condition: { type: 'leaf', metric: 'cvr', operator: '<', value: 1.5 },
      action: { type: 'notify', params: { message: 'Low CVR!' } },
      priority: 1,
      enabled: true,
      accountId: 'acc1',
    });
    const rows = repo.getAll('u1');
    expect(rows).toHaveLength(1);
    expect(rows[0].accountId).toBe('acc1');
    expect(rows[0].name).toBe('Acc Rule');
    expect(rows[0].description).toBe('Test rule');
  });

  it('stores null accountId for global rules', () => {
    const repo = makeRepo();
    repo.create({
      userId: 'u1',
      name: 'Global Rule',
      condition: { type: 'leaf', metric: 'roas', operator: '<', value: 1 },
      action: { type: 'pause' },
    });
    const rows = repo.getAll('u1');
    expect(rows[0].accountId).toBeNull();
    expect(rows[0].enabled).toBe(true);
  });

  it('stores compound conditions as JSON', () => {
    const repo = makeRepo();
    const rule = repo.create({
      userId: 'u1',
      name: 'Compound Rule',
      condition: {
        type: 'group',
        logic: 'and',
        children: [
          { type: 'leaf', metric: 'ctr', operator: '>', value: 5, window: '1h' },
          { type: 'leaf', metric: 'cvr', operator: '>', value: 2, window: '1h' },
        ],
      },
      action: { type: 'scale_budget', params: { percentage: 20 } },
    });
    expect(rule.condition.type).toBe('group');
    expect(rule.condition.logic).toBe('and');
    expect(rule.condition.children.length).toBe(2);
  });

  it('creates many rules at once', () => {
    const repo = makeRepo();
    const rules = repo.createMany([
      { userId: 'u1', name: 'Rule 1', condition: {}, action: {} },
      { userId: 'u1', name: 'Rule 2', condition: {}, action: {} },
      { userId: 'u1', name: 'Rule 3', condition: {}, action: {} },
    ]);
    expect(rules.length).toBe(3);
  });

  it('updates trigger count', () => {
    const repo = makeRepo();
    const rule = repo.create({
      userId: 'u1',
      name: 'Trigger Test',
      condition: { type: 'leaf', metric: 'cvr', operator: '<', value: 1 },
      action: { type: 'pause' },
    });
    repo.trigger(rule.id);
    const updated = repo.getById(rule.id);
    expect(updated.triggerCount).toBe(1);
    expect(updated.lastTriggeredAt).toBeTruthy();
  });
});
