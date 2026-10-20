import { describe, it, expect } from '@jest/globals';
import { compactWriteResult, isConciseResultTool, COMPACT_THRESHOLD_CHARS } from './write-result.js';

function largeDataSource() {
  return {
    id: 74539,
    name: 'Example_DS',
    displayName: 'Example DS',
    description: 'Example',
    appliesTo: 'lmaccount && lmaccess.bearer.key',
    version: 1792525482,
    checksum: 'abc123',
    hasMultiInstances: true,
    collectInterval: 300,
    technology: 'x'.repeat(1000),
    accessGroupIds: [1],
    installationMetadata: null,
    accessGroups: [{ id: 1, name: 'Default Access Group', createdOn: 1774289775000, description: 'A default access group', tenantId: null }],
    collectorAttribute: { name: 'batchscript', groovyScript: 'println "x"\n'.repeat(1000) },
    dataPoints: Array.from({ length: 8 }, (_, i) => ({ id: i, name: `dp${i}`, description: 'd'.repeat(100), alertBody: 'b'.repeat(200) })),
  };
}

describe('isConciseResultTool', () => {
  it('matches create_ and update_ tools only', () => {
    expect(isConciseResultTool('create_datasource')).toBe(true);
    expect(isConciseResultTool('update_resource')).toBe(true);
    expect(isConciseResultTool('delete_datasource')).toBe(false);
    expect(isConciseResultTool('get_datasource')).toBe(false);
    expect(isConciseResultTool('list_resources')).toBe(false);
    expect(isConciseResultTool('execute_groovy_script')).toBe(false);
    expect(isConciseResultTool('schedule_resource_discovery')).toBe(false);
  });
});

describe('compactWriteResult', () => {
  it('keeps scalar fields, small nested values and the identifying fields of a large result', () => {
    const compact: any = compactWriteResult(largeDataSource());

    expect(compact).toMatchObject({
      id: 74539,
      name: 'Example_DS',
      appliesTo: 'lmaccount && lmaccess.bearer.key',
      version: 1792525482,
      checksum: 'abc123',
      hasMultiInstances: true,
      collectInterval: 300,
      accessGroupIds: [1],
      installationMetadata: null,
    });
  });

  it('lists large nested parts under omitted with their size', () => {
    const compact: any = compactWriteResult(largeDataSource());

    // Small nested values (the one access group) stay; large ones move to omitted.
    expect(compact.accessGroups).toHaveLength(1);
    expect(compact.collectorAttribute).toBeUndefined();
    expect(compact.dataPoints).toBeUndefined();
    expect(compact.omitted).toEqual({
      collectorAttribute: expect.stringContaining('object with 2 fields'),
      dataPoints: 'array of 8',
    });
  });

  it('cuts long strings and says how long they were', () => {
    const compact: any = compactWriteResult(largeDataSource());

    expect(compact.technology.length).toBeLessThan(400);
    expect(compact.technology).toContain('(1000 chars)');
  });

  it('adds a note that mentions returnFull and the original size', () => {
    const original = largeDataSource();
    const compact: any = compactWriteResult(original);

    expect(compact.note).toContain('returnFull: true');
    expect(compact.note).toContain(String(JSON.stringify(original).length));
  });

  it('is far smaller than the original', () => {
    const original = largeDataSource();
    expect(JSON.stringify(compactWriteResult(original)).length).toBeLessThan(JSON.stringify(original).length / 4);
  });

  it('does not modify its input', () => {
    const original = largeDataSource();
    const snapshot = JSON.parse(JSON.stringify(original));
    compactWriteResult(original);
    expect(original).toEqual(snapshot);
  });

  it('returns small results unchanged', () => {
    const small = { id: 1, name: 'x', customProperties: [{ name: 'a', value: 'b' }] };
    expect(compactWriteResult(small)).toBe(small);
    expect(JSON.stringify(small).length).toBeLessThan(COMPACT_THRESHOLD_CHARS);
  });

  it('returns a batch result unchanged, so per-item failures stay visible', () => {
    const batch = {
      success: false,
      summary: { total: 40, succeeded: 39, failed: 1 },
      devices: Array.from({ length: 40 }, (_, i) => ({ index: i, success: i !== 7, device: { id: i, displayName: 'd'.repeat(80) } })),
    };
    expect(JSON.stringify(batch).length).toBeGreaterThan(COMPACT_THRESHOLD_CHARS);
    expect(compactWriteResult(batch)).toBe(batch);
  });

  it('returns arrays, strings and null unchanged', () => {
    const list = Array.from({ length: 100 }, (_, i) => ({ id: i, text: 'x'.repeat(50) }));
    expect(compactWriteResult(list)).toBe(list);
    expect(compactWriteResult('text')).toBe('text');
    expect(compactWriteResult(null)).toBeNull();
  });

  it('returns a large result unchanged when there is nothing to omit or cut', () => {
    const wide: Record<string, number> = {};
    for (let i = 0; i < 400; i++) wide[`field${i}`] = i;
    expect(JSON.stringify(wide).length).toBeGreaterThan(COMPACT_THRESHOLD_CHARS);
    expect(compactWriteResult(wide)).toBe(wide);
  });
});
