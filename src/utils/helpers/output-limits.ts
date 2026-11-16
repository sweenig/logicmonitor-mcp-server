/**
 * Helpers that keep tool responses small: nested field selection (dot paths in `fields`, which the
 * LogicMonitor API turns into `{}`), a row cap for widget data, and a text cap for script output.
 */

/**
 * Split a `fields` list into what to ask the API for and what to keep afterwards. A dot path such as
 * "dataPoints.id,dataPoints.name" is requested as its top-level field ("dataPoints") and projected
 * locally. A list without dot paths (or "*") is passed through unchanged.
 */
export function planNestedFields(fields?: string): { apiFields?: string; paths?: string[] } {
  if (!fields || !fields.includes('.')) return { apiFields: fields };
  const paths = fields.split(',').map(f => f.trim()).filter(Boolean);
  const top = [...new Set(paths.map(p => p.split('.')[0]))];
  return { apiFields: top.join(','), paths };
}

function merge(src: any, segments: string[], dst: any): any {
  if (segments.length === 0) return src;
  if (Array.isArray(src)) {
    const existing: any[] = Array.isArray(dst) ? dst : [];
    return src.map((item, i) => merge(item, segments, existing[i]));
  }
  if (src === null || typeof src !== 'object') return src;
  const [head, ...rest] = segments;
  if (!(head in src)) return dst;
  return { ...(dst ?? {}), [head]: merge(src[head], rest, dst?.[head]) };
}

/** Keep only the given dot paths of one object; arrays along a path are projected item by item. */
export function projectPaths(obj: any, paths: string[]): any {
  if (obj === null || typeof obj !== 'object') return obj;
  let out: any = {};
  for (const path of paths) out = merge(obj, path.split('.'), out);
  return out;
}

/** Apply a nested-fields projection to a single object or to the items of a list response. */
export function projectResult(result: any, paths?: string[]): any {
  if (!paths || result === null || typeof result !== 'object') return result;
  if (Array.isArray(result.items)) return { ...result, items: result.items.map((item: any) => projectPaths(item, paths)) };
  return projectPaths(result, paths);
}

/** Longest array (of at least `min` entries) in a response, found at most `depth` levels down. */
function findLargestArray(value: any, path: string[], depth: number, min: number): { path: string[]; length: number } | undefined {
  let best: { path: string[]; length: number } | undefined;
  if (Array.isArray(value)) {
    if (value.length > min) best = { path, length: value.length };
    return best;
  }
  if (value === null || typeof value !== 'object' || depth === 0) return undefined;
  for (const [key, child] of Object.entries(value)) {
    const found = findLargestArray(child, [...path, key], depth - 1, min);
    if (found && (!best || found.length > best.length)) best = found;
  }
  return best;
}

export interface RowCap {
  value: any;
  /** Present when rows were left out. */
  truncated?: { path: string; total: number; returned: number };
}

/**
 * Keep the first `maxRows` entries of the largest array in a widget's data (table rows, series points)
 * and report how many there were. Responses whose arrays are all within the limit come back untouched.
 */
export function capRows(data: any, maxRows: number): RowCap {
  const found = findLargestArray(data, [], 4, maxRows);
  if (!found) return { value: data };
  const copy = JSON.parse(JSON.stringify(data));
  let parent = copy;
  for (const key of found.path.slice(0, -1)) parent = parent[key];
  const last = found.path[found.path.length - 1];
  if (last === undefined) {
    return { value: copy.slice(0, maxRows), truncated: { path: '(root)', total: found.length, returned: maxRows } };
  }
  parent[last] = parent[last].slice(0, maxRows);
  return { value: copy, truncated: { path: found.path.join('.'), total: found.length, returned: maxRows } };
}

/**
 * Keep as many entries of the largest array in a widget's data as fit in maxChars (pretty-printed, as sent),
 * and at least one. For when the row count is not given and a row can be anywhere from 50 to 2,000 characters.
 */
export function capRowsToSize(data: any, maxChars: number): RowCap {
  const size = (value: unknown) => JSON.stringify(value, null, 2).length;
  if (size(data) <= maxChars) return { value: data };
  const found = findLargestArray(data, [], 4, 1);
  if (!found) return { value: data };
  let lo = 1;
  let hi = found.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (size(capRows(data, mid).value) <= maxChars) lo = mid;
    else hi = mid - 1;
  }
  return capRows(data, lo);
}

/** Cut text to maxChars and say how much was left out. */
export function capText(text: string, maxChars: number): { text: string; omitted: number } {
  if (text.length <= maxChars) return { text, omitted: 0 };
  return { text: text.slice(0, maxChars), omitted: text.length - maxChars };
}

/** A user's roles as {id, name}: the full role objects carry every privilege and dwarf the rest of the user. */
export function compactRoles(roles: any): any {
  if (!Array.isArray(roles)) return roles;
  return roles.map(role => (role && typeof role === 'object' ? { id: role.id, name: role.name } : role));
}
