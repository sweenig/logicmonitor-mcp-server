import { describe, it, expect } from '@jest/globals';
import { normalizeCollectorAttribute, normalizeAutoDiscoveryConfig } from './datasource-payload.js';

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
