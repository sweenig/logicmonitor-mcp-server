import {
  describeInterval,
  describeAlertIntervals,
  anyOccurrenceWarning,
  datapointIntervalWarnings,
  ALERT_INTERVAL_RULE,
} from './alert-intervals.js';

describe('describeAlertIntervals', () => {
  it('turns cycles into polls and minutes at a 5-minute poll', () => {
    expect(describeInterval(0, 300)).toBe('alerts at the first violating poll');
    expect(describeInterval(1, 300)).toBe('alerts after 2 consecutive polls (5 minutes)');
    expect(describeInterval(2, 300)).toBe('alerts after 3 consecutive polls (10 minutes)');
    expect(describeInterval(5, 300)).toBe('alerts after 6 consecutive polls (25 minutes)');
    expect(describeInterval(12, 300, 'clears')).toBe('clears after 13 consecutive polls (60 minutes)');
    expect(describeInterval(0, 300, 'clears')).toBe('clears at the first normal poll');
  });

  it('scales with other collect intervals', () => {
    expect(describeInterval(3, 60)).toBe('alerts after 4 consecutive polls (3 minutes)');
    expect(describeInterval(1, 30)).toBe('alerts after 2 consecutive polls (30 s)');
    expect(describeInterval(1, 90)).toBe('alerts after 2 consecutive polls (1.5 minutes)');
    expect(describeInterval(1, 3600)).toBe('alerts after 2 consecutive polls (60 minutes)');
  });

  it('leaves out minutes when the collect interval is unknown', () => {
    expect(describeInterval(1, undefined)).toBe('alerts after 2 consecutive polls');
    expect(describeInterval(1, 0)).toBe('alerts after 2 consecutive polls');
  });

  it('describes trigger and clear together and skips inherited (-1) or missing values', () => {
    expect(describeAlertIntervals(1, 12, 300)).toBe(
      'trigger 1 = alerts after 2 consecutive polls (5 minutes); clear 12 = clears after 13 consecutive polls (60 minutes)',
    );
    expect(describeAlertIntervals(-1, 2, 300)).toBe('clear 2 = clears after 3 consecutive polls (10 minutes)');
    expect(describeAlertIntervals(undefined, undefined, 300)).toBeUndefined();
    expect(describeAlertIntervals(-1, -1, 300)).toBeUndefined();
  });

  it('states the rule with the zero case and the formula', () => {
    expect(ALERT_INTERVAL_RULE).toContain('0 (the default) = alert at the first violating poll');
    expect(ALERT_INTERVAL_RULE).toContain('N x the collection interval');
    expect(ALERT_INTERVAL_RULE).toContain('1 = after 5 minutes (2 polls)');
  });
});

describe('anyOccurrenceWarning', () => {
  it('warns on "> 0" with a trigger interval above 0 and names interval 0 as the fix', () => {
    const warning = anyOccurrenceWarning('UnmatchedErrorLevel', '> 0', 1, 300)!;
    expect(warning).toContain('UnmatchedErrorLevel');
    expect(warning).toContain('2 consecutive violating polls');
    expect(warning).toContain('5 minutes');
    expect(warning).toContain('set alertTransitionInterval to 0');
  });

  it('warns on ">= 1" and on a multi-level expression whose first level is "> 0"', () => {
    expect(anyOccurrenceWarning('a', '>= 1', 2)).toBeDefined();
    expect(anyOccurrenceWarning('a', '> 0 1 2', 3)).toBeDefined();
    expect(anyOccurrenceWarning('a', '>0', 1)).toBeDefined();
  });

  it('does not warn with trigger 0, or for other thresholds', () => {
    expect(anyOccurrenceWarning('a', '> 0', 0)).toBeUndefined();
    expect(anyOccurrenceWarning('a', '> 90 95', 2)).toBeUndefined();
    expect(anyOccurrenceWarning('a', '> 05', 2)).toBeUndefined();
    expect(anyOccurrenceWarning('a', '', 2)).toBeUndefined();
    expect(anyOccurrenceWarning('a', '> 0', undefined)).toBeUndefined();
    expect(anyOccurrenceWarning('a', '> 0', -1)).toBeUndefined();
  });

  it('checks a list of datapoints', () => {
    const warnings = datapointIntervalWarnings([
      { name: 'x', alertExpr: '> 0', alertTransitionInterval: 1 },
      { name: 'y', alertExpr: '> 0', alertTransitionInterval: 0 },
      { name: 'z', alertExpr: '> 80', alertTransitionInterval: 3 },
    ], 300);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('Datapoint x');
    expect(datapointIntervalWarnings('not an array')).toEqual([]);
  });
});
