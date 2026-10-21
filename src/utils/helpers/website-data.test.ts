import { describe, it, expect } from '@jest/globals';
import { websiteCheckpointRows } from './website-data.js';

describe('websiteCheckpointRows', () => {
  it('returns rows with ISO times and keeps nextPageParams only when set', () => {
    const result = websiteCheckpointRows({ dataPoints: ['a'], values: [[1]], time: [0], nextPageParams: 'next' });
    expect(result).toEqual({ dataPoints: ['a'], rows: [{ time: '1970-01-01T00:00:00.000Z', a: 1 }], nextPageParams: 'next' });
  });

  it('handles an empty result and returns unrecognised shapes unchanged', () => {
    expect(websiteCheckpointRows({ dataPoints: ['a'], values: [], time: [] })).toEqual({ dataPoints: ['a'], rows: [] });
    expect(websiteCheckpointRows(null)).toBeNull();
    expect(websiteCheckpointRows({ x: 1 })).toEqual({ x: 1 });
  });
});
