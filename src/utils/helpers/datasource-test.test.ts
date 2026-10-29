import { describe, it, expect } from '@jest/globals';
import { stripReturnHeader, parseDiscoveryOutput, evaluateDatapoints, datapointWarnings } from './datasource-test.js';

describe('stripReturnHeader', () => {
  it('removes the "returns N" line only', () => {
    expect(stripReturnHeader('returns 0\na=1\n')).toBe('a=1\n');
    expect(stripReturnHeader('a=1')).toBe('a=1');
  });
});

describe('parseDiscoveryOutput', () => {
  it('parses wildvalue, alias, description and url-encoded props (wildvalue2 left empty)', () => {
    const out = 'returns 0\nid1##Name One##A desc####url=http%3A%2F%2Fx%2Fa%3Fb&team=a+b\nid2##Two##d####\nnoise line\n';
    expect(parseDiscoveryOutput(out)).toEqual([
      { wildvalue: 'id1', wildalias: 'Name One', description: 'A desc', properties: { url: 'http://x/a?b', team: 'a b' } },
      { wildvalue: 'id2', wildalias: 'Two', description: 'd', properties: {} },
    ]);
  });
});

describe('evaluateDatapoints', () => {
  const dps = [
    { name: 'metric', postProcessorMethod: 'namevalue', postProcessorParam: 'metric' },
    { name: 'perInstance', postProcessorMethod: 'namevalue', postProcessorParam: '##WILDVALUE##.load' },
  ];

  it('evaluates namevalue on a single-instance output', () => {
    expect(evaluateDatapoints(dps.slice(0, 1), 'returns 0\nmetric=42\n')).toEqual([{ name: 'metric', value: 42 }]);
  });

  it('substitutes ##WILDVALUE## per instance and notes missing lines', () => {
    const out = 'id1.load=1.5\nid2.other=3\n';
    expect(evaluateDatapoints(dps.slice(1), out, 'id1')).toEqual([{ name: 'perInstance', value: 1.5 }]);
    expect(evaluateDatapoints(dps.slice(1), out, 'id2')[0].note).toContain('id2.load=');
  });

  it('keeps non-numeric text, uses the whole output for "none", and flags unsupported post-processors', () => {
    expect(evaluateDatapoints([{ name: 'a', postProcessorMethod: 'namevalue', postProcessorParam: 'a' }], 'a=up')).toEqual([{ name: 'a', value: 'up' }]);
    expect(evaluateDatapoints([{ name: 'n', postProcessorMethod: 'none' }], 'returns 0\n7\n')).toEqual([{ name: 'n', value: 7 }]);
    expect(evaluateDatapoints([{ name: 'r', postProcessorMethod: 'regex' }], 'x')[0].note).toContain('not simulated');
  });
});

describe('datapointWarnings', () => {
  it('warns about datapoints saved without a rawDataFieldName, but not expression datapoints', () => {
    const warnings = datapointWarnings([
      { name: 'ok', postProcessorMethod: 'namevalue', rawDataFieldName: 'output' },
      { name: 'empty', postProcessorMethod: 'namevalue', rawDataFieldName: '' },
      { name: 'absent', postProcessorMethod: 'namevalue' },
      { name: 'calc', postProcessorMethod: 'expression', rawDataFieldName: '' },
    ]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('2 datapoint(s) have no rawDataFieldName (empty, absent)');
    expect(warnings[0]).toContain('unknown raw datapoint');
  });

  it('is empty when every datapoint has the field, and shortens a long list', () => {
    expect(datapointWarnings([{ name: 'a', rawDataFieldName: 'output' }])).toEqual([]);
    expect(datapointWarnings(undefined as any)).toEqual([]);
    const many = Array.from({ length: 12 }, (_, i) => ({ name: `d${i}`, postProcessorMethod: 'namevalue', rawDataFieldName: '' }));
    expect(datapointWarnings(many)[0]).toContain('d0, d1, d2, d3, d4, d5, d6, d7, d8, d9 and 2 more');
  });
});
