import { describe, it, expect } from '@jest/globals';
import { findMissingRequired, findUnknownArguments, acceptedParameterNames, applyIdAlias } from './validate-args.js';

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

describe('findUnknownArguments / acceptedParameterNames', () => {
  const tool = { name: 't', inputSchema: { required: ['dataSourceId'], properties: { fields: {}, dataSourceId: {} } } };

  it('lists arguments the schema does not declare', () => {
    expect(findUnknownArguments(tool, { id: 1, fields: 'x' })).toEqual(['id']);
    expect(findUnknownArguments(undefined, { id: 1 })).toEqual([]);
  });

  it('lists accepted names, required first', () => {
    expect(acceptedParameterNames(tool)).toEqual(['dataSourceId', 'fields']);
  });
});

describe('applyIdAlias', () => {
  const one = { name: 't', inputSchema: { required: ['dataSourceId'], properties: { dataSourceId: {} } } };
  const two = { name: 't', inputSchema: { required: ['dataSourceId', 'graphId'], properties: { dataSourceId: {}, graphId: {} } } };
  const declaresId = { name: 't', inputSchema: { required: ['collectorId'], properties: { id: {}, collectorId: {} } } };

  it('maps id to the single required *Id parameter', () => {
    expect(applyIdAlias(one, { id: 5 })).toEqual({ dataSourceId: 5 });
  });
  it('leaves calls alone when the real parameter is given, id is ambiguous, or id is declared', () => {
    expect(applyIdAlias(one, { id: 5, dataSourceId: 7 })).toEqual({ id: 5, dataSourceId: 7 });
    expect(applyIdAlias(two, { id: 5 })).toEqual({ id: 5 });
    expect(applyIdAlias(declaresId, { id: 5 })).toEqual({ id: 5 });
  });
});
