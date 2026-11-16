import { describe, it, expect } from '@jest/globals';
import { applyColumnChanges, applyTableColumnChanges, customColumnKey, defaultAlertColumns } from './widget-columns.js';

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

describe('defaultAlertColumns', () => {
  it('has the standard keys with the useful ones visible', () => {
    const columns = defaultAlertColumns();
    const visible = columns.filter(c => c.visible).map(c => c.columnKey);
    expect(visible).toEqual(['alert-severity', 'alert-began', 'alert-device', 'alert-datasource-instance', 'alert-datapoint', 'alert-value']);
    expect(columns.map(c => c.columnKey)).toContain('alert-static-threshold');
    expect(new Set(columns.map(c => c.columnKey)).size).toBe(columns.length);
  });

  it('can be adjusted with applyColumnChanges', () => {
    const columns = applyColumnChanges(defaultAlertColumns(), [{ columnKey: 'alert-datapoint', visible: false }, { token: '##auto.lm.token.owner##' }]);
    expect(columns.find(c => c.columnKey === 'alert-datapoint').visible).toBe(false);
    expect(columns.find(c => c.isDynamic).columnLabel).toBe('##auto.lm.token.owner##');
  });
});

describe('applyTableColumnChanges', () => {
  const widget = () => ({
    columns: [
      { columnName: 'Status', dataPointId: 1, dataPointName: 'status', displayType: 'colorBar', colorThresholds: [], minValue: -1, maxValue: 0 },
      { columnName: 'Days', dataPointId: 2, dataPointName: 'days', displayType: 'raw', colorThresholds: [] },
    ],
    displaySettings: {
      pageSize: '50',
      columns: [
        { visible: true, columnLabel: 'Name', columnSize: 150, columnKey: 'name' },
        { visible: true, columnLabel: 'Status', columnSize: 0, columnKey: 'Status' },
        { visible: true, columnLabel: 'Days', columnSize: 47, columnKey: 'Days' },
      ],
      instanceColumns: [],
      columnsV4: [
        { index: 0, position: 0, id: 'Status_0', columnName: 'Status', dataPointName: 'status', displayType: 'colorBar', colorThresholds: [] },
        { index: 1, position: 1, id: 'Days_1', columnName: 'Days', dataPointName: 'days', displayType: 'raw', colorThresholds: [] },
      ],
    },
  });

  it('adds an instance property column after the datapoint columns, in step with the column list', () => {
    const input = widget();
    const { displaySettings } = applyTableColumnChanges(input, [{ instanceProperty: 'auto.lm.token.owner', columnName: 'Owner' }, { instanceProperty: '##auto.lm.token.note##' }]);
    expect(displaySettings.instanceColumns).toEqual([
      { 'auto.lm.token.owner': { index: 2, columnName: 'Owner' } },
      { 'auto.lm.token.note': { index: 3, columnName: 'auto.lm.token.note' } },
    ]);
    expect(displaySettings.columns.map((c: any) => c.columnLabel)).toEqual(['Name', 'Status', 'Days', 'Owner', 'auto.lm.token.note']);
    expect(displaySettings.pageSize).toBe('50');
    expect(input.displaySettings.instanceColumns).toEqual([]); // input untouched
  });

  it('removes a property column and renames or resizes one', () => {
    const first = applyTableColumnChanges(widget(), [{ instanceProperty: 'a.b' }, { instanceProperty: 'c.d' }]);
    const second = applyTableColumnChanges({ ...widget(), displaySettings: first.displaySettings }, [{ instanceProperty: 'a.b', remove: true }, { instanceProperty: 'c.d', columnName: 'D', columnSize: 99 }]);
    expect(second.displaySettings.instanceColumns).toEqual([{ 'c.d': { index: 2, columnName: 'D' } }]);
    expect(second.displaySettings.columns.map((c: any) => [c.columnLabel, c.columnSize])).toContainEqual(['D', 99]);
    expect(second.displaySettings.columns.map((c: any) => c.columnLabel)).not.toContain('a.b');
    expect(() => applyTableColumnChanges(widget(), [{ instanceProperty: 'nope', remove: true }])).toThrow(/no instance property column/);
  });

  it('sets thresholds on a datapoint column in columns and columnsV4 only', () => {
    const colorThresholds = [{ relation: '>', threshold: 30, level: 2 }, { relation: '>', threshold: 60, level: 3 }, { relation: '>', threshold: 90, level: 4 }];
    const result = applyTableColumnChanges(widget(), [{ columnName: 'Days', colorThresholds, displayType: 'colorBar', minValue: -2, maxValue: -1 }]);
    expect(result.columns[1]).toMatchObject({ displayType: 'colorBar', colorThresholds, minValue: -2, maxValue: -1, dataPointId: 2 });
    expect(result.displaySettings.columnsV4[1]).toMatchObject({ colorThresholds, minValue: -2, maxValue: -1, index: 1 });
    expect(result.columns[0].colorThresholds).toEqual([]);
  });

  it('adds a datapoint column and shifts property indexes; removes one and shifts them back', () => {
    const withProp = applyTableColumnChanges(widget(), [{ instanceProperty: 'p.q' }]);
    const added = applyTableColumnChanges({ columns: withProp.columns, displaySettings: withProp.displaySettings }, [{ columnName: 'New', dataPointName: 'n', dataPointId: 9 }]);
    expect(added.columns.map(c => c.columnName)).toEqual(['Status', 'Days', 'New']);
    expect(added.columns[2]).toMatchObject({ dataPointId: 9, dataPointName: 'n', displayType: 'raw' });
    expect(added.displaySettings.columnsV4.map((c: any) => c.index)).toEqual([0, 1, 2]);
    expect(added.displaySettings.instanceColumns[0]['p.q'].index).toBe(3);
    expect(added.displaySettings.columns.map((c: any) => c.columnLabel)).toEqual(['Name', 'Status', 'Days', 'New', 'p.q']);
    const removed = applyTableColumnChanges({ columns: added.columns, displaySettings: added.displaySettings }, [{ columnName: 'Status', remove: true }]);
    expect(removed.columns.map(c => c.columnName)).toEqual(['Days', 'New']);
    expect(removed.displaySettings.columnsV4.map((c: any) => [c.columnName, c.index])).toEqual([['Days', 0], ['New', 1]]);
    expect(removed.displaySettings.instanceColumns[0]['p.q'].index).toBe(2);
  });

  it('refuses unknown datapoint columns without ids, an 11th column and empty changes', () => {
    expect(() => applyTableColumnChanges(widget(), [{ columnName: 'Ghost', rpn: 'x' }])).toThrow(/dataPointName and dataPointId/);
    expect(() => applyTableColumnChanges(widget(), [{ columnName: 'Ghost', remove: true }])).toThrow(/no datapoint column/);
    expect(() => applyTableColumnChanges(widget(), [{}])).toThrow(/instanceProperty/);
    let w: any = widget();
    for (let i = 0; i < 8; i++) w = { ...w, ...applyTableColumnChanges(w, [{ columnName: `c${i}`, dataPointName: `d${i}`, dataPointId: 10 + i }]) };
    expect(w.columns.length).toBe(10);
    expect(() => applyTableColumnChanges(w, [{ columnName: 'eleven', dataPointName: 'e', dataPointId: 99 }])).toThrow(/10 datapoint columns/);
  });
});
