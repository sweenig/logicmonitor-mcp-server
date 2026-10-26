/**
 * Request bodies for DataSource graphs (instance graphs at .../graphs, overview graphs at .../ographs).
 *
 * LogicMonitor needs a graph's dataPoints to carry the datapoint's numeric ID, and answers an unknown
 * or stale ID (or a name with no ID) with a bare 404. Callers know datapoints by name, so lines and
 * dataPoints are written by name here and the IDs are looked up from the DataSource's datapoints.
 */

import { parseJsonArray } from './coerce.js';
import { InvalidArgumentError } from '../core/error-handler.js';

export type GraphKind = 'overview' | 'instance';

const LINE_TYPES: Record<string, number> = { line: 1, area: 2, stack: 3, stacked: 3, column: 4 };

/** Scalar settings passed through as given when present. */
const PASSTHROUGH_FIELDS = [
  'name', 'title', 'verticalLabel', 'rigid', 'base1024', 'maxValue', 'minValue',
  'displayPrio', 'timeScale', 'width', 'height',
];

function lineType(value: unknown): number {
  if (typeof value === 'number') return value;
  const type = LINE_TYPES[String(value).trim().toLowerCase()];
  if (type !== undefined) return type;
  if (/^[1-4]$/.test(String(value).trim())) return Number(value);
  throw new InvalidArgumentError(`line type must be line, area, stack or column (or 1-4), got "${value}"`);
}

function list(value: unknown, field: string): any[] | undefined {
  const parsed = parseJsonArray(value);
  if (parsed === undefined) return undefined;
  if (!Array.isArray(parsed)) throw new InvalidArgumentError(`${field} must be an array`);
  return parsed;
}

/** The datapoint name a lines/dataPoints entry refers to (the two kinds of graph spell it differently). */
function pointName(entry: any): string | undefined {
  return entry?.dataPointName ?? entry?.name;
}

/**
 * The body for creating or updating a graph. Only the settings that were given are included, so an
 * update changes nothing else.
 *
 * - `lines` entries take a dataPointName, legend, colorName and a type (line|area|stack|column, or 1-4).
 *   Their isVirtualDataPoint flag is set from `virtualDataPoints`.
 * - `dataPoints` defaults to one entry per real datapoint used by `lines` (aggregateMethod "sum" and
 *   consolidateFunc 1 on overview graphs). Entries are given by name and get their ID looked up.
 * - `currentDataPoints` is the graph's existing dataPoints, kept when only `lines` changes, because
 *   LogicMonitor replaces the lines but leaves dataPoints alone and a virtual datapoint may rely on them.
 *
 * @param dsDataPoints the DataSource's datapoints (id and name), needed whenever lines or dataPoints are given.
 */
export function buildGraphBody(
  kind: GraphKind,
  args: Record<string, any>,
  dsDataPoints: Array<{ id: number; name: string }> = [],
  currentDataPoints: any[] = [],
): Record<string, any> {
  const body: Record<string, any> = {};
  for (const field of PASSTHROUGH_FIELDS) {
    if (args[field] !== undefined) body[field] = args[field];
  }
  if (kind === 'overview' && args.aggregated !== undefined) body.aggregated = args.aggregated;

  const virtualDataPoints = list(args.virtualDataPoints, 'virtualDataPoints');
  if (virtualDataPoints !== undefined) body.virtualDataPoints = virtualDataPoints;
  const virtualNames = new Set((virtualDataPoints ?? []).map((v: any) => v?.name));

  const lines = list(args.lines, 'lines');
  const dataPoints = list(args.dataPoints, 'dataPoints');
  if (lines === undefined && dataPoints === undefined) return body;

  const idByName = new Map(dsDataPoints.map(dp => [dp.name, dp.id]));
  const idFor = (name: string): number => {
    const id = idByName.get(name);
    if (id === undefined) {
      throw new InvalidArgumentError(
        `Datapoint "${name}" not found on the DataSource. Available: ${[...idByName.keys()].join(', ') || '(none)'}`,
      );
    }
    return id;
  };

  if (lines !== undefined) {
    body.lines = lines.map((line: any) => {
      const name = pointName(line);
      if (!name) throw new InvalidArgumentError('each line needs a dataPointName');
      return {
        dataPointName: name,
        isVirtualDataPoint: virtualNames.has(name) || line.isVirtualDataPoint === true,
        type: lineType(line.type ?? 'line'),
        legend: line.legend ?? name,
        colorName: line.colorName ?? 'blue',
      };
    });
  }

  let wanted: any[];
  if (dataPoints !== undefined) {
    wanted = dataPoints;
  } else {
    const used = new Set<string>();
    wanted = body.lines
      .filter((l: any) => !l.isVirtualDataPoint && !used.has(l.dataPointName) && used.add(l.dataPointName))
      .map((l: any) => ({ dataPointName: l.dataPointName }));
    // Existing entries not already covered stay, since a virtual datapoint may need them.
    for (const existing of currentDataPoints) {
      const name = pointName(existing);
      if (name && !used.has(name)) wanted.push({ dataPointName: name, aggregateMethod: existing.aggregateMethod, consolidateFunc: existing.consolidateFunc });
    }
  }

  body.dataPoints = wanted.map((entry: any) => {
    const name = pointName(entry);
    if (!name) throw new InvalidArgumentError('each dataPoints entry needs a dataPointName');
    const consolidateFunc = entry.consolidateFunc ?? 1;
    return kind === 'overview'
      ? { dataPointName: name, dataPointId: idFor(name), aggregateMethod: entry.aggregateMethod ?? 'sum', consolidateFunc }
      : { name, dataPointId: idFor(name), consolidateFunc };
  });
  return body;
}
