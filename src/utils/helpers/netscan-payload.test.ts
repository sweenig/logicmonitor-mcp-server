import { describe, it, expect } from '@jest/globals';
import {
  buildNetscanCreate,
  buildNetscanUpdate,
  normalizeDuplicate,
  normalizeSchedule,
  updateNeedsMethod,
} from './netscan-payload.js';

describe('normalizeSchedule', () => {
  it('defaults to manual and accepts the bare word manual', () => {
    expect(normalizeSchedule(undefined)).toEqual({ type: 'manual' });
    expect(normalizeSchedule('manual')).toEqual({ type: 'manual' });
  });

  it('requires a cron expression for a timed schedule', () => {
    expect(() => normalizeSchedule({ type: 'daily' })).toThrow(/schedule\.cron is required/);
    expect(normalizeSchedule({ type: 'daily', cron: '00 04 * * *', timezone: 'America/Chicago' }))
      .toEqual({ type: 'daily', cron: '00 04 * * *', timezone: 'America/Chicago' });
  });

  it('rejects unknown types and loose strings, and parses a JSON string', () => {
    expect(() => normalizeSchedule({ type: 'yearly', cron: 'x' })).toThrow(/schedule\.type/);
    expect(() => normalizeSchedule('daily')).toThrow(/schedule must be an object/);
    expect(normalizeSchedule('{"type":"weekly","cron":"00 00 * * 0","notify":"true"}'))
      .toEqual({ type: 'weekly', cron: '00 00 * * 0', notify: true });
  });
});

describe('normalizeDuplicate', () => {
  it('returns nothing when not given, and accepts the type shortcut', () => {
    expect(normalizeDuplicate({})).toBeUndefined();
    expect(normalizeDuplicate({ excludeDuplicateType: '2' })).toEqual({ type: 2 });
    expect(normalizeDuplicate({ duplicate: { type: 4, collectors: '["c1"]' } })).toEqual({ type: 4, collectors: ['c1'] });
  });

  it('rejects an invalid type', () => {
    expect(() => normalizeDuplicate({ duplicate: { type: 9 } })).toThrow(/duplicate\.type/);
  });
});

