/**
 * Structured form of a datapoint's alertExpr, including time-of-day windows.
 *
 * LogicMonitor stores a threshold as one string:
 *   plain:    `> 5400 7200`                  (operator, then up to three values: warn error critical)
 *   window:   `( 06:30 22:30 ) = 1 2 3 timezone=America/New_York`
 *   windows:  `( 06:30 22:30 ) = 1 2 3 , ( 00:00 01:30 ) < 3 2 1 timezone=America/New_York`
 * Windows are separated by " , ", each has its own operator and values, and one `timezone=` (an IANA zone id)
 * closes the whole string. buildAlertExpr writes that string from structured entries; parseAlertExpr reads it back.
 */

import { InvalidArgumentError } from '../core/error-handler.js';

export interface AlertThreshold {
  window?: { start: string; end: string };
  operator: string;
  warn?: number | null;
  error?: number | null;
  critical?: number | null;
}

export interface ParsedAlertExpr {
  thresholds: AlertThreshold[];
  timezone?: string;
}

export const ALERT_OPERATORS = ['>', '>=', '<', '<=', '=', '!='];
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
// The portal also stores 24:00 as an END (accepted 2026-11-16 on haservicestest).
const END_TIME = /^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/;

/** Text for tool descriptions and the knowledge resource. */
export const ALERT_THRESHOLDS_RULE =
  'Time-of-day thresholds: pass alertThresholds (and timezone) instead of hand-writing alertExpr. ' +
  'Each entry is {operator, warn, error, critical} for an always-on threshold, or {window:{start:"06:30", end:"22:30"}, operator, warn, error, critical} for one that applies only inside a daily clock window (24h HH:mm). ' +
  'A window may cross midnight (start after end, for example 22:30 to 01:30) and END may be 24:00. Several windows can sit on one datapoint, each with its own operator and values. timezone is one IANA zone id (for example America/New_York) closing the string; it applies to every window and is optional. END is exclusive at the minute. With overlapping windows the first matching entry decides, so order them with the one you want first. ' +
  'Example: alertThresholds:[{window:{start:"06:30",end:"22:30"},operator:"=",warn:1,error:2,critical:3},{window:{start:"00:00",end:"01:30"},operator:"<",warn:3,error:2,critical:1}], timezone:"America/New_York" ' +
  'is stored as "( 06:30 22:30 ) = 1 2 3 , ( 00:00 01:30 ) < 3 2 1 timezone=America/New_York". ' +
  'Levels are positional: error needs warn, critical needs error. Raw alertExpr still works; alertThresholds wins if both are given.';

function validTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return /^[A-Za-z0-9_+\-/]+$/.test(tz);
  } catch {
    return false;
  }
}

function fail(message: string): never {
  throw new InvalidArgumentError(message);
}

