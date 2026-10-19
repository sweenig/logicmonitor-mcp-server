import { describe, it, expect } from '@jest/globals';
import { findMissingRequired } from './validate-args.js';

describe('findMissingRequired', () => {
  const tool = { name: 't', inputSchema: { required: ['id', 'name'] } };

  it('returns nothing when there is no schema or no required list', () => {
    expect(findMissingRequired(undefined, {})).toEqual([]);
    expect(findMissingRequired({ name: 't' }, {})).toEqual([]);
  });

  it('reports missing, null, NaN and blank values', () => {
    expect(findMissingRequired(tool, {})).toEqual(['id', 'name']);
    expect(findMissingRequired(tool, { id: null, name: ' ' })).toEqual(['id', 'name']);
    expect(findMissingRequired(tool, { id: NaN, name: 'x' })).toEqual(['id']);
    expect(findMissingRequired(tool, undefined)).toEqual(['id', 'name']);
  });

  it('accepts 0 and false as provided', () => {
    expect(findMissingRequired(tool, { id: 0, name: 'x' })).toEqual([]);
  });
});
