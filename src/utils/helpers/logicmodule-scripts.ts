/**
 * LogicModule Embedded Script Extraction
 *
 * LogicMonitor LogicModule definitions (DataSource, EventSource, ConfigSource, ...) can embed
 * scripts (Groovy, Windows/PowerShell, Linux shell, or per-datapoint post-processor expressions)
 * in several different, differently-named locations within the same JSON object. Script content
 * is always plain text in the v3 REST API (no base64/CDATA encoding), but scattered enough across
 * these locations that callers benefit from a single pass that pulls out whatever is actually
 * present rather than re-deriving this mapping themselves.
 *
 * Field presence is checked directly rather than trusting collectMethod/method.name, so this
 * degrades gracefully (returns fewer/no entries) if LM adds new LogicModule shapes we don't
 * already know about.
 */

export interface ExtractedScript {
  location: string;
  field: string;
  language: 'groovy' | 'windows' | 'linux' | 'expression';
  scriptType?: string;
  cmdline?: string;
  content: string;
}

function pushIfPresent(
  scripts: ExtractedScript[],
  source: any,
  location: string,
  field: string,
  language: ExtractedScript['language'],
  cmdlineField?: string,
  scriptType?: string,
): void {
  const content = source?.[field];
  if (typeof content === 'string' && content.trim().length > 0) {
    scripts.push({
      location,
      field,
      language,
      ...(scriptType ? { scriptType } : {}),
      ...(cmdlineField && typeof source?.[cmdlineField] === 'string' ? { cmdline: source[cmdlineField] } : {}),
      content,
    });
  }
}

function extractCollectorAttributeScripts(scripts: ExtractedScript[], attr: any): void {
  if (!attr) return;
  const scriptType = typeof attr.scriptType === 'string' ? attr.scriptType : undefined;
  pushIfPresent(scripts, attr, 'collectorAttribute (collection method)', 'groovyScript', 'groovy', undefined, scriptType);
  pushIfPresent(scripts, attr, 'collectorAttribute (collection method)', 'windowsScript', 'windows', 'windowsCmdline', scriptType);
  pushIfPresent(scripts, attr, 'collectorAttribute (collection method)', 'linuxScript', 'linux', 'linuxCmdline', scriptType);
}

function extractDiscoveryMethodScripts(scripts: ExtractedScript[], method: any, location: string): void {
  if (!method) return;
  pushIfPresent(scripts, method, location, 'groovyScript', 'groovy');
  pushIfPresent(scripts, method, location, 'winScript', 'windows', 'winCmdline');
  pushIfPresent(scripts, method, location, 'linuxScript', 'linux', 'linuxCmdline');
}

function extractDataPointScripts(scripts: ExtractedScript[], dataPoints: any): void {
  if (!Array.isArray(dataPoints)) return;
  for (const dp of dataPoints) {
    if (dp?.postProcessorMethod === 'groovy' && typeof dp?.postProcessorParam === 'string' && dp.postProcessorParam.trim().length > 0) {
      scripts.push({
        location: `dataPoints[${dp.name ?? '?'}].postProcessorParam`,
        field: 'postProcessorParam',
        language: 'groovy',
        content: dp.postProcessorParam,
      });
    } else if (dp?.postProcessorMethod === 'complex' && typeof dp?.postProcessorParam === 'string' && dp.postProcessorParam.trim().length > 0) {
      scripts.push({
        location: `dataPoints[${dp.name ?? '?'}].postProcessorParam`,
        field: 'postProcessorParam',
        language: 'expression',
        content: dp.postProcessorParam,
      });
    }
  }
}

/**
 * Extracts every embedded script from a LogicMonitor DataSource object (as returned by
 * GET /setting/datasources/{id}), across all known script-bearing locations: the collection
 * method (collectorAttribute), the discovery method (autoDiscoveryConfig.method), the ERI
 * discovery method (eriDiscoveryConfig), and any per-datapoint post-processor scripts/expressions.
 */
export function extractDataSourceScripts(dataSource: any): ExtractedScript[] {
  const scripts: ExtractedScript[] = [];

  extractCollectorAttributeScripts(scripts, dataSource?.collectorAttribute);
  extractDiscoveryMethodScripts(scripts, dataSource?.autoDiscoveryConfig?.method, 'autoDiscoveryConfig.method (discovery method)');
  extractDiscoveryMethodScripts(scripts, dataSource?.eriDiscoveryConfig, 'eriDiscoveryConfig (ERI discovery)');
  extractDataPointScripts(scripts, dataSource?.dataPoints);

  return scripts;
}
