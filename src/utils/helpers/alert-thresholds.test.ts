import { buildAlertExpr, parseAlertExpr, applyAlertThresholds, withParsedThreshold } from './alert-thresholds.js';

const TWO = '( 06:30 22:30 ) = 1 2 3 , ( 00:00 01:30 ) < 3 2 1 timezone=America/New_York';

describe('buildAlertExpr', () => {
  it('builds a plain threshold', () => {
    expect(buildAlertExpr([{ operator: '>', warn: 5400, error: 7200 }])).toBe('> 5400 7200');
  });
  it('builds one window', () => {
    expect(buildAlertExpr([{ window: { start: '06:45', end: '23:59' }, operator: '>', warn: 5400, error: 7200 }], 'America/New_York'))
      .toBe('( 06:45 23:59 ) > 5400 7200 timezone=America/New_York');
  });
  it('builds two windows with different operators', () => {
    expect(buildAlertExpr([
      { window: { start: '06:30', end: '22:30' }, operator: '=', warn: 1, error: 2, critical: 3 },
      { window: { start: '00:00', end: '01:30' }, operator: '<', warn: 3, error: 2, critical: 1 },
    ], 'America/New_York')).toBe(TWO);
  });
  it('accepts a midnight-crossing window, 24:00 as END and no timezone', () => {
    expect(buildAlertExpr([{ window: { start: '22:30', end: '01:30' }, operator: '>', warn: 5 }])).toBe('( 22:30 01:30 ) > 5');
    expect(buildAlertExpr([{ window: { start: '06:00', end: '24:00' }, operator: '>', warn: 5 }])).toBe('( 06:00 24:00 ) > 5');
  });
  it('accepts a JSON string and null levels', () => {
    expect(buildAlertExpr('[{"operator":">=","warn":1,"error":null}]')).toBe('>= 1');
  });
  it('rejects invalid input with a clear message', () => {
    const w = { start: '06:30', end: '22:30' };
    expect(() => buildAlertExpr([])).toThrow(/non-empty array/);
    expect(() => buildAlertExpr([{ window: { start: '6:30', end: '22:30' }, operator: '>', warn: 1 }])).toThrow(/HH:mm/);
    expect(() => buildAlertExpr([{ window: { start: '24:00', end: '22:30' }, operator: '>', warn: 1 }])).toThrow(/HH:mm/);
    expect(() => buildAlertExpr([{ window: w, operator: '~', warn: 1 }])).toThrow(/operator/);
    expect(() => buildAlertExpr([{ window: w, operator: '>' }])).toThrow(/at least one/);
    expect(() => buildAlertExpr([{ window: w, operator: '>', error: 2 }])).toThrow(/positional/);
    expect(() => buildAlertExpr([{ window: w, operator: '>', warn: 'x' }])).toThrow(/number/);
    expect(() => buildAlertExpr([{ window: w, operator: '>', warn: 1 }], 'Mars/Base')).toThrow(/IANA/);
    expect(() => buildAlertExpr([{ operator: '>', warn: 1 }], 'America/New_York')).toThrow(/timezone only applies/);
    expect(() => buildAlertExpr([{ window: w, operator: '>', warn: 1 }, { operator: '<', warn: 1 }])).toThrow(/Mix/);
  });
});

describe('parseAlertExpr', () => {
  it('parses the three documented strings', () => {
    expect(parseAlertExpr('> 0 0')).toEqual({ thresholds: [{ operator: '>', warn: 0, error: 0 }] });
    expect(parseAlertExpr('( 06:30 22:30 ) = 1 2 3 timezone=America/New_York')).toEqual({
      thresholds: [{ window: { start: '06:30', end: '22:30' }, operator: '=', warn: 1, error: 2, critical: 3 }],
      timezone: 'America/New_York',
    });
    expect(parseAlertExpr(TWO)?.thresholds).toHaveLength(2);
    expect(parseAlertExpr(TWO)?.thresholds[1]).toEqual({ window: { start: '00:00', end: '01:30' }, operator: '<', warn: 3, error: 2, critical: 1 });
  });
  it('round-trips through buildAlertExpr', () => {
    const p = parseAlertExpr(TWO)!;
    expect(buildAlertExpr(p.thresholds, p.timezone)).toBe(TWO);
  });
  it('returns undefined for empty or unrecognised strings', () => {
    expect(parseAlertExpr('')).toBeUndefined();
    expect(parseAlertExpr(undefined)).toBeUndefined();
    expect(parseAlertExpr('something odd')).toBeUndefined();
  });
});

describe('applyAlertThresholds / withParsedThreshold', () => {
  it('replaces alertThresholds with alertExpr and keeps other fields', () => {
    expect(applyAlertThresholds({ id: 1, alertExpr: '> 9', alertThresholds: [{ operator: '>', warn: 1 }] })).toEqual({ id: 1, alertExpr: '> 1' });
    const dp = { id: 1, alertExpr: '> 9' };
    expect(applyAlertThresholds(dp)).toBe(dp);
  });
  it('adds a parsed form only for windowed or timezone strings', () => {
    expect((withParsedThreshold({ alertExpr: TWO }) as any).alertExprParsed.thresholds).toHaveLength(2);
    expect(withParsedThreshold({ alertExpr: '> 5' })).toEqual({ alertExpr: '> 5' });
    expect((withParsedThreshold({ globalAlertExpr: TWO }, 'globalAlertExpr') as any).globalAlertExprParsed).toBeDefined();
  });
});
