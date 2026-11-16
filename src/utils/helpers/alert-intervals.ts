/**
 * Alert trigger and clear intervals count poll CYCLES, not polls.
 *
 * alertTransitionInterval N: the threshold must stay violated for N further cycles after the first
 * violating poll, so N+1 consecutive polls spanning N x collectInterval. 0 (the default) alerts at the
 * first violating poll. alertClearTransitionInterval works the same way for clearing: the value must
 * stay normal for N further cycles. Reading "1" as "one poll" is the usual mistake: it makes a
 * one-poll spike impossible to alert on.
 */

/** Text for tool descriptions that accept alertTransitionInterval / alertClearTransitionInterval. */
export const ALERT_INTERVAL_RULE =
  'alertTransitionInterval (trigger) and alertClearTransitionInterval (clear) count poll CYCLES after the first poll, not polls. ' +
  '0 (the default) = alert at the first violating poll. N above 0 = the threshold must stay violated for N further cycles, so N+1 consecutive polls spanning N x the collection interval (alertClearTransitionInterval N = the value must stay normal for N further cycles before the alert clears). ' +
  'Minutes = interval x collection interval in minutes. At a 5-minute poll: trigger 0 = alert at once; 1 = after 5 minutes (2 polls); 2 = after 10 minutes (3 polls); 5 = after 25 minutes (6 polls); clear 12 = 60 minutes. ' +
  'To alert on ANY occurrence (for example "> 0" on a count of errors) the trigger interval must be 0, or a one-poll spike never alerts. ' +
  'Read MCP resource "lm://knowledge/alert-thresholds" for details.';

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  const minutes = seconds / 60;
  const text = Number.isInteger(minutes) ? String(minutes) : minutes.toFixed(1).replace(/\.0$/, '');
  return `${text} minute${text === '1' ? '' : 's'}`;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/** What one interval means: "alerts at the first violating poll" or "after 2 polls (5 minutes)". */
export function describeInterval(interval: number, collectIntervalSeconds?: number, verb = 'alerts'): string {
  const hasRate = typeof collectIntervalSeconds === 'number' && collectIntervalSeconds > 0;
  const duration = hasRate ? ` (${formatDuration(interval * collectIntervalSeconds)})` : '';
  if (interval === 0) {
    return verb === 'alerts' ? 'alerts at the first violating poll' : 'clears at the first normal poll';
  }
  const polls = plural(interval + 1, 'consecutive poll');
  return verb === 'alerts'
    ? `alerts after ${polls}${duration}`
    : `clears after ${polls}${duration}`;
}

/**
 * One-line meaning of a datapoint's trigger and clear intervals, for example
 * "trigger 1 = alerts after 2 consecutive polls (5 minutes); clear 12 = clears after 13 consecutive polls (60 minutes)".
 * Returns undefined when neither interval is a usable number (-1 means "inherited" and is skipped).
 */
export function describeAlertIntervals(
  trigger: unknown,
  clear: unknown,
  collectIntervalSeconds?: number,
): string | undefined {
  const parts: string[] = [];
  if (typeof trigger === 'number' && trigger >= 0) {
    parts.push(`trigger ${trigger} = ${describeInterval(trigger, collectIntervalSeconds, 'alerts')}`);
  }
  if (typeof clear === 'number' && clear >= 0) {
    parts.push(`clear ${clear} = ${describeInterval(clear, collectIntervalSeconds, 'clears')}`);
  }
  return parts.length > 0 ? parts.join('; ') : undefined;
}

// A first (warning) level of "> 0" or ">= 1": every occurrence of a count or delta violates it.
const ANY_OCCURRENCE = /^\s*(?:>\s*0|>=\s*1)(?:\s|$)/;

/**
 * A warning when a datapoint looks meant to alert on every occurrence (threshold "> 0") but has a trigger
 * interval above 0, so a one-poll spike will not alert. Returns undefined when there is nothing to warn about.
 */
export function anyOccurrenceWarning(
  name: string | undefined,
  alertExpr: unknown,
  trigger: unknown,
  collectIntervalSeconds?: number,
): string | undefined {
  if (typeof alertExpr !== 'string' || !ANY_OCCURRENCE.test(alertExpr)) return undefined;
  if (typeof trigger !== 'number' || trigger <= 0) return undefined;
  const hasRate = typeof collectIntervalSeconds === 'number' && collectIntervalSeconds > 0;
  const span = hasRate ? ` (about ${formatDuration(trigger * collectIntervalSeconds)})` : '';
  return `Datapoint ${name ?? '(unnamed)'}: threshold "${alertExpr.trim()}" with alertTransitionInterval ${trigger} only alerts after ${trigger + 1} consecutive violating polls${span}; ` +
    'a spike that lasts one poll will not alert. If this should alert on any occurrence, set alertTransitionInterval to 0.';
}

/** Warnings for a list of datapoints as saved or about to be saved. */
export function datapointIntervalWarnings(dataPoints: unknown, collectIntervalSeconds?: number): string[] {
  if (!Array.isArray(dataPoints)) return [];
  const warnings: string[] = [];
  for (const dp of dataPoints) {
    if (!dp || typeof dp !== 'object') continue;
    const warning = anyOccurrenceWarning(
      (dp as any).name,
      (dp as any).alertExpr,
      (dp as any).alertTransitionInterval,
      collectIntervalSeconds,
    );
    if (warning) warnings.push(warning);
  }
  return warnings;
}
