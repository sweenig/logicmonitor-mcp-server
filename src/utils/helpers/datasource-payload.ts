/**
 * Request-body defaults and checks for create_datasource / update_datasource.
 *
 * collectorAttribute and autoDiscoveryConfig.method are polymorphic in LogicMonitor, discriminated by
 * their "name" (script, batchscript, ... / ad_script). A script DataSource sent without that name is
 * answered with 400 "Invalid type", and an autoDiscoveryConfig whose instanceAutoGroupMethodParams is
 * null with 500 "Database operation failure". These fill in what a stock DataSource has so that a
 * minimal definition works. On update only the discriminators and null fixes apply, because adding
 * empty script fields to a partial update would blank scripts that are already saved.
 */

import { parseJsonObject } from './coerce.js';
import { InvalidArgumentError } from '../core/error-handler.js';

const SCRIPT_METHODS = new Set(['script', 'batchscript']);
const EMPTY_SCRIPT_FIELDS = ['linuxCmdline', 'linuxScript', 'windowsCmdline', 'windowsScript'];

function asObject(value: unknown, field: string): Record<string, any> {
  const parsed = parseJsonObject(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new InvalidArgumentError(`${field} must be an object`);
  }
  return { ...(parsed as Record<string, any>) };
}

/** collectorAttribute with "name" defaulted from collectMethod and, for script methods on create, the unused script fields set to "". */
export function normalizeCollectorAttribute(attribute: unknown, collectMethod: unknown, forCreate: boolean): unknown {
  if (attribute === undefined) return attribute;
  const result = asObject(attribute, 'collectorAttribute');
  if (result.name === undefined && typeof collectMethod === 'string' && collectMethod !== '') {
    result.name = collectMethod;
  }
  if (forCreate && SCRIPT_METHODS.has(String(collectMethod))) {
    for (const field of EMPTY_SCRIPT_FIELDS) {
      if (result[field] === undefined || result[field] === null) result[field] = '';
    }
  }
  return result;
}

/**
 * autoDiscoveryConfig with instanceAutoGroupMethodParams as a string (null becomes ""), and the
 * discovery method completed when it only carries a script: name "ad_script", type "embeded" (the
 * spelling LogicMonitor uses). On create, instanceAutoGroupMethodParams and filters are defaulted too.
 */
export function normalizeAutoDiscoveryConfig(config: unknown, forCreate: boolean): unknown {
  if (config === undefined) return config;
  const result = asObject(config, 'autoDiscoveryConfig');

  const params = result.instanceAutoGroupMethodParams;
  if (params === null || (params === undefined && forCreate)) {
    result.instanceAutoGroupMethodParams = '';
  } else if (params !== undefined && typeof params !== 'string') {
    throw new InvalidArgumentError('autoDiscoveryConfig.instanceAutoGroupMethodParams must be a string (use "" for none)');
  }

  if (result.method !== undefined && result.method !== null) {
    const method = asObject(result.method, 'autoDiscoveryConfig.method');
    const hasScript = typeof method.groovyScript === 'string' && method.groovyScript !== '';
    if (method.name === undefined && hasScript) method.name = 'ad_script';
    if (method.name === 'ad_script' && method.type === undefined && hasScript) method.type = 'embeded';
    result.method = method;
  }

  if (result.filters === undefined && forCreate) result.filters = [];
  return result;
}

/**
 * LogicMonitor replaces a datapoint with exactly what an update sends, so every field left out is
 * reset: an empty rawDataFieldName, for one, leaves a script datapoint with "uses an unknown raw
 * datapoint" and no data, and a missing originId breaks the datapoint's link to its graphs. Callers
 * copy datapoints from get_datasource, which does not show everything, or send little more than the
 * id. For each datapoint sent with an id, fill in every field it leaves out from the saved
 * datapoint with that id (this only completes the datapoints that are sent; see findDroppedDatapoints
 * for the ones that are not); what the caller does send wins (send "" to clear a field). Datapoints
 * without an id are new and are left alone. The saved datapoint's dataSourceId is not carried over,
 * an empty originId is not (that would blank the identity), and saved status display names are copied
 * without their ids.
 */
export function fillDatapointsFromSaved(sent: unknown[], saved: unknown[]): unknown[] {
  const savedById = new Map<string, Record<string, any>>();
  for (const dp of saved) {
    if (dp && typeof dp === 'object' && (dp as any).id !== undefined) savedById.set(String((dp as any).id), dp as Record<string, any>);
  }
  return sent.map(dp => {
    if (!dp || typeof dp !== 'object' || (dp as any).id === undefined) return dp;
    const current = savedById.get(String((dp as any).id));
    if (!current) return dp;
    const filled: Record<string, any> = { ...(dp as Record<string, any>) };
    for (const [key, value] of Object.entries(current)) {
      if (key === 'dataSourceId' || filled[key] !== undefined || value === undefined || value === null) continue;
      if (key === 'originId' && value === '') continue;
      filled[key] = key === 'statusDisplayNames' && Array.isArray(value)
        ? value.map((s: any) => ({ statusDisplayName: s.statusDisplayName, operator: s.operator, metricValue: s.metricValue }))
        : value;
    }
    return filled;
  });
}

/**
 * The saved datapoints that an update's datapoint list would delete. LogicMonitor replaces the whole
 * list, so a saved datapoint whose id is not in the list is deleted, and its collected history with it,
 * permanently. A datapoint sent without an id is created as a new one, so it does not keep a saved
 * datapoint of the same name either.
 */
export function findDroppedDatapoints(sent: unknown[], saved: unknown[]): Array<{ id: unknown; name: unknown }> {
  const kept = new Set<string>();
  for (const dp of sent) {
    if (dp && typeof dp === 'object' && (dp as any).id !== undefined && (dp as any).id !== null) kept.add(String((dp as any).id));
  }
  const dropped: Array<{ id: unknown; name: unknown }> = [];
  for (const dp of saved) {
    if (dp && typeof dp === 'object' && (dp as any).id !== undefined && !kept.has(String((dp as any).id))) {
      dropped.push({ id: (dp as any).id, name: (dp as any).name });
    }
  }
  return dropped;
}
