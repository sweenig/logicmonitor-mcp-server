/**
 * Parsing for test_datasource: turns the raw output of a DataSource's discovery and collection scripts
 * into instances and datapoint values, applying each datapoint's post-processor the way the collector
 * would. Only the post-processors a script DataSource normally uses are simulated (namevalue, and "none"
 * on the whole output); any other is reported as not simulated rather than guessed at.
 */

export interface DiscoveredInstance {
  wildvalue: string;
  wildalias: string;
  description: string;
  properties: Record<string, string>;
}

export interface DatapointResult {
  name: string;
  value?: number | string;
  note?: string;
}

/** The debug console prefixes script output with "returns N"; that line is not script output. */
export function stripReturnHeader(output: string): string {
  return (output ?? '').replace(/^\s*returns\s+-?\d+[ \t]*\r?\n?/i, '');
}

function decode(text: string): string {
  try {
    return decodeURIComponent(text.replace(/\+/g, ' '));
  } catch {
    return text;
  }
}

/** Active Discovery output: one instance per line, "wildvalue##wildalias##description##wildvalue2##url-encoded props". */
export function parseDiscoveryOutput(output: string): DiscoveredInstance[] {
  const instances: DiscoveredInstance[] = [];
  for (const line of stripReturnHeader(output).split(/\r?\n/)) {
    if (line.trim() === '' || !line.includes('##')) continue;
    const [wildvalue, wildalias = '', description = '', , props = ''] = line.split('##');
    const properties: Record<string, string> = {};
    for (const pair of props.split('&')) {
      const eq = pair.indexOf('=');
      if (eq > 0) properties[decode(pair.slice(0, eq))] = decode(pair.slice(eq + 1));
    }
    instances.push({ wildvalue: wildvalue.trim(), wildalias: wildalias.trim(), description: description.trim(), properties });
  }
  return instances;
}

function asValue(text: string): number | string {
  const trimmed = text.trim();
  return trimmed !== '' && Number.isFinite(Number(trimmed)) ? Number(trimmed) : trimmed;
}

/** name=value lines of the output, first occurrence of a name winning. */
function nameValueLines(output: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const line of stripReturnHeader(output).split(/\r?\n/)) {
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!values.has(key)) values.set(key, line.slice(eq + 1));
  }
  return values;
}

/**
 * Apply each datapoint's post-processor to collection output. `wildvalue` is set for one instance of a
 * batchscript DataSource, where ##WILDVALUE## in a postProcessorParam stands for it.
 */
export function evaluateDatapoints(dataPoints: any[], output: string, wildvalue?: string): DatapointResult[] {
  const lines = nameValueLines(output);
  return (dataPoints ?? []).map((dp: any): DatapointResult => {
    const name = String(dp?.name);
    const method = dp?.postProcessorMethod ?? '';
    if (method === 'namevalue') {
      const param = String(dp.postProcessorParam ?? '');
      const key = wildvalue === undefined ? param : param.split('##WILDVALUE##').join(wildvalue);
      return lines.has(key)
        ? { name, value: asValue(lines.get(key)!) }
        : { name, note: `no line "${key}=..." in the output (NaN/no data)` };
    }
    if (method === 'none' || method === '') {
      const whole = stripReturnHeader(output).trim();
      return whole !== '' ? { name, value: asValue(whole) } : { name, note: 'empty output' };
    }
    return { name, note: `post-processor "${method}" is not simulated; check this datapoint on a real resource` };
  });
}
