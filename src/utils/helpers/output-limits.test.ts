import { describe, it, expect } from '@jest/globals';
import { planNestedFields, projectPaths, projectResult, capRows, capRowsToSize, capText, compactRoles } from './output-limits.js';

describe('planNestedFields', () => {
  it('passes plain lists and "*" through', () => {
    expect(planNestedFields('id,name')).toEqual({ apiFields: 'id,name' });
    expect(planNestedFields('*')).toEqual({ apiFields: '*' });
    expect(planNestedFields(undefined)).toEqual({ apiFields: undefined });
  });
  it('requests the top-level fields of dot paths once and keeps the paths', () => {
    expect(planNestedFields('id,dataPoints.id,dataPoints.name')).toEqual({
      apiFields: 'id,dataPoints',
      paths: ['id', 'dataPoints.id', 'dataPoints.name'],
    });
  });
});

describe('projectPaths', () => {
  const ds = { id: 1, name: 'x', dataPoints: [{ id: 5, name: 'a', alertExpr: '> 1' }, { id: 6, name: 'b', alertExpr: '' }], other: 1 };
  it('keeps the named keys of each array item', () => {
    expect(projectPaths(ds, ['id', 'dataPoints.id', 'dataPoints.name'])).toEqual({
      id: 1,
      dataPoints: [{ id: 5, name: 'a' }, { id: 6, name: 'b' }],
    });
  });
  it('keeps a whole subtree when the path ends at it, and skips missing paths', () => {
    expect(projectPaths(ds, ['dataPoints', 'nope.deeper'])).toEqual({ dataPoints: ds.dataPoints });
  });
  it('projects the items of a list response', () => {
    const list = { total: 1, items: [ds] };
    expect(projectResult(list, ['dataPoints.name'])).toEqual({ total: 1, items: [{ dataPoints: [{ name: 'a' }, { name: 'b' }] }] });
    expect(projectResult(list, undefined)).toBe(list);
  });
});

describe('capRows', () => {
  it('leaves data within the limit untouched', () => {
    const data = { data: { rows: [1, 2, 3] } };
    expect(capRows(data, 5)).toEqual({ value: data });
  });
  it('cuts the largest array and reports its path and total', () => {
    const data = { data: { columns: ['a', 'b'], rows: [1, 2, 3, 4] } };
    const capped = capRows(data, 2);
    expect(capped.value).toEqual({ data: { columns: ['a', 'b'], rows: [1, 2] } });
    expect(capped.truncated).toEqual({ path: 'data.rows', total: 4, returned: 2 });
    expect(data.data.rows).toHaveLength(4);
  });
});

describe('capRowsToSize', () => {
  const rows = Array.from({ length: 200 }, (_, i) => ({ i, pad: 'x'.repeat(100) }));
  it('leaves small data untouched', () => {
    const data = { rows: rows.slice(0, 2) };
    expect(capRowsToSize(data, 10000)).toEqual({ value: data });
  });
  it('keeps the most rows that fit and reports the total', () => {
    const capped = capRowsToSize({ rows }, 5000);
    expect(JSON.stringify(capped.value, null, 2).length).toBeLessThanOrEqual(5000);
    expect(capped.truncated?.total).toBe(200);
    expect(capped.truncated!.returned).toBeGreaterThan(10);
    expect(capped.value.rows).toHaveLength(capped.truncated!.returned);
  });
  it('keeps at least one row even when one row is over the limit', () => {
    expect(capRowsToSize({ rows }, 10).truncated?.returned).toBe(1);
  });
});

describe('capText and compactRoles', () => {
  it('cuts text and counts what was omitted', () => {
    expect(capText('abcdef', 4)).toEqual({ text: 'abcd', omitted: 2 });
    expect(capText('abc', 4)).toEqual({ text: 'abc', omitted: 0 });
  });
  it('reduces role objects to id and name', () => {
    expect(compactRoles([{ id: 1, name: 'admin', privileges: [1, 2, 3] }])).toEqual([{ id: 1, name: 'admin' }]);
    expect(compactRoles(undefined)).toBeUndefined();
  });
});
