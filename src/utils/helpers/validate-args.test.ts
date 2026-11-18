import { describe, it, expect } from '@jest/globals';
import { findMissingRequired, findUnknownArguments, acceptedParameterNames, applyIdAlias, applyParameterAliases } from './validate-args.js';

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

describe('applyParameterAliases', () => {
  const tool = { inputSchema: { properties: { deviceId: {}, deviceIds: {} } } };
  it('maps resourceId/resourceIds to deviceId/deviceIds', () => {
    expect(applyParameterAliases(tool, { resourceId: 5 })).toEqual({ deviceId: 5 });
    expect(applyParameterAliases(tool, { resourceIds: [1] })).toEqual({ deviceIds: [1] });
  });
  it('maps hostId, datasourceId and group_id to deviceId, dataSourceId and groupId', () => {
    expect(applyParameterAliases(tool, { hostId: 7 })).toEqual({ deviceId: 7 });
    const ds = { inputSchema: { properties: { dataSourceId: {} } } };
    expect(applyParameterAliases(ds, { datasourceId: 3 })).toEqual({ dataSourceId: 3 });
    const grp = { inputSchema: { properties: { groupId: {} } } };
    expect(applyParameterAliases(grp, { group_id: 9 })).toEqual({ groupId: 9 });
    expect(applyParameterAliases(grp, { groupId: 1, group_id: 9 })).toEqual({ groupId: 1 });
  });
  it('leaves tools that declare hostId alone, and does not map across unrelated tools', () => {
    const host = { inputSchema: { properties: { hostId: {} } } };
    expect(applyParameterAliases(host, { hostId: 7 })).toEqual({ hostId: 7 });
    expect(applyParameterAliases(tool, { datasourceId: 3 })).toEqual({ datasourceId: 3 });
  });
  it('keeps the canonical name when both are given, and leaves tools that declare the alias alone', () => {
    expect(applyParameterAliases(tool, { deviceId: 1, resourceId: 2 })).toEqual({ deviceId: 1 });
    const own = { inputSchema: { properties: { deviceId: {}, resourceId: {} } } };
    expect(applyParameterAliases(own, { resourceId: 2 })).toEqual({ resourceId: 2 });
  });
});
