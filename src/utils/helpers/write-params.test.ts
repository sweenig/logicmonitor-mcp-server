import { describe, it, expect } from '@jest/globals';
import { alertRuleMatch, opsNoteScopes, opsNoteTags } from './write-params.js';

describe('alertRuleMatch', () => {
  it('returns nothing when no matching condition is given, so an update changes nothing else', () => {
    expect(alertRuleMatch({ ruleId: 1, name: 'x', priority: 3 })).toEqual({});
  });

  it('maps the matching conditions to API fields', () => {
    expect(alertRuleMatch({
      devices: ['web*'],
      deviceGroups: ['Production*', 'Staging*'],
      datasource: 'CPU*',
      datapoint: 'CPUBusyPercent',
      severity: 'critical',
    })).toEqual({
      devices: ['web*'],
      deviceGroups: ['Production*', 'Staging*'],
      datasource: 'CPU*',
      datapoint: 'CPUBusyPercent',
      levelStr: 'Critical',
    });
  });

  it('accepts a comma-separated string for deviceGroups and the older datasources array', () => {
    expect(alertRuleMatch({ deviceGroups: 'Production*, Staging*' }).deviceGroups).toEqual(['Production*', 'Staging*']);
    expect(alertRuleMatch({ datasources: ['CPU', 'Memory'] }).datasource).toBe('CPU,Memory');
    expect(alertRuleMatch({ datasource: 'Disk', datasources: ['CPU'] }).datasource).toBe('Disk');
  });

  it('accepts arrays that a client sent as JSON strings', () => {
    expect(alertRuleMatch({ deviceGroups: '["Production*", "Staging*"]' }).deviceGroups).toEqual(['Production*', 'Staging*']);
    expect(alertRuleMatch({ devices: '["web*"]' }).devices).toEqual(['web*']);
  });

  it('maps every severity and rejects unknown ones with the allowed values', () => {
    expect(alertRuleMatch({ severity: 'ALL' }).levelStr).toBe('All');
    expect(alertRuleMatch({ severity: 'warn' }).levelStr).toBe('Warn');
    expect(alertRuleMatch({ severity: 'warning' }).levelStr).toBe('Warn');
    expect(alertRuleMatch({ severity: 'error' }).levelStr).toBe('Error');
    expect(() => alertRuleMatch({ severity: 'urgent' })).toThrow(/severity must be one of: all, warn, warning, error, critical/);
  });
});

describe('opsNoteTags', () => {
  it('wraps plain strings in {name} objects and keeps objects', () => {
    expect(opsNoteTags(['deploy', { name: 'web' }])).toEqual([{ name: 'deploy' }, { name: 'web' }]);
    expect(opsNoteTags('["a"]')).toEqual([{ name: 'a' }]);
    expect(opsNoteTags(undefined)).toBeUndefined();
  });
});

describe('opsNoteScopes', () => {
  it('returns undefined when no scope was given, so an update leaves scopes alone', () => {
    expect(opsNoteScopes({ note: 'x' })).toBeUndefined();
  });

  it('builds one scope per id and keeps explicit scopes', () => {
    expect(opsNoteScopes({ deviceId: 5 })).toEqual([{ type: 'device', deviceId: 5 }]);
    expect(opsNoteScopes({ deviceGroupId: 7 })).toEqual([{ type: 'deviceGroup', groupId: 7 }]);
    expect(opsNoteScopes({ websiteId: 9 })).toEqual([{ type: 'website', websiteId: 9 }]);
    expect(opsNoteScopes({ scopes: [{ type: 'device', deviceId: 1 }], deviceId: 2 })).toEqual([
      { type: 'device', deviceId: 1 },
      { type: 'device', deviceId: 2 },
    ]);
    expect(opsNoteScopes({ scopes: [] })).toEqual([]);
  });

  it('accepts scopes sent as a JSON string', () => {
    expect(opsNoteScopes({ scopes: '[{"type":"device","deviceId":1}]' })).toEqual([{ type: 'device', deviceId: 1 }]);
  });

  it('does not modify the scopes array it was given', () => {
    const scopes = [{ type: 'device', deviceId: 1 }];
    opsNoteScopes({ scopes, deviceId: 2 });
    expect(scopes).toHaveLength(1);
  });
});
