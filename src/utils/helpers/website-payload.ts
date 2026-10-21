/**
 * Request bodies for website monitors (/website/websites).
 *
 * A website has a type (webcheck: HTTP/HTTPS, or pingcheck: ICMP) and a location (internal: run by
 * collectors, or external: run by LogicMonitor's cloud checkpoints). See knowledge/websites.md.
 * The location part of the body (isInternal, testLocation, useDefaultLocationSetting) is built by
 * the handler, which needs the checkpoint list; everything else is built here.
 */

import { isTrue, parseJsonArray, toNumberIfNumeric } from './coerce.js';

export const WEBSITE_TYPES = ['webcheck', 'pingcheck'];
export const ALERT_LEVELS = ['warn', 'error', 'critical'];
export const TRANSITIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 30, 60];

const COMMON_NUMBER_FIELDS = ['groupId', 'pollingInterval', 'transition', 'globalSmAlertCond'];
const COMMON_BOOLEAN_FIELDS = ['individualSmAlertEnable', 'disableAlerting', 'stopMonitoring', 'useDefaultAlertSetting'];
const COMMON_STRING_FIELDS = ['name', 'description', 'overallAlertLevel', 'individualAlertLevel'];

const WEB_ONLY_NUMBER_FIELDS = ['pageLoadAlertTimeInMS'];
const WEB_ONLY_BOOLEAN_FIELDS = ['ignoreSSL', 'triggerSSLStatusAlert', 'triggerSSLExpirationAlert'];
const WEB_ONLY_STRING_FIELDS = ['domain', 'schema', 'alertExpr'];

const PING_ONLY_NUMBER_FIELDS = ['count', 'percentPktsNotReceiveInTime', 'timeoutInMSPktsNotReceive'];
const PING_ONLY_STRING_FIELDS = ['host'];

const WEB_ONLY = [...WEB_ONLY_NUMBER_FIELDS, ...WEB_ONLY_BOOLEAN_FIELDS, ...WEB_ONLY_STRING_FIELDS, 'steps'];
const PING_ONLY = [...PING_ONLY_NUMBER_FIELDS, ...PING_ONLY_STRING_FIELDS];

function pick(args: Record<string, any>, numbers: string[], booleans: string[], strings: string[]): Record<string, any> {
  const out: Record<string, any> = {};
  for (const field of numbers) {
    if (args[field] !== undefined) out[field] = toNumberIfNumeric(args[field]);
  }
  for (const field of booleans) {
    if (args[field] !== undefined) out[field] = isTrue(args[field]);
  }
  for (const field of strings) {
    if (args[field] !== undefined) out[field] = args[field];
  }
  return out;
}

/** The step fields LogicMonitor expects, filled in for a step that only names what it cares about. */
export function normalizeSteps(steps: unknown, defaultSchema = 'https'): any[] {
  const list = parseJsonArray(steps);
  if (!Array.isArray(list)) {
    throw new Error('steps must be an array of step objects');
  }
  return list.map((step: any, index: number) => ({
    type: 'config',
    name: `__step${index}`,
    enable: true,
    HTTPMethod: 'GET',
    url: '/',
    schema: defaultSchema,
    HTTPVersion: '1.1',
    followRedirection: true,
    timeout: 30,
    matchType: 'plain',
    statusCode: '200',
    useDefaultRoot: true,
    reqType: 'config',
    respType: 'config',
    ...step,
  }));
}

function validate(fields: Record<string, any>): void {
  const interval = fields.pollingInterval;
  if (interval !== undefined && !(Number.isInteger(interval) && interval >= 1 && interval <= 10)) {
    throw new Error('pollingInterval must be a whole number of minutes from 1 to 10');
  }
  const transition = fields.transition;
  if (transition !== undefined && !TRANSITIONS.includes(transition)) {
    throw new Error(`transition must be one of ${TRANSITIONS.join(', ')}`);
  }
  for (const field of ['overallAlertLevel', 'individualAlertLevel']) {
    if (fields[field] !== undefined && !ALERT_LEVELS.includes(fields[field])) {
      throw new Error(`${field} must be one of ${ALERT_LEVELS.join(', ')}`);
    }
  }
  if (fields.schema !== undefined && !['http', 'https'].includes(fields.schema)) {
    throw new Error('schema must be "http" or "https"');
  }
}

/** The non-location part of the body for a new website; throws a clear error for invalid combinations. */
export function buildWebsiteCreate(args: Record<string, any>): Record<string, any> {
  if (!args.name) throw new Error('name is required');
  if (!WEBSITE_TYPES.includes(args.type)) {
    throw new Error(`type must be "webcheck" (HTTP/HTTPS) or "pingcheck" (ICMP ping), got "${args.type}"`);
  }
  const isWeb = args.type === 'webcheck';

  const wrong = (isWeb ? PING_ONLY : WEB_ONLY).filter(field => args[field] !== undefined);
  if (wrong.length) {
    throw new Error(
      `${wrong.join(', ')} ${wrong.length === 1 ? 'does' : 'do'} not apply to a ${args.type}` +
      (isWeb ? ' (those are ping check settings)' : ' (those are web check settings)'),
    );
  }

  const fields = {
    ...pick(args, COMMON_NUMBER_FIELDS, COMMON_BOOLEAN_FIELDS, COMMON_STRING_FIELDS),
    ...(isWeb
      ? pick(args, WEB_ONLY_NUMBER_FIELDS, WEB_ONLY_BOOLEAN_FIELDS, WEB_ONLY_STRING_FIELDS)
      : pick(args, PING_ONLY_NUMBER_FIELDS, [], PING_ONLY_STRING_FIELDS)),
  };
  validate(fields);

  if (isWeb) {
    if (!fields.domain) throw new Error('domain is required for a webcheck (for example "www.example.com", without the scheme)');
    fields.schema = fields.schema ?? 'https';
    const given = parseJsonArray(args.steps);
    fields.steps = args.steps !== undefined && !(Array.isArray(given) && given.length === 0)
      ? normalizeSteps(given, fields.schema)
      : normalizeSteps([{}], fields.schema);
  } else if (!fields.host) {
    throw new Error('host is required for a pingcheck (hostname or IP address, without a scheme)');
  }

  return { type: args.type, ...fields };
}

/** The non-location fields to change on an existing website. */
export function buildWebsiteUpdate(args: Record<string, any>): Record<string, any> {
  const fields = {
    ...pick(args, COMMON_NUMBER_FIELDS, COMMON_BOOLEAN_FIELDS, COMMON_STRING_FIELDS),
    ...pick(args, [...WEB_ONLY_NUMBER_FIELDS, ...PING_ONLY_NUMBER_FIELDS], WEB_ONLY_BOOLEAN_FIELDS, [...WEB_ONLY_STRING_FIELDS, ...PING_ONLY_STRING_FIELDS]),
  };
  validate(fields);
  if (args.steps !== undefined) fields.steps = normalizeSteps(args.steps, fields.schema ?? 'https');
  return fields;
}
