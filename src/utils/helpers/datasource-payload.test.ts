import { describe, it, expect } from '@jest/globals';
import { normalizeCollectorAttribute, normalizeAutoDiscoveryConfig, fillDatapointsFromSaved } from './datasource-payload.js';

describe('normalizeCollectorAttribute', () => {
  it('defaults name from collectMethod and the unused script fields to "" on create', () => {
    expect(normalizeCollectorAttribute({ scriptType: 'embed', groovyScript: 'x' }, 'script', true)).toEqual({
      scriptType: 'embed', groovyScript: 'x', name: 'script',
      linuxCmdline: '', linuxScript: '', windowsCmdline: '', windowsScript: '',
    });
  });

  it('keeps given values, turns null into "" and does not touch other methods', () => {
    expect(normalizeCollectorAttribute({ name: 'batchscript', linuxScript: 'ls', windowsScript: null }, 'batchscript', true))
      .toEqual({ name: 'batchscript', linuxScript: 'ls', windowsScript: '', linuxCmdline: '', windowsCmdline: '' });
    expect(normalizeCollectorAttribute({ oid: '1.3' }, 'snmp', true)).toEqual({ oid: '1.3', name: 'snmp' });
  });

  it('on update only sets the name, so saved scripts are not blanked', () => {
    expect(normalizeCollectorAttribute({ groovyScript: 'y' }, 'script', false)).toEqual({ groovyScript: 'y', name: 'script' });
    expect(normalizeCollectorAttribute({ groovyScript: 'y' }, undefined, false)).toEqual({ groovyScript: 'y' });
  });

  it('accepts a JSON string, passes undefined through and rejects non-objects', () => {
    expect(normalizeCollectorAttribute('{"groovyScript":"y"}', 'script', false)).toEqual({ groovyScript: 'y', name: 'script' });
    expect(normalizeCollectorAttribute(undefined, 'script', true)).toBeUndefined();
    expect(() => normalizeCollectorAttribute([1], 'script', true)).toThrow('collectorAttribute must be an object');
  });
});

describe('normalizeAutoDiscoveryConfig', () => {
  it('turns null instanceAutoGroupMethodParams into "" and completes a script-only method', () => {
    expect(normalizeAutoDiscoveryConfig({ instanceAutoGroupMethodParams: null, method: { groovyScript: 'println 1' } }, true)).toEqual({
      instanceAutoGroupMethodParams: '',
      method: { groovyScript: 'println 1', name: 'ad_script', type: 'embeded' },
      filters: [],
    });
  });

  it('defaults a missing instanceAutoGroupMethodParams on create but not on update', () => {
    expect(normalizeAutoDiscoveryConfig({}, true)).toEqual({ instanceAutoGroupMethodParams: '', filters: [] });
    expect(normalizeAutoDiscoveryConfig({ scheduleInterval: 15 }, false)).toEqual({ scheduleInterval: 15 });
    expect(normalizeAutoDiscoveryConfig({ instanceAutoGroupMethodParams: null }, false)).toEqual({ instanceAutoGroupMethodParams: '' });
  });

  it('keeps explicit values', () => {
    const config = { instanceAutoGroupMethodParams: 'p', filters: [{ attribute: 'a' }], method: { name: 'ad_script', type: 'file', groovyScript: 'x' } };
    expect(normalizeAutoDiscoveryConfig(config, true)).toEqual(config);
  });

  it('validates the shape', () => {
    expect(() => normalizeAutoDiscoveryConfig('nope', true)).toThrow('autoDiscoveryConfig must be an object');
    expect(() => normalizeAutoDiscoveryConfig({ instanceAutoGroupMethodParams: 5 }, true)).toThrow('must be a string');
    expect(() => normalizeAutoDiscoveryConfig({ method: 'x' }, true)).toThrow('autoDiscoveryConfig.method must be an object');
  });
});

describe('fillDatapointsFromSaved', () => {
  const saved = [
    {
      id: 1, dataSourceId: 9, name: 'a', rawDataFieldName: 'output', alertExpr: '> 0', alertBody: 'saved body', originId: 'origin-a',
      statusDisplayNames: [{ id: 7, datapointId: 1, statusDisplayName: 'OK', operator: 'EQ', metricValue: '0' }],
    },
    { id: 2, name: 'b', rawDataFieldName: 'output', originId: '' },
  ];

  it('fills in every field a datapoint with an id leaves out, without dataSourceId or status display name ids', () => {
    expect(fillDatapointsFromSaved([{ id: 1, name: 'a' }], saved)).toEqual([{
      id: 1, name: 'a', rawDataFieldName: 'output', alertExpr: '> 0', alertBody: 'saved body', originId: 'origin-a',
      statusDisplayNames: [{ statusDisplayName: 'OK', operator: 'EQ', metricValue: '0' }],
    }]);
  });

  it('lets what is sent win, including "" and an empty list to clear a field', () => {
    expect(fillDatapointsFromSaved([{ id: 1, name: 'a', alertExpr: '', statusDisplayNames: [], originId: 'mine' }], saved)).toEqual([{
      id: 1, name: 'a', alertExpr: '', statusDisplayNames: [], originId: 'mine', rawDataFieldName: 'output', alertBody: 'saved body',
    }]);
  });

  it('does not copy an empty originId, and leaves new and unknown datapoints and non-objects alone', () => {
    expect(fillDatapointsFromSaved([{ id: 2, name: 'b' }], saved)).toEqual([{ id: 2, name: 'b', rawDataFieldName: 'output' }]);
    const untouched = [{ name: 'new' }, { id: 99, name: 'gone' }, 'x', null];
    expect(fillDatapointsFromSaved(untouched, saved)).toEqual(untouched);
  });
});