/** Build the alertExpr string, validating every part. */
export function buildAlertExpr(thresholds: unknown, timezone?: unknown): string {
  if (typeof thresholds === 'string') {
    try { thresholds = JSON.parse(thresholds); } catch { fail('alertThresholds must be an array of threshold objects'); }
  }
  if (!Array.isArray(thresholds) || thresholds.length === 0) {
    fail('alertThresholds must be a non-empty array of {operator, warn, error, critical} entries (add window:{start,end} for a time-of-day threshold)');
  }
  const parts = (thresholds as any[]).map((t, i) => {
    const label = `alertThresholds[${i}]`;
    if (!t || typeof t !== 'object') fail(`${label} must be an object`);
    if (!ALERT_OPERATORS.includes(t.operator)) {
      fail(`${label}.operator "${t.operator}" is not valid; use one of ${ALERT_OPERATORS.join(' ')}`);
    }
    const values: number[] = [];
    let gap = false;
    for (const level of ['warn', 'error', 'critical'] as const) {
      const v = t[level];
      if (v === undefined || v === null || v === '') { gap = true; continue; }
      const n = typeof v === 'string' ? Number(v) : v;
      if (typeof n !== 'number' || !Number.isFinite(n)) fail(`${label}.${level} must be a number`);
      if (gap) fail(`${label}.${level} is set but a less severe level is missing; levels are positional (warn, then error, then critical)`);
      values.push(n);
    }
    if (values.length === 0) fail(`${label} needs at least one of warn, error, critical`);
    let prefix = '';
    if (t.window !== undefined && t.window !== null) {
      const { start, end } = t.window;
      if (typeof start !== 'string' || !TIME.test(start)) fail(`${label}.window.start "${start}" must be 24h HH:mm, for example 06:30`);
      if (typeof end !== 'string' || !END_TIME.test(end)) fail(`${label}.window.end "${end}" must be 24h HH:mm, for example 22:30`);
      prefix = `( ${start} ${end} ) `;
    }
    return `${prefix}${t.operator} ${values.join(' ')}`;
  });
  const windowed = (thresholds as any[]).filter(t => t.window).length;
  if (windowed > 0 && windowed !== parts.length) {
    fail('Mix of windowed and plain entries: give every entry a window, or none');
  }
  if (windowed === 0 && parts.length > 1) {
    fail('More than one entry needs a window on each; a plain threshold has no time window');
  }
  let expr = parts.join(' , ');
  if (timezone !== undefined && timezone !== null && timezone !== '') {
    if (typeof timezone !== 'string' || !validTimezone(timezone)) {
      fail(`timezone "${timezone}" is not a valid IANA zone id, for example America/New_York`);
    }
    if (windowed === 0) fail('timezone only applies to time-of-day windows; add window to the entries or drop timezone');
    expr += ` timezone=${timezone}`;
  }
  return expr;
}

const ENTRY = /^(?:\(\s*(\d{1,2}:\d{2})\s+(\d{1,2}:\d{2})\s*\)\s*)?(>=|<=|!=|>|<|=)\s*(.*)$/;

/** Parse an alertExpr string; undefined when it is empty or not in the documented shape (the raw string stays authoritative). */
export function parseAlertExpr(expr: unknown): ParsedAlertExpr | undefined {
  if (typeof expr !== 'string' || expr.trim() === '') return undefined;
  let body = expr.trim();
  let timezone: string | undefined;
  const tz = body.match(/\s*\btimezone=(\S+)\s*$/);
  if (tz) {
    timezone = tz[1];
    body = body.slice(0, tz.index).trim();
  }
  const thresholds: AlertThreshold[] = [];
  for (const piece of body.split(/\s,\s/)) {
    const m = piece.trim().match(ENTRY);
    if (!m) return undefined;
    const nums = m[4].trim() === '' ? [] : m[4].trim().split(/\s+/).map(Number);
    if (nums.length > 3 || nums.some(n => !Number.isFinite(n))) return undefined;
    const entry: AlertThreshold = { operator: m[3] };
    if (m[1] && m[2]) entry.window = { start: m[1].padStart(5, '0'), end: m[2].padStart(5, '0') };
    (['warn', 'error', 'critical'] as const).forEach((level, i) => {
      if (nums[i] !== undefined) entry[level] = nums[i];
    });
    thresholds.push(entry);
  }
  return timezone ? { thresholds, timezone } : { thresholds };
}

/** Copy of a datapoint-like object with alertThresholds/timezone folded into alertExpr (inputs are not modified). */
export function applyAlertThresholds<T extends Record<string, any>>(entry: T): T {
  if (!entry || typeof entry !== 'object' || entry.alertThresholds === undefined) return entry;
  const { alertThresholds, timezone, ...rest } = entry as any;
  return { ...rest, alertExpr: buildAlertExpr(alertThresholds, timezone) };
}

/** Add `alertThresholdsParsed` next to alertExpr when it uses a time window or timezone. */
export function withParsedThreshold<T extends Record<string, any>>(dp: T, field = 'alertExpr'): T {
  const parsed = parseAlertExpr((dp as any)?.[field]);
  if (!parsed || (!parsed.timezone && !parsed.thresholds.some(t => t.window))) return dp;
  return { ...dp, [`${field}Parsed`]: parsed };
}
