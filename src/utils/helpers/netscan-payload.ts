/**
 * Request bodies for network discovery scans (NetScans, /setting/netscans).
 *
 * A NetScan has a method that decides how devices are found and which other settings apply:
 * nmap (scan a subnet), script (a script or CSV lists the devices) and enhancedScript (a script
 * plus credentials, filters and an update policy). See knowledge/netscans.md. The EC2 method
 * (nec2) is not offered: LogicMonitor says cloud resources must be onboarded through the cloud
 * monitoring setup, not through a NetScan.
 */

import { isTrue, parseJsonArray, parseJsonObject, toNumberIfNumeric } from './coerce.js';
import { InvalidArgumentError } from '../core/error-handler.js';

export const NETSCAN_METHODS = ['nmap', 'script', 'enhancedScript'];
export const SCHEDULE_TYPES = ['manual', 'hourly', 'daily', 'weekly', 'monthly'];

const NMAP_ONLY = ['subnet', 'exclude', 'ports', 'includeNetworkAndBroadcast'];
const SCRIPT_ONLY = [
  'scriptType', 'groovyScript', 'groovyScriptParams', 'windowsScript', 'windowsScriptParams',
  'linuxScript', 'linuxScriptParams', 'scriptPath', 'scriptParams',
];
const ENHANCED_ONLY = ['filters', 'resourceUpdateCriteria'];

function asObject(value: unknown, name: string): Record<string, any> {
  const parsed = parseJsonObject(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new InvalidArgumentError(`${name} must be an object`);
  }
  return parsed as Record<string, any>;
}

/** The schedule: {type, cron, timezone, notify, recipients}. A bare "manual" is accepted. */
export function normalizeSchedule(value: unknown): Record<string, any> {
  if (value === undefined) return { type: 'manual' };
  if (typeof value === 'string' && !value.trim().startsWith('{')) {
    if (value.trim() === 'manual') return { type: 'manual' };
    throw new InvalidArgumentError('schedule must be an object like {type: "daily", cron: "00 04 * * *", timezone: "America/Chicago"}, or "manual"');
  }
  const schedule = { ...asObject(value, 'schedule') };
  if (!SCHEDULE_TYPES.includes(schedule.type)) {
    throw new InvalidArgumentError(`schedule.type must be one of ${SCHEDULE_TYPES.join(', ')}`);
  }
  if (schedule.type !== 'manual' && !schedule.cron) {
    throw new InvalidArgumentError(`schedule.cron is required when schedule.type is "${schedule.type}" (a cron expression such as "00 04 * * *"; LogicMonitor rejects a timed schedule without one)`);
  }
  if (schedule.notify !== undefined) schedule.notify = isTrue(schedule.notify);
  if (schedule.recipients !== undefined) schedule.recipients = parseJsonArray(schedule.recipients);
  return schedule;
}

/** Duplicate handling: type 1 any monitored device, 2 already found by this scan, 3 in groups, 4 on collectors. */
export function normalizeDuplicate(args: Record<string, any>): Record<string, any> | undefined {
  const given = args.duplicate !== undefined ? { ...asObject(args.duplicate, 'duplicate') } : undefined;
  const legacyType = args.excludeDuplicateType !== undefined ? toNumberIfNumeric(args.excludeDuplicateType) : undefined;
  if (!given && legacyType === undefined) return undefined;
  const duplicate: Record<string, any> = given ?? {};
  if (duplicate.type === undefined && legacyType !== undefined) duplicate.type = legacyType;
  duplicate.type = toNumberIfNumeric(duplicate.type);
  if (![1, 2, 3, 4].includes(duplicate.type)) {
    throw new InvalidArgumentError('duplicate.type must be 1 (matches any monitored device), 2 (already found by this scan), 3 (in the given groups) or 4 (on the given collectors)');
  }
  if (duplicate.groups !== undefined) duplicate.groups = parseJsonArray(duplicate.groups);
  if (duplicate.collectors !== undefined) duplicate.collectors = parseJsonArray(duplicate.collectors);
  return duplicate;
}

function ports(value: unknown): Record<string, any> {
  if (value === undefined) return { isGlobalDefault: true, value: '' };
  if (typeof value === 'string' && !value.trim().startsWith('{')) {
    return { isGlobalDefault: false, value: value.trim() };
  }
  const given = asObject(value, 'ports');
  return { isGlobalDefault: given.isGlobalDefault === undefined ? false : isTrue(given.isGlobalDefault), value: given.value ?? '' };
}

/** The discovered-device rules (ddr) of an nmap scan, with a catch-all rule when only a group is given. */
function ddr(args: Record<string, any>): Record<string, any> | undefined {
  let rules: Record<string, any> | undefined = args.ddr !== undefined ? { ...asObject(args.ddr, 'ddr') } : undefined;
  if (args.defaultGroup !== undefined && !(rules && Array.isArray(rules.assignment) && rules.assignment.length)) {
    rules = {
      ...(rules ?? {}),
      assignment: [{
        group: toNumberIfNumeric(args.defaultGroup), action: 'Include', disableAlerting: false, type: 1, query: '',
      }],
    };
  }
  if (rules?.assignment !== undefined) {
    rules.assignment = (parseJsonArray(rules.assignment) as any[]).map(rule => ({ type: 1, query: '', ...rule }));
  }
  return rules;
}