describe('buildNetscanCreate', () => {
  const nmap = { name: 'n', method: 'nmap', collectorId: 12, subnet: '10.0.1.0/24' };

  it('builds an nmap scan with the defaults LogicMonitor requires', () => {
    expect(buildNetscanCreate(nmap)).toEqual({
      name: 'n', method: 'nmap', collector: 12, subnet: '10.0.1.0/24',
      schedule: { type: 'manual' }, duplicate: { type: 1 }, ports: { isGlobalDefault: true, value: '' },
    });
  });

  it('turns a ports string into a custom port list and defaultGroup into a rule', () => {
    const body = buildNetscanCreate({ ...nmap, ports: '22,443', defaultGroup: 345, exclude: '10.0.1.1', includeNetworkAndBroadcast: 'true' });
    expect(body.ports).toEqual({ isGlobalDefault: false, value: '22,443' });
    expect(body.exclude).toBe('10.0.1.1');
    expect(body.includeNetworkAndBroadcast).toBe(true);
    expect(body.ddr).toEqual({ assignment: [{ group: 345, action: 'Include', disableAlerting: false, type: 1, query: '' }] });
  });

  it('keeps explicit ddr rules and gives each the type and query LogicMonitor expects', () => {
    const body = buildNetscanCreate({ ...nmap, ddr: { changeName: '##REVERSEDNS##', assignment: [{ group: 7, action: 'Exclude' }] } });
    expect(body.ddr).toEqual({ changeName: '##REVERSEDNS##', assignment: [{ type: 1, query: '', group: 7, action: 'Exclude' }] });
  });

  it('builds embedded and external script scans', () => {
    const embedded = buildNetscanCreate({ name: 's', method: 'script', collectorId: 1, groovyScript: 'return 0', defaultGroup: 4 });
    expect(embedded).toMatchObject({ method: 'script', collector: 1, scriptType: 'embeded', groovyScript: 'return 0', defaultGroup: 4 });
    expect(embedded.subnet).toBeUndefined();

    const external = buildNetscanCreate({ name: 's', method: 'script', collectorId: 1, scriptType: 'external', scriptPath: 'x.csv' });
    expect(external).toMatchObject({ scriptType: 'external', scriptPath: 'x.csv' });

    expect(buildNetscanCreate({ name: 's', method: 'script', collectorId: 1, scriptType: 'embedded', groovyScript: 'x' }).scriptType).toBe('embeded');
  });

  it('builds an enhancedScript scan with credentials, filters and an update policy', () => {
    const body = buildNetscanCreate({
      name: 'e', method: 'enhancedScript', collectorId: 1, groovyScript: 'x',
      credentials: { deviceGroupId: 5 }, filters: '[{"attribute":"name","operation":"Contain","value":"x"}]',
      resourceUpdateCriteria: { type: 5 },
    });
    expect(body.credentials).toEqual({ deviceGroupId: 5 });
    expect(body.filters).toHaveLength(1);
    expect(body.resourceUpdateCriteria).toEqual({ type: 5 });
  });

  it('rejects missing and mismatched settings with a clear message', () => {
    expect(() => buildNetscanCreate({ method: 'nmap', collectorId: 1, subnet: 's' })).toThrow(/name is required/);
    expect(() => buildNetscanCreate({ name: 'n', method: 'ec2', collectorId: 1 })).toThrow(/method must be one of nmap, script, enhancedScript/);
    expect(() => buildNetscanCreate({ name: 'n', method: 'nmap', subnet: 's' })).toThrow(/collectorId is required/);
    expect(() => buildNetscanCreate({ name: 'n', method: 'nmap', collectorId: 1 })).toThrow(/subnet is required/);
    expect(() => buildNetscanCreate({ ...nmap, groovyScript: 'x' })).toThrow(/groovyScript does not apply to a nmap scan/);
    expect(() => buildNetscanCreate({ name: 'n', method: 'script', collectorId: 1, subnet: 's', groovyScript: 'x' })).toThrow(/subnet does not apply to a script scan/);
    expect(() => buildNetscanCreate({ name: 'n', method: 'script', collectorId: 1, filters: [], groovyScript: 'x' })).toThrow(/filters does not apply to a script scan/);
    expect(() => buildNetscanCreate({ name: 'n', method: 'script', collectorId: 1 })).toThrow(/groovyScript/);
    expect(() => buildNetscanCreate({ name: 'n', method: 'script', collectorId: 1, scriptType: 'external' })).toThrow(/scriptPath/);
    expect(() => buildNetscanCreate({ name: 'n', method: 'script', collectorId: 1, scriptType: 'file' })).toThrow(/scriptType/);
  });

  it('accepts the legacy excludeDuplicateType and an nsgId', () => {
    const body = buildNetscanCreate({ ...nmap, excludeDuplicateType: 2, nsgId: '11' });
    expect(body.duplicate).toEqual({ type: 2 });
    expect(body.nsgId).toBe(11);
  });
});

describe('buildNetscanUpdate', () => {
  it('sends only what was given and never the method', () => {
    expect(buildNetscanUpdate({ netscanId: 1, name: 'x', schedule: { type: 'manual' } })).toEqual({ name: 'x', schedule: { type: 'manual' } });
    expect(() => buildNetscanUpdate({ netscanId: 1, method: 'nmap' })).toThrow(/method cannot be changed/);
  });

  it('knows when it needs the scan method and applies method-specific settings', () => {
    expect(updateNeedsMethod({ name: 'x', schedule: {} })).toBe(false);
    expect(updateNeedsMethod({ subnet: 's' })).toBe(true);
    expect(updateNeedsMethod({ defaultGroup: 3 })).toBe(true);

    expect(buildNetscanUpdate({ subnet: '10.0.2.0/24', ports: '22', defaultGroup: 9 }, 'nmap')).toEqual({
      subnet: '10.0.2.0/24',
      ports: { isGlobalDefault: false, value: '22' },
      ddr: { assignment: [{ group: 9, action: 'Include', disableAlerting: false, type: 1, query: '' }] },
    });
    expect(buildNetscanUpdate({ groovyScript: 'x', defaultGroup: '9' }, 'script')).toEqual({ groovyScript: 'x', defaultGroup: 9 });
    expect(() => buildNetscanUpdate({ subnet: 's' }, 'script')).toThrow(/subnet does not apply to a script scan/);
    expect(() => buildNetscanUpdate({ groovyScript: 'x' }, 'nmap')).toThrow(/groovyScript does not apply to a nmap scan/);
  });
});
