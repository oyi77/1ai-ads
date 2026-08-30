import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { RulesRepository } from '../../../server/repositories/rules.js';

describe('Enhanced Rules Schema', () => {
  let repo;
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    repo = new RulesRepository(db);
  });

  it('creates table with new columns', () => {
    const rule = repo.create({
      userId: 'u1',
      name: 'Test Rule',
      description: 'Test description',
      condition: { type: 'leaf', metric: 'ctr', operator: '>', value: 5, window: '1h' },
      action: { type: 'notify', params: { message: 'test' } },
      priority: 2,
      enabled: true,
      accountId: 'acc-1',
    });
    expect(rule.id).toBeTruthy();
    expect(rule.name).toBe('Test Rule');
    expect(rule.description).toBe('Test description');
    expect(rule.priority).toBe(2);
    expect(rule.accountId).toBe('acc-1');
  });

  it('creates compound rule', () => {
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

  it('updates trigger count', () => {
    const rule = repo.create({
      userId: 'u1',
      name: 'Trigger Test',
      condition: { type: 'leaf', metric: 'cvr', operator: '<', value: 1, window: '1h' },
      action: { type: 'pause' },
    });
    repo.trigger(rule.id);
    const updated = repo.getById(rule.id);
    expect(updated.triggerCount).toBe(1);
    expect(updated.lastTriggeredAt).toBeTruthy();
  });

  it('creates many rules at once', () => {
    const rules = repo.createMany([
      { userId: 'u1', name: 'Rule 1', condition: {}, action: {} },
      { userId: 'u1', name: 'Rule 2', condition: {}, action: {} },
      { userId: 'u1', name: 'Rule 3', condition: {}, action: {} },
    ]);
    expect(rules.length).toBe(3);
  });
});
