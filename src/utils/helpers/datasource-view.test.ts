import { describe, it, expect } from '@jest/globals';
import { curateDataSource } from './datasource-view.js';

function buildDataSource() {
  return {
    id: 74539,
    name: 'Example_DS',
    displayName: 'Example DS',
    description: 'Example',
    group: 'Collectors',
    appliesTo: 'lmaccount && lmaccess.bearer.key',
    technology: '',
    accessGroupIds: [1],
    accessGroups: [{ id: 1, name: 'Default Access Group', createdOn: 1, description: 'A default access group' }],
    collectMethod: 'batchscript',
    collectInterval: 300,
    hasMultiInstances: true,
    enableAutoDiscovery: true,
    collectorAttribute: {
      name: 'batchscript',
      scriptType: 'embed',
      groovyScript: 'println "collect"\n'.repeat(500),
      windowsScript: '',
      linuxCmdline: '',
    },
    autoDiscoveryConfig: {
      scheduleInterval: 60,
      instanceAutoGroupMethod: 'ilp',
      method: { name: 'ad_script', groovyScript: 'println "discover"', winScript: null },
    },
    dataPoints: [
      {
        id: 1,
        dataSourceId: 74539,
        name: 'uptime',
        description: 'The uptime of the collector in seconds',
        type: 2,
        dataType: 7,
        maxDigits: 4,
        postProcessorMethod: 'namevalue',
        postProcessorParam: '##WILDVALUE##.uptime',
        rawDataFieldName: 'output',
        userParam1: '',
        alertExpr: '> 5',
        alertTransitionInterval: 3,
        alertForNoData: 1,
        alertSubject: 'subject template',
        alertBody: 'a long alert body template',
        originId: 'abc',
        adAdvSettingEnabled: false,
        statusDisplayNames: [{ id: 1, statusDisplayName: 'Unknown' }],
      },
      {
        id: 2,
        name: 'derived',
        postProcessorMethod: 'groovy',
        postProcessorParam: 'x'.repeat(1000),
        userParam1: 'path',
      },
    ],
  };
}

describe('curateDataSource', () => {
  it('replaces script bodies with a size marker but keeps the rest of the structure', () => {
    const curated = curateDataSource(buildDataSource());

    expect(curated.collectorAttribute.groovyScript).toMatch(/^<\d+ chars; use get_datasource_scripts>$/);
    expect(curated.collectorAttribute.name).toBe('batchscript');
    expect(curated.collectorAttribute.scriptType).toBe('embed');
    expect(curated.collectorAttribute.windowsScript).toBe('');
    expect(curated.autoDiscoveryConfig.method.groovyScript).toBe('<18 chars; use get_datasource_scripts>');
    expect(curated.autoDiscoveryConfig.method.winScript).toBeNull();
    expect(curated.autoDiscoveryConfig.scheduleInterval).toBe(60);
  });

  it('keeps identity, appliesTo and collection settings', () => {
    const curated = curateDataSource(buildDataSource());

    expect(curated).toMatchObject({
      id: 74539,
      name: 'Example_DS',
      appliesTo: 'lmaccount && lmaccess.bearer.key',
      collectMethod: 'batchscript',
      collectInterval: 300,
      hasMultiInstances: true,
      accessGroupIds: [1],
    });
    expect(curated.accessGroups).toBeUndefined();
  });

  it('compacts datapoints to name, post-processor and alert threshold', () => {
    const curated = curateDataSource(buildDataSource());

    expect(curated.dataPoints[0]).toEqual({
      id: 1,
      name: 'uptime',
      type: 2,
      dataType: 7,
      postProcessorMethod: 'namevalue',
      rawDataFieldName: 'output',
      alertExpr: '> 5',
      alertTransitionInterval: 3,
      alertForNoData: 1,
      description: 'The uptime of the collector in seconds',
      postProcessorParam: '##WILDVALUE##.uptime',
    });
    // Message templates and housekeeping fields are gone.
    expect(curated.dataPoints[0].alertBody).toBeUndefined();
    expect(curated.dataPoints[0].originId).toBeUndefined();
    expect(curated.dataPoints[0].statusDisplayNames).toBeUndefined();
  });

  it('truncates a long post-processor script and points at the script tool', () => {
    const curated = curateDataSource(buildDataSource());

    expect(curated.dataPoints[1].postProcessorParam.length).toBeLessThan(400);
    expect(curated.dataPoints[1].postProcessorParam).toContain('1000 chars');
    expect(curated.dataPoints[1].userParam1).toBe('path');
  });

  it('adds an explanatory note when something was left out', () => {
    expect(curateDataSource(buildDataSource()).note).toContain('get_datasource_scripts');
  });

  it('does not modify its input', () => {
    const original = buildDataSource();
    const snapshot = JSON.parse(JSON.stringify(original));
    curateDataSource(original);
    expect(original).toEqual(snapshot);
  });

  it('is much smaller than the raw definition', () => {
    const original = buildDataSource();
    expect(JSON.stringify(curateDataSource(original)).length).toBeLessThan(JSON.stringify(original).length / 5);
  });

  it('returns small objects and non-objects unchanged, without a note', () => {
    const small = { id: 1, name: 'test-datasource' };
    expect(curateDataSource(small)).toEqual(small);
    expect(curateDataSource(null)).toBeNull();
    expect(curateDataSource('text')).toBe('text');
  });
});
