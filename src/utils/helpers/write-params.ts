/**
 * Translation of convenient tool arguments into the request fields LogicMonitor expects, for the
 * write tools whose raw API shape is awkward (alert rule matching, OpsNote scopes).
 */

export const ALERT_RULE_LEVELS: Record<string, string> = {
  all: 'All',
  warn: 'Warn',
  warning: 'Warn',
  error: 'Error',
  critical: 'Critical',
};

import { parseJsonArray } from './coerce.js';

function toStringList(input: unknown): string[] {
  const value = parseJsonArray(input);
  if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(item => item !== '');
  if (typeof value === 'string') return value.split(',').map(item => item.trim()).filter(item => item !== '');
  return [];
}

/**
 * The matching conditions of an alert rule (which resources, groups, datasources,
 * datapoints and severities it applies to), as API fields. Only the conditions that were given are
 * returned, so an update changes nothing else. `datasources` (array) is the older argument name for
 * `datasource` and is joined with commas.
 */
export function alertRuleMatch(args: Record<string, any>): Record<string, any> {
  const match: Record<string, any> = {};

  if (args.devices !== undefined) match.devices = toStringList(args.devices);
  if (args.deviceGroups !== undefined) match.deviceGroups = toStringList(args.deviceGroups);

  const datasource = args.datasource ?? args.datasources;
  if (datasource !== undefined) match.datasource = toStringList(datasource).join(',');
  if (args.datapoint !== undefined) match.datapoint = String(args.datapoint);

  if (args.severity !== undefined) {
    const level = ALERT_RULE_LEVELS[String(args.severity).trim().toLowerCase()];
    if (!level) {
      throw new Error(`severity must be one of: ${Object.keys(ALERT_RULE_LEVELS).join(', ')} (got "${args.severity}")`);
    }
    match.levelStr = level;
  }
  return match;
}

/**
 * OpsNote tags as the API wants them, objects with a name. Plain strings are accepted and wrapped.
 */
export function opsNoteTags(value: unknown): Array<Record<string, any>> | undefined {
  const list = parseJsonArray(value);
  if (!Array.isArray(list)) return undefined;
  return list.map(tag => (typeof tag === 'string' ? { name: tag } : tag));
}

/**
 * The scopes of an OpsNote: any explicit `scopes` plus one scope for each of deviceId, deviceGroupId
 * and websiteId that was given.
 */
export function opsNoteScopes(args: Record<string, any>): any[] | undefined {
  const explicit = parseJsonArray(args.scopes);
  const scopes: any[] = Array.isArray(explicit) ? [...explicit] : [];
  let given = Array.isArray(explicit);
  if (args.deviceId !== undefined) { scopes.push({ type: 'device', deviceId: args.deviceId }); given = true; }
  if (args.deviceGroupId !== undefined) { scopes.push({ type: 'deviceGroup', groupId: args.deviceGroupId }); given = true; }
  if (args.websiteId !== undefined) { scopes.push({ type: 'website', websiteId: args.websiteId }); given = true; }
  return given ? scopes : undefined;
}
