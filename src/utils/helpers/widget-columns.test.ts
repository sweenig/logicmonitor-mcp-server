import { describe, it, expect } from '@jest/globals';
import { applyColumnChanges, customColumnKey } from './widget-columns.js';

const base = () => [
  { columnKey: 'alert-severity', visible: false, columnLabel: 'Severity' },
  { columnKey: 'alert-began', visible: true, columnLabel: 'Reported At' },
  { columnKey: 'alert-value', visible: true, columnLabel: 'Alert Value' },
  { columnKey: 'alert-static-threshold', visible: true, columnLabel: 'Static Threshold' },
  { columnKey: 'alert-notes', visible: false, columnLabel: 'Notes' },
];

describe('customColumnKey', () => {
  it('encodes # as _23 and the first dot as _, as the LogicMonitor UI does', () => {
    expect(customColumnKey('##ALERTVALUEDISPLAYSTATUSNAME##')).toBe('_23_23ALERTVALUEDISPLAYSTATUSNAME_23_23');
    expect(customColumnKey('##auto.collectorgroupname##')).toBe('_23_23auto_collectorgroupname_23_23');
    expect(customColumnKey('auto.collector.id')).toBe('auto_collector.id');
  });
});

describe('applyColumnChanges', () => {
  it('hides, resizes and relabels an existing column without touching the input', () => {
    const input = base();
    const result = applyColumnChanges(input, [
      { columnKey: 'alert-static-threshold', visible: false },
      { columnKey: 'alert-value', columnSize: 99, columnLabel: 'Value' },
    ]);
    expect(result.find(c => c.columnKey === 'alert-static-threshold')?.visible).toBe(false);
    expect(result.find(c => c.columnKey === 'alert-value')).toMatchObject({ columnSize: 99, columnLabel: 'Value' });
    expect(input).toEqual(base());
  });

  it('adds a custom column after the last visible one, keeping order', () => {
    const result = applyColumnChanges(base(), [{ token: '##auto.sdt.admin##', columnSize: 200 }]);
    expect(result.map(c => c.columnKey)).toEqual([
      'alert-severity', 'alert-began', 'alert-value', 'alert-static-threshold',
      '_23_23auto_sdt.admin_23_23', 'alert-notes',
    ]);
    expect(result[4]).toMatchObject({
      isDynamic: true, visible: true, componentName: 'AlertList', columnLabel: '##auto.sdt.admin##', columnSize: 200,
      dataPath: ['customColumns', '##auto.sdt.admin##'],
    });
  });

  it('places a new column after a named one, and a second one after the first', () => {
    const result = applyColumnChanges(base(), [
      { token: 'a.b', after: 'alert-began' },
      { token: 'c.d' },
    ]);
    expect(result.map(c => c.columnKey).slice(0, 5)).toEqual(['alert-severity', 'alert-began', 'a_b', 'alert-value', 'alert-static-threshold']);
    expect(result.map(c => c.columnKey)).toContain('c_d');
    expect(result.map(c => c.columnKey).indexOf('c_d')).toBe(result.map(c => c.columnKey).indexOf('alert-static-threshold') + 1);
  });

  it('changes an existing custom column instead of adding a duplicate', () => {
    const once = applyColumnChanges(base(), [{ token: '##x##' }]);
    const twice = applyColumnChanges(once, [{ token: '##x##', visible: 'false' as any }]);
    expect(twice).toHaveLength(once.length);
    expect(twice.find(c => c.columnKey === '_23_23x_23_23')?.visible).toBe(false);
  });

  it('refuses to rename a custom column, since LogicMonitor resolves the value from the label', () => {
    expect(() => applyColumnChanges(base(), [{ token: '##auto.sdt.admin##', columnLabel: 'Admin' }])).toThrow(/label of a custom column/);
    const once = applyColumnChanges(base(), [{ token: '##x##' }]);
    expect(() => applyColumnChanges(once, [{ columnKey: '_23_23x_23_23', columnLabel: 'X' }])).toThrow(/would leave the column blank/);
    // restating the same label, or relabeling a standard column, is fine
    expect(() => applyColumnChanges(once, [{ token: '##x##', columnLabel: '##x##' }])).not.toThrow();
    expect(applyColumnChanges(once, [{ columnKey: 'alert-value', columnLabel: 'Value' }]).find(c => c.columnKey === 'alert-value')?.columnLabel).toBe('Value');
  });

  it('rejects an unknown columnKey (listing the real ones), a missing key and an unknown "after"', () => {
    expect(() => applyColumnChanges(base(), [{ columnKey: 'nope', visible: false }])).toThrow(/no column with columnKey "nope".*alert-began/);
    expect(() => applyColumnChanges(base(), [{ visible: false }])).toThrow(/columnKey .* or a token/);
    expect(() => applyColumnChanges(base(), [{ columnKey: 'alert-notes', after: 'nope' }])).toThrow(/"after" column "nope" not found/);
  });
});