function checkMethodFields(method: string, args: Record<string, any>): void {
  const foreign: string[] = [];
  if (method !== 'nmap') foreign.push(...NMAP_ONLY.filter(field => args[field] !== undefined));
  if (method === 'nmap') foreign.push(...SCRIPT_ONLY.filter(field => args[field] !== undefined));
  if (method !== 'enhancedScript') foreign.push(...ENHANCED_ONLY.filter(field => args[field] !== undefined));
  if (foreign.length) {
    const why = method === 'nmap'
      ? 'those belong to script scans'
      : method === 'script'
        ? 'those belong to nmap scans (subnet settings) or enhancedScript scans (filters and update policy)'
        : 'those belong to nmap scans (subnet settings)';
    throw new InvalidArgumentError(`${foreign.join(', ')} ${foreign.length === 1 ? 'does' : 'do'} not apply to a ${method} scan (${why})`);
  }
}

function scriptSettings(args: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const field of SCRIPT_ONLY) {
    if (args[field] !== undefined) out[field] = args[field];
  }
  if (out.scriptType === 'embedded') out.scriptType = 'embeded'; // LogicMonitor's own spelling
  if (out.scriptType !== undefined && !['embeded', 'external'].includes(out.scriptType)) {
    throw new InvalidArgumentError('scriptType must be "embeded" (script text in groovyScript; "embedded" is accepted too) or "external" (a file named in scriptPath on the collector)');
  }
  return out;
}

function commonSettings(args: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  if (args.name !== undefined) out.name = args.name;
  if (args.description !== undefined) out.description = args.description;
  if (args.nsgId !== undefined) out.nsgId = toNumberIfNumeric(args.nsgId);
  if (args.collectorId !== undefined) out.collector = toNumberIfNumeric(args.collectorId);
  if (args.credentials !== undefined) out.credentials = asObject(args.credentials, 'credentials');
  if (args.filters !== undefined) out.filters = parseJsonArray(args.filters);
  if (args.resourceUpdateCriteria !== undefined) out.resourceUpdateCriteria = asObject(args.resourceUpdateCriteria, 'resourceUpdateCriteria');
  return out;
}

/** The body of a new NetScan; throws a clear error for anything LogicMonitor would reject. */
export function buildNetscanCreate(args: Record<string, any>): Record<string, any> {
  if (!args.name) throw new InvalidArgumentError('name is required');
  if (!NETSCAN_METHODS.includes(args.method)) {
    throw new InvalidArgumentError(`method must be one of ${NETSCAN_METHODS.join(', ')}: nmap scans a subnet, script lists devices from a script or CSV file, enhancedScript adds credentials, filters and an update policy`);
  }
  if (args.collectorId === undefined) {
    throw new InvalidArgumentError('collectorId is required (the collector that runs the scan; find it with list_collectors)');
  }
  checkMethodFields(args.method, args);

  const body: Record<string, any> = {
    ...commonSettings(args),
    method: args.method,
    schedule: normalizeSchedule(args.schedule),
    duplicate: normalizeDuplicate(args) ?? { type: 1 },
  };

  if (args.method === 'nmap') {
    if (!args.subnet) throw new InvalidArgumentError('subnet is required for an nmap scan (CIDR such as "10.0.1.0/24", or an IP range)');
    body.subnet = args.subnet;
    if (args.exclude !== undefined) body.exclude = args.exclude;
    if (args.includeNetworkAndBroadcast !== undefined) body.includeNetworkAndBroadcast = isTrue(args.includeNetworkAndBroadcast);
    body.ports = ports(args.ports);
    const rules = ddr(args);
    if (rules) body.ddr = rules;
    return body;
  }

  Object.assign(body, scriptSettings(args));
  body.scriptType = body.scriptType ?? 'embeded';
  if (body.scriptType === 'embeded' && !body.groovyScript && !body.windowsScript && !body.linuxScript) {
    throw new InvalidArgumentError('an embedded script scan needs groovyScript (the script text); use scriptType "external" with scriptPath for a file on the collector');
  }
  if (body.scriptType === 'external' && !body.scriptPath) {
    throw new InvalidArgumentError('an external script scan needs scriptPath (the script or CSV file on the collector)');
  }
  if (args.defaultGroup !== undefined) body.defaultGroup = toNumberIfNumeric(args.defaultGroup);
  return body;
}

/**
 * Whether an update has to know the scan's method (to route defaultGroup and to reject settings that
 * belong to another method); the handler then looks it up.
 */
export function updateNeedsMethod(args: Record<string, any>): boolean {
  return args.defaultGroup !== undefined
    || args.ddr !== undefined
    || [...NMAP_ONLY, ...SCRIPT_ONLY, ...ENHANCED_ONLY].some(field => args[field] !== undefined);
}

/** The fields to change on an existing NetScan. The method cannot be changed. */
export function buildNetscanUpdate(args: Record<string, any>, method?: string): Record<string, any> {
  if (args.method !== undefined) {
    throw new InvalidArgumentError('method cannot be changed; create a new scan instead');
  }
  if (method) checkMethodFields(method, args);

  const body: Record<string, any> = commonSettings(args);
  if (args.schedule !== undefined) body.schedule = normalizeSchedule(args.schedule);
  const duplicate = normalizeDuplicate(args);
  if (duplicate) body.duplicate = duplicate;

  if (method === 'nmap') {
    if (args.subnet !== undefined) body.subnet = args.subnet;
    if (args.exclude !== undefined) body.exclude = args.exclude;
    if (args.includeNetworkAndBroadcast !== undefined) body.includeNetworkAndBroadcast = isTrue(args.includeNetworkAndBroadcast);
    if (args.ports !== undefined) body.ports = ports(args.ports);
    const rules = ddr(args);
    if (rules) body.ddr = rules;
  } else if (method) {
    Object.assign(body, scriptSettings(args));
    if (args.defaultGroup !== undefined) body.defaultGroup = toNumberIfNumeric(args.defaultGroup);
  }
  return body;
}
