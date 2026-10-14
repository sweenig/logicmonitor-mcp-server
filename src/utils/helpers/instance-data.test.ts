import { describe, it, expect } from '@jest/globals';
import {
  parseNextPageParams,
  mergeInstanceDataPages,
  annotateTruncation,
  summarizeInstanceData,
} from './instance-data.js';

describe('instance-data helpers', () => {
  it('parses the paging cursor into numeric params', () => {
    expect(parseNextPageParams('start=1791590400&end=1791733205')).toEqual({
      start: 1791590400,
      end: 1791733205,
    });
  });

  it('merges an older page after the newer one and adopts its cursor', () => {
    const newer = { dataPoints: ['a'], values: [[3], [2]], time: [30, 20], nextPageParams: 'start=1&end=19' };
    const older = { dataPoints: ['a'], values: [[1]], time: [10], nextPageParams: '' };
    const merged = mergeInstanceDataPages(newer, older);
    expect(merged.values).toEqual([[3], [2], [1]]);
    expect(merged.time).toEqual([30, 20, 10]);
    expect(merged.nextPageParams).toBe('');
  });

  it('flags truncation only when a cursor remains', () => {
    const partial = annotateTruncation({ time: [1, 2], nextPageParams: 'start=1&end=99' });
    expect(partial.truncated).toBe(true);
    expect(partial.truncationNote).toContain('end=99');

    const complete = annotateTruncation({ time: [1, 2], nextPageParams: '' });
    expect(complete.truncated).toBeUndefined();
  });

  it('summarizes datapoints and detects counter resets', () => {
    // newest first: uptime 5, 100, 90 (a reset between 90->... is chronological: 100 -> 5)
    const summary = summarizeInstanceData({
      dataSourceName: 'DS',
      dataPoints: ['uptime', 'isDown'],
      values: [[5, 0], [100, 0], [90, 0]],
      time: [3000, 2000, 1000],
    });
    expect(summary.samples).toBe(3);
    expect(summary.oldestTime).toBe(1000);
    expect(summary.newestTime).toBe(3000);
    expect(summary.datapoints.uptime).toEqual({
      samples: 3, min: 5, max: 100, first: 90, last: 5, changes: 2, decreases: 1, lastDecreaseAt: 3000,
    });
    expect(summary.datapoints.isDown).toMatchObject({ min: 0, max: 0, changes: 0, decreases: 0 });
  });

  it('skips non-numeric values and carries truncation through', () => {
    const summary = summarizeInstanceData({
      dataPoints: ['x'],
      values: [['No Data']],
      time: [1],
      truncated: true,
      truncationNote: 'partial',
    });
    expect(summary.datapoints.x).toEqual({ samples: 0 });
    expect(summary.truncated).toBe(true);
  });
});
