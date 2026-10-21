/**
 * Website checkpoint data. LogicMonitor returns {dataPoints: [names], values: [[...] per time],
 * time: [epoch ms], nextPageParams}; one row per time with named values is easier to read.
 */

export interface WebsiteCheckpointRows {
  dataPoints: string[];
  rows: Array<Record<string, any>>;
  nextPageParams?: string;
}

/** Zip the parallel arrays into rows of {time (ISO 8601), <datapoint>: value}, newest first as returned. */
export function websiteCheckpointRows(raw: any): WebsiteCheckpointRows | any {
  if (!raw || !Array.isArray(raw.dataPoints) || !Array.isArray(raw.values) || !Array.isArray(raw.time)) {
    return raw;
  }
  const rows = raw.values.map((values: any[], index: number) => {
    const row: Record<string, any> = { time: new Date(raw.time[index]).toISOString() };
    raw.dataPoints.forEach((name: string, i: number) => {
      row[name] = values[i];
    });
    return row;
  });
  const result: WebsiteCheckpointRows = { dataPoints: raw.dataPoints, rows };
  if (raw.nextPageParams) result.nextPageParams = raw.nextPageParams;
  return result;
}
