import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase } from '../../../db/index.js';
import { AutomationRulesRepository } from '../../../server/repositories/automation-rules.js';
import { v4 as uuid } from 'uuid';

function makeRule(overrides = {}) {
  return {
    campaign_id: uuid(),
    name: 'Test Rule',
    is_active: true,
    condition_metric: 'roas',
    condition_operator: '<',
    condition_value: 1.5,
    action: 'pause',
    action_value: null,
    check_interval: 'daily',
    ...overrides,
  };
}

describe('AutomationRulesRepository', () => {
  let db, repo;

  beforeEach(() => {
    db = createDatabase(':memory:');
    repo = new AutomationRulesRepository(db);
  });

  describe('findAll', () => {
    it('returns empty array initially', () => {
      const rules = repo.findAll();
      expect(rules).toEqual([]);
    });

    it('returns all rules when no filter is provided', () => {
      const rule1 = repo.create(makeRule({ name: 'Rule 1' }));
      const rule2 = repo.create(makeRule({ name: 'Rule 2' }));

      const rules = repo.findAll();
      expect(rules).toHaveLength(2);
      expect(rules.map(r => r.name)).toEqual(expect.arrayContaining(['Rule 1', 'Rule 2']));
    });

    it('filters by campaignId when provided', () => {
      const campaign1Id = uuid();
      const campaign2Id = uuid();

      repo.create(makeRule({ campaign_id: campaign1Id, name: 'Rule 1' }));
      repo.create(makeRule({ campaign_id: campaign2Id, name: 'Rule 2' }));

      const rules = repo.findAll({ campaignId: campaign1Id });
      expect(rules).toHaveLength(1);
      expect(rules[0].name).toBe('Rule 1');
    });
  });

  describe('create', () => {
    it('inserts a rule and returns id', () => {
      const ruleData = makeRule();
      const id = repo.create(ruleData);
      expect(id).toBeDefined();
      expect(typeof id).toBe('string');

      const rule = repo.findById(id);
      expect(rule).toBeDefined();
      expect(rule.name).toBe('Test Rule');
      expect(rule.campaign_id).toBe(ruleData.campaign_id);
    });

    it('stores boolean is_active correctly', () => {
      const id = repo.create(makeRule({ is_active: false }));
      const rule = repo.findById(id);
      expect(rule.is_active).toBe(0);
    });

    it('defaults check_interval to daily', () => {
      const id = repo.create(makeRule({ check_interval: undefined }));
      const rule = repo.findById(id);
      expect(rule.check_interval).toBe('daily');
    });
  });

  describe('findById', () => {
    it('returns the created rule', () => {
      const ruleData = makeRule({ name: 'Find Test' });
      const id = repo.create(ruleData);

      const rule = repo.findById(id);
      expect(rule).toBeDefined();
      expect(rule.id).toBe(id);
      expect(rule.name).toBe('Find Test');
    });

    it('returns null for non-existent id', () => {
      const rule = repo.findById(uuid());
      expect(rule).toBeNull();
    });
  });

  describe('findActive', () => {
    it('returns only active rules', () => {
      const activeId = repo.create(makeRule({ name: 'Active Rule', is_active: true }));
      const inactiveId = repo.create(makeRule({ name: 'Inactive Rule', is_active: false }));

      const activeRules = repo.findActive();
      expect(activeRules).toHaveLength(1);
      expect(activeRules[0].id).toBe(activeId);
      expect(activeRules[0].name).toBe('Active Rule');
    });

    it('returns empty array when no active rules exist', () => {
      repo.create(makeRule({ is_active: false }));
      repo.create(makeRule({ is_active: false }));

      const activeRules = repo.findActive();
      expect(activeRules).toEqual([]);
    });
  });

  describe('update', () => {
    it('modifies specified fields', () => {
      const id = repo.create(makeRule({ name: 'Original', is_active: true, action_value: null }));

      const updated = repo.update(id, { name: 'Updated', is_active: false, action_value: 100 });
      expect(updated).toBeDefined();
      expect(updated.name).toBe('Updated');
      expect(updated.is_active).toBe(0);
      expect(updated.action_value).toBe(100);
    });

    it('returns null for non-existent id', () => {
      const result = repo.update(uuid(), { name: 'Updated' });
      expect(result).toBeNull();
    });

    it('does not modify when no fields provided', () => {
      const id = repo.create(makeRule({ name: 'Original' }));
      const original = repo.findById(id);

      const updated = repo.update(id, {});
      expect(updated.name).toBe(original.name);
    });

    it('allows updating multiple fields at once', () => {
      const id = repo.create(makeRule({
        name: 'Old',
        condition_metric: 'roas',
        condition_value: 1.5,
        action: 'pause'
      }));

      const updated = repo.update(id, {
        name: 'New',
        condition_metric: 'ctr',
        condition_value: 2.5,
        action: 'increase_bid'
      });

      expect(updated.name).toBe('New');
      expect(updated.condition_metric).toBe('ctr');
      expect(updated.condition_value).toBe(2.5);
      expect(updated.action).toBe('increase_bid');
    });
  });

  describe('markTriggered', () => {
    it('sets last_triggered timestamp', () => {
      const id = repo.create(makeRule());
      const rule = repo.findById(id);
      expect(rule.last_triggered).toBeNull();

      repo.markTriggered(id);
      const updated = repo.findById(id);
      expect(updated.last_triggered).toBeDefined();
      expect(updated.last_triggered).not.toBeNull();
    });
  });

  describe('remove', () => {
    it('deletes a rule and returns true', () => {
      const id = repo.create(makeRule());
      expect(repo.findById(id)).toBeDefined();

      const result = repo.remove(id);
      expect(result).toBe(true);
      expect(repo.findById(id)).toBeNull();
    });

    it('returns false for non-existent id', () => {
      const result = repo.remove(uuid());
      expect(result).toBe(false);
    });
  });
});
