import { describe, it, expect } from '@jest/globals';
import { buildGraphBody } from './datasource-graph.js';

const POINTS = [{ id: 11, name: 'alpha' }, { id: 12, name: 'beta' }];

describe('buildGraphBody', () => {
  it('passes the given settings through and nothing else', () => {
    expect(buildGraphBody('instance', { dataSourceId: 1, graphId: 2, title: 'T', rigid: true, maxValue: 'NaN' }))
      .toEqual({ title: 'T', rigid: true, maxValue: 'NaN' });
  });

  it('resolves line datapoints by name and derives dataPoints for an instance graph', () => {
    const body = buildGraphBody('instance', {
      name: 'g',
      lines: [{ dataPointName: 'alpha', type: 'stack', legend: 'A', colorName: 'red' }, { dataPointName: 'beta' }],
    }, POINTS);

    expect(body.lines).toEqual([
      { dataPointName: 'alpha', isVirtualDataPoint: false, type: 3, legend: 'A', colorName: 'red' },
      { dataPointName: 'beta', isVirtualDataPoint: false, type: 1, legend: 'beta', colorName: 'blue' },
    ]);
    expect(body.dataPoints).toEqual([
      { name: 'alpha', dataPointId: 11, consolidateFunc: 1 },
      { name: 'beta', dataPointId: 12, consolidateFunc: 1 },
    ]);
  });

  it('builds a stacked-by-instance overview graph with aggregate settings', () => {
    const body = buildGraphBody('overview', {
      aggregated: false,
      lines: [{ dataPointName: 'alpha', type: 'stack', legend: '##INSTANCE##' }],
      dataPoints: [{ dataPointName: 'alpha', aggregateMethod: 'max', consolidateFunc: 2 }],
    }, POINTS);

    expect(body.aggregated).toBe(false);
    expect(body.lines[0]).toMatchObject({ type: 3, legend: '##INSTANCE##' });
    expect(body.dataPoints).toEqual([{ dataPointName: 'alpha', dataPointId: 11, aggregateMethod: 'max', consolidateFunc: 2 }]);
  });

  it('defaults overview aggregation to sum and does not send aggregated for instance graphs', () => {
    expect(buildGraphBody('overview', { lines: [{ dataPointName: 'beta' }] }, POINTS).dataPoints)
      .toEqual([{ dataPointName: 'beta', dataPointId: 12, aggregateMethod: 'sum', consolidateFunc: 1 }]);
    expect(buildGraphBody('instance', { aggregated: true })).toEqual({});
  });

  it('marks lines for virtual datapoints and leaves them out of the derived dataPoints', () => {
    const body = buildGraphBody('instance', {
      virtualDataPoints: [{ name: 'diff', rpn: 'alpha-beta' }],
      lines: [{ dataPointName: 'diff', type: 'area' }],
      dataPoints: [{ dataPointName: 'alpha' }, { dataPointName: 'beta' }],
    }, POINTS);

    expect(body.lines[0]).toMatchObject({ dataPointName: 'diff', isVirtualDataPoint: true, type: 2 });
    expect(body.dataPoints.map((d: any) => d.name)).toEqual(['alpha', 'beta']);

    const derived = buildGraphBody('instance', { virtualDataPoints: [{ name: 'diff', rpn: 'alpha-beta' }], lines: [{ dataPointName: 'diff' }] }, POINTS);
    expect(derived.dataPoints).toEqual([]);
  });

  it('keeps existing dataPoints when only lines change', () => {
    const body = buildGraphBody('instance', { lines: [{ dataPointName: 'alpha' }] }, POINTS,
      [{ name: 'beta', dataPointId: 12, consolidateFunc: 2 }]);

    expect(body.dataPoints).toEqual([
      { name: 'alpha', dataPointId: 11, consolidateFunc: 1 },
      { name: 'beta', dataPointId: 12, consolidateFunc: 2 },
    ]);
  });

  it('rejects an unknown datapoint, naming the available ones', () => {
    expect(() => buildGraphBody('instance', { lines: [{ dataPointName: 'nope' }] }, POINTS))
      .toThrow(/"nope" not found.*alpha, beta/);
  });

  it('rejects an unknown line type and accepts numeric ones and JSON-string arrays', () => {
    expect(() => buildGraphBody('instance', { lines: [{ dataPointName: 'alpha', type: 'wavy' }] }, POINTS)).toThrow(/line type/);
    expect(buildGraphBody('instance', { lines: '[{"dataPointName":"alpha","type":4}]' }, POINTS).lines[0].type).toBe(4);
  });
});
