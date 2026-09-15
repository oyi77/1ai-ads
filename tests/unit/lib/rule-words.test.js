import { describe, it, expect } from 'vitest';

// Bahasa rule: tidak ada lagi "gt", "spend > 10", atau baris "→ pause"
// tanpa sebab. Plus ringkas native FB rules (read-only).

import {
  metricLabel, operatorWord, formatRuleValue, actionWord,
  describeRuleCondition, ruleAutoName, describeFbRule,
} from '../../../server/lib/rule-words.js';

describe('rule-words — kalimat Bahasa Indonesia', () => {
  it('label metrik: spend → Belanja', () => {
    expect(metricLabel('spend')).toBe('Belanja');
    expect(metricLabel('ctr')).toBe('CTR');
    expect(metricLabel('roas')).toBe('ROAS');
    expect(metricLabel('cpc')).toBe('CPC');
  });

  it('kata operator: gt → lebih dari (dua ejaan)', () => {
    expect(operatorWord('gt')).toBe('lebih dari');
    expect(operatorWord('>')).toBe('lebih dari');
    expect(operatorWord('lt')).toBe('kurang dari');
    expect(operatorWord('gte')).toBe('minimal');
    expect(operatorWord('lte')).toBe('maksimal');
  });

  it('format value: currency → Rp, % → %, x → x', () => {
    expect(formatRuleValue('spend', 10000)).toBe('Rp 10.000');
    expect(formatRuleValue('cpc', 200)).toBe('Rp 200');
    expect(formatRuleValue('ctr', 5)).toBe('5%');
    expect(formatRuleValue('roas', 2)).toBe('2x');
  });

  it('kata aksi: pause → dimatiin', () => {
    expect(actionWord('pause')).toBe('dimatiin');
    expect(actionWord('resume')).toBe('dinyalain');
    expect(actionWord('notify')).toBe('kasih kabar');
    expect(actionWord('scale_budget')).toBe('budget diubah');
  });

  it('kondisi leaf: "Belanja lebih dari Rp 10.000"', () => {
    expect(describeRuleCondition({ type: 'leaf', metric: 'spend', operator: '>', value: 10000 }))
      .toBe('Belanja lebih dari Rp 10.000');
  });

  it('kondisi leaf kode gt: sama hasilnya', () => {
    expect(describeRuleCondition({ type: 'leaf', metric: 'spend', operator: 'gt', value: 10000 }))
      .toBe('Belanja lebih dari Rp 10.000');
  });

  it('kondisi group: gabung "dan"', () => {
    expect(describeRuleCondition({
      type: 'group', logic: 'and',
      children: [
        { type: 'leaf', metric: 'roas', operator: '<', value: 1 },
        { type: 'leaf', metric: 'spend', operator: '>', value: 100000 },
      ],
    })).toBe('ROAS kurang dari 1x dan Belanja lebih dari Rp 100.000');
  });

  it('kondisi kosong/group kosong: "kondisi khusus", bukan string kosong', () => {
    expect(describeRuleCondition(null)).toBe('kondisi khusus');
    expect(describeRuleCondition({})).toBe('kondisi khusus');
    expect(describeRuleCondition({ type: 'group', logic: 'and', children: [] })).toBe('kondisi khusus');
    expect(describeRuleCondition({ type: 'weird' })).toBe('kondisi khusus');
  });

  it('nama otomatis: "Belanja lebih dari Rp 10.000"', () => {
    expect(ruleAutoName('spend', 'gt', 10000)).toBe('Belanja lebih dari Rp 10.000');
    expect(ruleAutoName('cpc', '>', 100)).toBe('CPC lebih dari Rp 100');
  });
});

describe('describeFbRule — native Facebook rules', () => {
  it('ringkas filter + eksekusi PAUSE', () => {
    const s = describeFbRule({
      name: 'My FB Rule',
      status: 'ACTIVE',
      evaluationSpec: { filters: [{ field: 'spend', operator: 'GREATER_THAN', value: 100000 }] },
      executionSpec: { execution_type: 'PAUSE' },
    });
    expect(s.text).toBe('Belanja lebih dari Rp 100.000 → dimatiin');
    expect(s.active).toBe(true);
  });

  it('status nonaktif terdeteksi', () => {
    const s = describeFbRule({
      status: 'DISABLED',
      evaluationSpec: { filters: [{ field: 'roas', operator: 'LESS_THAN', value: 1 }] },
      executionSpec: { execution_type: 'NOTIFICATION' },
    });
    expect(s.text).toBe('ROAS kurang dari 1x → kasih kabar');
    expect(s.active).toBe(false);
  });

  it('field tak dikenal: tampil mentah, tidak kosong', () => {
    const s = describeFbRule({
      status: 'ACTIVE',
      evaluationSpec: { filters: [{ field: 'mystery_metric', operator: 'WEIRD_OP', value: 5 }] },
      executionSpec: {},
    });
    expect(s.text.length).toBeGreaterThan(0);
    expect(s.text).toContain('mystery_metric');
  });

  it('tanpa filter: "kondisi khusus"', () => {
    const s = describeFbRule({ status: 'ACTIVE', evaluationSpec: {}, executionSpec: { execution_type: 'PAUSE' } });
    expect(s.text).toBe('kondisi khusus → dimatiin');
  });
});
