/**
 * Tests for LogicModule embedded script extraction
 */

import { describe, it, expect } from '@jest/globals';
import { extractDataSourceScripts } from './logicmodule-scripts.js';

describe('extractDataSourceScripts', () => {
  it('returns an empty array for a DataSource with no scripts (e.g. plain snmp)', () => {
    const dataSource = {
      name: 'SNMP_Test',
      collectMethod: 'snmp',
      collectorAttribute: { name: 'snmp', oid: '.1.3.6.1' },
    };

    expect(extractDataSourceScripts(dataSource)).toEqual([]);
  });

  it('extracts a groovy collection-method script', () => {
    const dataSource = {
      collectMethod: 'script',
      collectorAttribute: {
        name: 'script',
        scriptType: 'embed',
        groovyScript: 'println "hello"',
      },
    };

    const scripts = extractDataSourceScripts(dataSource);
    expect(scripts).toEqual([
      {
        location: 'collectorAttribute (collection method)',
        field: 'groovyScript',
        language: 'groovy',
        scriptType: 'embed',
        content: 'println "hello"',
      },
    ]);
  });

  it('extracts windows/linux batchscript collection-method scripts with their cmdlines', () => {
    const dataSource = {
      collectMethod: 'batchscript',
      collectorAttribute: {
        name: 'batchscript',
        windowsScript: 'Get-Process',
        windowsCmdline: 'powershell -File script.ps1',
        linuxScript: 'ps aux',
        linuxCmdline: './script.sh',
      },
    };

    const scripts = extractDataSourceScripts(dataSource);
    expect(scripts).toContainEqual({
      location: 'collectorAttribute (collection method)',
      field: 'windowsScript',
      language: 'windows',
      cmdline: 'powershell -File script.ps1',
      content: 'Get-Process',
    });
    expect(scripts).toContainEqual({
      location: 'collectorAttribute (collection method)',
      field: 'linuxScript',
      language: 'linux',
      cmdline: './script.sh',
      content: 'ps aux',
    });
  });

  it('extracts an ad_script discovery-method script', () => {
    const dataSource = {
      enableAutoDiscovery: true,
      autoDiscoveryConfig: {
        method: {
          name: 'ad_script',
          groovyScript: 'return instances',
        },
      },
    };

    const scripts = extractDataSourceScripts(dataSource);
    expect(scripts).toEqual([
      {
        location: 'autoDiscoveryConfig.method (discovery method)',
        field: 'groovyScript',
        language: 'groovy',
        content: 'return instances',
      },
    ]);
  });

  it('extracts an ERI discovery script', () => {
    const dataSource = {
      enableEriDiscovery: true,
      eriDiscoveryConfig: {
        name: 'eri',
        winScript: 'Get-EriData',
        winCmdline: 'powershell -File eri.ps1',
      },
    };

    const scripts = extractDataSourceScripts(dataSource);
    expect(scripts).toEqual([
      {
        location: 'eriDiscoveryConfig (ERI discovery)',
        field: 'winScript',
        language: 'windows',
        cmdline: 'powershell -File eri.ps1',
        content: 'Get-EriData',
      },
    ]);
  });

  it('extracts groovy and complex-expression datapoint post-processor scripts', () => {
    const dataSource = {
      dataPoints: [
        { name: 'CPUBusyPercent', postProcessorMethod: 'groovy', postProcessorParam: 'return value * 100' },
        { name: 'FreeMemory', postProcessorMethod: 'complex', postProcessorParam: 'dataPoint1*2' },
        { name: 'Uptime', postProcessorMethod: 'none' },
      ],
    };

    const scripts = extractDataSourceScripts(dataSource);
    expect(scripts).toEqual([
      {
        location: 'dataPoints[CPUBusyPercent].postProcessorParam',
        field: 'postProcessorParam',
        language: 'groovy',
        content: 'return value * 100',
      },
      {
        location: 'dataPoints[FreeMemory].postProcessorParam',
        field: 'postProcessorParam',
        language: 'expression',
        content: 'dataPoint1*2',
      },
    ]);
  });

  it('handles a DataSource with no dataPoints, autoDiscoveryConfig, or eriDiscoveryConfig at all', () => {
    expect(extractDataSourceScripts({ name: 'Minimal', collectMethod: 'ping' })).toEqual([]);
  });
});
