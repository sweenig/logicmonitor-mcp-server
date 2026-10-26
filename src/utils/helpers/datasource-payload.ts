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
