/**
 * Helpers for the /instances/{id}/data endpoint, which returns the newest samples first:
 * { dataPoints: string[], values: any[][], time: number[] (epoch ms), nextPageParams: string }
 */

export interface InstanceDataPage {
  dataSourceName?: string;
  dataPoints?: string[];
  values?: any[][];
  time?: number[];
  nextPageParams?: string;
  [key: string]: any;
}

/** Parse a "start=...&end=..." cursor into request params (numeric values become numbers). */
export function parseNextPageParams(next: string): Record<string, string | number> {
  const parsed: Record<string, string | number> = {};
  new URLSearchParams(next).forEach((value, key) => {
    const num = Number(value);
    parsed[key] = value !== '' && Number.isFinite(num) ? num : value;
  });
  return parsed;
}

/** Append an older page (same datapoints) onto an accumulated result. */
export function mergeInstanceDataPages(acc: InstanceDataPage, older: InstanceDataPage): InstanceDataPage {
  return {
    ...acc,
    values: [...(acc.values || []), ...(older.values || [])],
    time: [...(acc.time || []), ...(older.time || [])],
    nextPageParams: older.nextPageParams || '',
  };
}

/** Add truncated/truncationNote when the API still has older data we did not fetch. */
export function annotateTruncation(result: InstanceDataPage): InstanceDataPage {
  if (!result.nextPageParams) return result;
  const next = parseNextPageParams(result.nextPageParams);
  return {
    ...result,
    truncated: true,
    truncationNote:
      `Partial window: ${result.time?.length ?? 0} samples returned and older data exists. ` +
      `Re-query with end=${next.end ?? '<earlier end>'} (epoch seconds) for the next page, ` +
      'or set autoPaginate:true (optionally maxPages) to fetch more automatically.',
  };
}

/**
 * Collapse raw samples into per-datapoint stats so a long range does not flood context.
 * "decreases" counts samples lower than the previous (chronologically) one, which is how
 * counter resets such as collector restarts (uptime) show up.
 */
export function summarizeInstanceData(result: InstanceDataPage): Record<string, any> {
  const dataPoints = result.dataPoints || [];
  const rows = result.values || [];
  const times = result.time || [];
  const samples = rows.length;

  const datapoints: Record<string, any> = {};
  dataPoints.forEach((name, col) => {
    let min = Infinity;
    let max = -Infinity;
    let numeric = 0;
    let changes = 0;
    let decreases = 0;
    let lastDecreaseAt: number | undefined;
    let first: number | undefined;
    let last: number | undefined;
    let prev: number | undefined;

    // rows are newest-first; walk oldest -> newest
    for (let i = samples - 1; i >= 0; i--) {
      const v = rows[i]?.[col];
      if (typeof v !== 'number' || !Number.isFinite(v)) continue;
      numeric++;
      if (v < min) min = v;
      if (v > max) max = v;
      if (first === undefined) first = v;
      if (prev !== undefined && v !== prev) {
        changes++;
        if (v < prev) {
          decreases++;
          lastDecreaseAt = times[i];
        }
      }
      prev = v;
      last = v;
    }

    if (numeric === 0) {
      datapoints[name] = { samples: 0 };
      return;
    }
    datapoints[name] = { samples: numeric, min, max, first, last, changes, decreases };
    if (lastDecreaseAt !== undefined) datapoints[name].lastDecreaseAt = lastDecreaseAt;
  });

  const out: Record<string, any> = {
    dataSourceName: result.dataSourceName,
    samples,
    ...(samples > 0 ? { oldestTime: times[samples - 1], newestTime: times[0] } : {}),
    datapoints,
  };
  if (result.truncated) {
    out.truncated = true;
    out.truncationNote = result.truncationNote;
  }
  return out;
}
