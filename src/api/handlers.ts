/**
 * LogicMonitor MCP Tool Handlers
 *
 * Implementation of tool handlers for LogicMonitor API operations
 */

import { LogicMonitorClient } from './client.js';
import { batchProcessor, smartBatchProcessor as _smartBatchProcessor } from '../utils/helpers/batch-processor.js';
import { isTrue, parseJsonArray, parseJsonObject } from '../utils/helpers/coerce.js';
import { applyColumnChanges, applyTableColumnChanges, ColumnChange, defaultAlertColumns, TableColumnChange } from '../utils/helpers/widget-columns.js';
import { isAcceptedTopX, topXErrorMessage } from '../utils/helpers/widget-top-x.js';
import { findWidgetReferences, WIDGET_REFERENCE_FIELDS } from '../utils/helpers/widget-references.js';
import { buildNetscanCreate, buildNetscanUpdate, updateNeedsMethod } from '../utils/helpers/netscan-payload.js';
import { buildWebsiteCreate, buildWebsiteUpdate } from '../utils/helpers/website-payload.js';
import { websiteCheckpointRows } from '../utils/helpers/website-data.js';
import { alertRuleMatch, opsNoteScopes, opsNoteTags } from '../utils/helpers/write-params.js';
import { autoFormatFilter, escapeFilterValue, SEARCH_FIELDS } from '../utils/helpers/filters.js';
import { extractDataSourceScripts, extractConfigSourceScripts } from '../utils/helpers/logicmodule-scripts.js';
import { toEpochSeconds, toEpochMillis } from '../utils/helpers/epoch.js';
import { curateDataSource, compactDataPoint } from '../utils/helpers/datasource-view.js';
import { normalizeCollectorAttribute, normalizeAutoDiscoveryConfig, mergeAutoDiscoveryConfig, fillDatapointsFromSaved, findDroppedDatapoints, findDroppedConfigChecks } from '../utils/helpers/datasource-payload.js';
import { parseDiscoveryOutput, evaluateDatapoints, stripReturnHeader, datapointWarnings, describeScriptRun } from '../utils/helpers/datasource-test.js';
import { buildGraphBody } from '../utils/helpers/datasource-graph.js';
import { runDebugCommand, fetchDebugResult, normalizeWaitSeconds } from '../utils/helpers/debug-command.js';
import { compactWriteResult, isConciseResultTool } from '../utils/helpers/write-result.js';
import { findMissingRequired, findUnknownArguments, acceptedParameterNames, applyIdAlias, applyParameterAliases } from '../utils/helpers/validate-args.js';
import { getLogicMonitorTools } from './tools.js';
import { applyAlertThresholds, withParsedThreshold } from '../utils/helpers/alert-thresholds.js';
import { describeAlertIntervals, datapointIntervalWarnings, anyOccurrenceWarning } from '../utils/helpers/alert-intervals.js';
import { planNestedFields, projectResult, capRows, capRowsToSize, capText, compactRoles } from '../utils/helpers/output-limits.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { LogicMonitorApiError } from '../utils/core/lm-error.js';
import { MCPError, ErrorCodes, ErrorSuggestions, InvalidArgumentError, createMCPError } from '../utils/core/error-handler.js';

// Default field sets for curated responses (when no fields parameter specified)
const DEFAULT_DEVICE_FIELDS = [
  'id', 'displayName', 'name', 'hostGroupIds', 'preferredCollectorId',
  'hostStatus', 'alertStatus', 'alertStatusPriority', 'disableAlerting',
  'customProperties', 'sdtStatus',
];

const DEFAULT_ALERT_FIELDS = [
  'id', 'internalId', 'type', 'startEpoch', 'endEpoch', 'acked', 'ackedBy',
  'severity', 'cleared', 'monitorObjectName', 'instanceName', 'dataPointName',
  'alertValue', 'threshold', 'resourceId', 'resourceTemplateName',
];

const DEFAULT_COLLECTOR_FIELDS = [
  'id', 'description', 'hostname', 'platform', 'status', 'isDown', 'build',
  'numberOfHosts', 'numberOfInstances', 'collectorGroupName', 'collectorDeviceId',
  'escalatingChainId', 'suppressAlertClear',
];

const DEFAULT_DATASOURCE_FIELDS = [
  'id', 'name', 'displayName', 'description', 'group',
  'dataSourceType', 'collectMethod', 'hasMultiInstances',
];

const DEFAULT_DASHBOARD_FIELDS = [
  'id', 'name', 'description', 'groupId', 'groupName',
  'widgetsConfigVersion', 'widgetTokens', 'defaultDashboardFilters',
];

const DEFAULT_WIDGET_FIELDS = [
  'id', 'name', 'description', 'type', 'dashboardId', 'theme',
  'interval', 'timescale', 'lastUpdatedOn', 'lastUpdatedBy',
];

const DEFAULT_WEBSITE_FIELDS = [
  'id', 'name', 'description', 'type', 'schema', 'domain', 'host', 'isInternal', 'groupId',
  'pollingInterval', 'status', 'stopMonitoring', 'overallAlertLevel',
];

const DEFAULT_USER_FIELDS = [
  'id', 'username', 'email', 'firstName', 'lastName', 'roles',
  'status', 'lastAction',
];

const DEFAULT_ROLE_FIELDS = [
  'id', 'name', 'description', 'roleGroupId',
  'customHelpLabel', 'customHelpURL', 'privileges',
];

const DEFAULT_SDT_FIELDS = [
  'id', 'type', 'admin', 'comment', 'startDateTime', 'endDateTime',
  'duration', 'isEffective', 'deviceId', 'deviceDisplayName',
  'dataSourceId', 'dataSourceName', 'deviceDataSourceId', 'dataSourceInstanceId',
  'dataSourceInstanceName',
];

const DEFAULT_DEVICE_GROUP_FIELDS = [
  'id', 'name', 'fullPath', 'description', 'parentId', 'numOfHosts',
  'numOfDirectDevices', 'disableAlerting', 'alertStatus',
];

const DEFAULT_DASHBOARD_GROUP_FIELDS = [
  'id', 'name', 'description', 'parentId', 'numOfDashboards',
  'fullPath',
];

const DEFAULT_WEBSITE_GROUP_FIELDS = [
  'id', 'name', 'description', 'parentId', 'fullPath',
  'numOfWebsites', 'disableAlerting', 'stopMonitoring',
];

const DEFAULT_REPORT_FIELDS = [
  'id', 'name', 'description', 'type', 'groupId', 'groupName',
  'scheduleTimezone', 'format', 'lastGenerateOn', 'lastGenerateSize',
];

const DEFAULT_CONFIGSOURCE_FIELDS = [
  'id', 'name', 'displayName', 'description', 'appliesTo', 'group',
  'version', 'lineageId', 'hasMultiConfigs',
];

const DEFAULT_PROPERTYSOURCE_FIELDS = [
  'id', 'name', 'description', 'appliesTo', 'group',
  'scriptType', 'version', 'lineageId',
];

const DEFAULT_DEVICE_PROPERTY_FIELDS = [
  'name', 'value', 'type', 'inheritedFrom',
];

const DEFAULT_API_TOKEN_FIELDS = [
  'adminId', 'adminName', 'accessId', 'note',
  'status', 'lastUsedOn',
];

const DEFAULT_AUDIT_LOG_FIELDS = [
  'id', 'happenedOn', 'username', 'sessionId', 'ip',
  'description', 'userId',
];

const DEFAULT_INTEGRATION_LOG_FIELDS = [
  'id', 'happenedOnMs', 'integrationName', 'alertId',
  'alertInstanceId', 'httpResponseCode',
];

const DEFAULT_ACCESS_GROUP_FIELDS = [
  'id', 'name', 'description', 'tenantId',
  'numOfDevices', 'numOfUsers',
];

/**
 * Filter object to only include specified fields
 */
function filterFields<T extends Record<string, any>>(obj: T, fields: string[]): Partial<T> {
  const filtered: any = {};
  for (const field of fields) {
    if (field in obj) {
      filtered[field] = obj[field];
    }
  }
  return filtered;
}

/** test_datasource returns this many instances in full unless maxInstances says otherwise. */
const DEFAULT_TEST_MAX_INSTANCES = 5;

/** test_datasource cuts each script's raw output to this many characters unless verbose. */
const MAX_TEST_OUTPUT_CHARS = 2000;

/** Fields of a config version returned by list_resource_configs unless the caller asks for others (no config text or diff). */
const DEFAULT_CONFIG_VERSION_FIELDS = 'id,version,pollTimestamp,configStatus,changeStatus,comparedWith,configErrMsg,instanceName,dataSourceName,deviceDisplayName';

/** get_resource_config cuts the config text to this many characters unless maxChars says otherwise. */
const MAX_CONFIG_CHARS = 40000;

/** get_resource_config returns at most this many diff lines unless maxDiffLines says otherwise. */
const MAX_CONFIG_DIFF_LINES = 500;

/** Cut a config version's text and diff so one big config cannot overflow the client, and say what was left out. */
export function capConfigVersion(config: any, maxChars: number, maxDiffLines: number): any {
  if (!config || typeof config !== 'object') return config;
  const out: Record<string, any> = { ...config };
  const omitted: string[] = [];
  if (typeof out.config === 'string') {
    const cut = capText(out.config, Math.max(0, maxChars));
    if (cut.omitted > 0) {
      out.config = cut.text;
      omitted.push(`${cut.omitted} of ${cut.omitted + cut.text.length} characters of "config" (raise maxChars)`);
    }
  }
  if (Array.isArray(out.deltaConfig) && out.deltaConfig.length > maxDiffLines) {
    omitted.push(`${out.deltaConfig.length - Math.max(0, maxDiffLines)} of ${out.deltaConfig.length} "deltaConfig" lines (raise maxDiffLines)`);
    out.deltaConfig = out.deltaConfig.slice(0, Math.max(0, maxDiffLines));
  }
  if (omitted.length > 0) {
    out.truncated = true;
    out.truncationNote = `Left out: ${omitted.join('; ')}.`;
  }
  return out;
}

/** A config instance is "overdue" when it has not collected for this many collection intervals. */
const CONFIG_OVERDUE_INTERVALS = 2;

function formatAge(seconds: number): string {
  if (seconds < 90) return `${seconds} seconds`;
  if (seconds < 90 * 60) return `${Math.round(seconds / 60)} minutes`;
  if (seconds < 36 * 3600) return `${Math.round(seconds / 3600 * 10) / 10} hours`;
  return `${Math.round(seconds / 86400 * 10) / 10} days`;
}

/**
 * How long since a ConfigSource instance last collected its config. A version's pollTimestamp is only when the
 * config last CHANGED (a version is stored on change), so collection health comes from the instance's
 * lastCollectedTime. Status is "never" (no collection recorded), "ok", or "overdue" (older than
 * CONFIG_OVERDUE_INTERVALS x the ConfigSource's collection interval; without an interval only the age is given).
 */
export function describeConfigCollection(instance: any, collectIntervalSeconds: number | undefined, nowSeconds: number): Record<string, any> {
  const last = instance?.lastCollectedTime;
  const base: Record<string, any> = { alertStatus: instance?.alertStatus, lastConfigChangeTime: instance?.lastUpdatedTime };
  if (typeof last !== 'number' || last <= 0) {
    return { ...base, status: 'never', lastCollectedTime: null, summary: 'The instance exists but has never collected a config.' };
  }
  const secondsSinceCollected = Math.max(0, nowSeconds - last);
  const out: Record<string, any> = {
    ...base,
    lastCollectedTime: last,
    lastCollectedAt: new Date(last * 1000).toISOString(),
    secondsSinceCollected,
  };
  if (collectIntervalSeconds === undefined) {
    return { ...out, status: 'unknown', summary: `Last collected ${formatAge(secondsSinceCollected)} ago; the ConfigSource's collection interval could not be read, so no verdict.` };
  }
  const overdue = secondsSinceCollected > collectIntervalSeconds * CONFIG_OVERDUE_INTERVALS;
  return {
    ...out,
    collectIntervalSeconds,
    status: overdue ? 'overdue' : 'ok',
    summary: overdue
      ? `Last collected ${formatAge(secondsSinceCollected)} ago, more than ${CONFIG_OVERDUE_INTERVALS}x its ${formatAge(collectIntervalSeconds)} collection interval: it has stopped collecting.`
      : `Last collected ${formatAge(secondsSinceCollected)} ago (collection interval ${formatAge(collectIntervalSeconds)}): collecting normally.`,
  };
}

/** Largest list_* response (characters as sent, pretty-printed) returned whole; bigger ones are cut to the first items that fit. */
export const MAX_LIST_RESPONSE_CHARS = 40000;

/** A single string value longer than this is replaced by a placeholder when one item alone is over the limit. */
const MAX_LONG_STRING_CHARS = 2000;

/** Size of a response as formatResponse sends it. */
function sentSize(value: unknown): number {
  return JSON.stringify(value, null, 2).length;
}

/**
 * Keep a list response under maxChars, and say so in the response, so one broad filter cannot overflow
 * the client's token limit. First trailing items are dropped (at least one is kept); if that one item is
 * still too big (a collector asked for all fields carries ~70,000 characters of config files), its very
 * long string values are replaced by a placeholder naming their size. Responses already under the limit
 * are untouched.
 */
function capListResponse<T extends { items: any[] }>(result: T, maxChars: number, hint: string): T {
  if (sentSize(result) <= maxChars) return result;
  const items = result.items;
  // Binary search for the largest prefix that fits (at least one item is always kept).
  let lo = 1;
  let hi = items.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (sentSize({ ...result, items: items.slice(0, mid) }) <= maxChars) lo = mid;
    else hi = mid - 1;
  }
  let kept = items.slice(0, lo);
  const omittedFields = new Set<string>();
  if (sentSize({ ...result, items: kept }) > maxChars) {
    kept = kept.map(item => {
      if (!item || typeof item !== 'object') return item;
      const copy: Record<string, any> = { ...item };
      for (const [key, value] of Object.entries(copy)) {
        if (typeof value === 'string' && value.length > MAX_LONG_STRING_CHARS) {
          copy[key] = `[${value.length} characters omitted from the list view]`;
          omittedFields.add(key);
        }
      }
      return copy;
    });
  }
  const omittedNote = omittedFields.size > 0
    ? ` Long values replaced by a placeholder: ${[...omittedFields].join(', ')} (read them with the matching get tool).`
    : '';
  return {
    ...result,
    items: kept,
    truncated: true,
    truncationNote: `Response cut to the first ${lo} of ${items.length} items returned (over ${maxChars} characters). ${hint}${omittedNote}`,
  };
}

let toolIndex: Map<string, Tool> | undefined;
function toolsByName(): Map<string, Tool> {
  toolIndex ??= new Map(getLogicMonitorTools().map(t => [t.name, t]));
  return toolIndex;
}

// Type for progress notification callback
type ProgressCallback = (progress: number, total: number) => Promise<void>;

/**
 * True when a 403 message from LogicMonitor is about the caller's identity or rights (token, role,
 * permission) rather than about the state of the object; only those get "check your token" advice.
 */
export function looksLikePermissionDenial(message: string): boolean {
  return /permission|privilege|authori[sz]|forbidden|access (is )?denied|not allowed to|token|\brole\b|rbac|credential/i.test(message);
}

/** A groupId other than the root group (1) puts the dashboard in a folder. */
function inFolder(groupId: unknown): boolean {
  if (groupId === undefined || groupId === null || groupId === '') return false;
  return Number(groupId) !== 1;
}

function privateInFolderError(): InvalidArgumentError {
  return new InvalidArgumentError(
    'A dashboard in a folder must be public: LogicMonitor keeps a private dashboard in the root group. Use sharable:true with groupId, or omit sharable.'
  );
}

/**
 * Dashboard-level property filters as LogicMonitor stores them:
 * { defaultDashboardFilterDetails: [{ name, alias, type, label }] }. Accepts that object or just the
 * list (each as an object or a JSON string); `type` is RESOURCE_PROPERTY or INSTANCE_PROPERTY.
 */
function toDashboardFilters(value: unknown): { defaultDashboardFilterDetails: any[] } {
  const parsed: any = parseJsonObject(parseJsonArray(value));
  const list = Array.isArray(parsed) ? parsed : parsed?.defaultDashboardFilterDetails;
  if (!Array.isArray(list)) {
    throw new InvalidArgumentError(
      'defaultDashboardFilters must be a list of {name, type} (or {defaultDashboardFilterDetails:[...]}), with type RESOURCE_PROPERTY or INSTANCE_PROPERTY.'
    );
  }
  return {
    defaultDashboardFilterDetails: list.map((filter: any) => {
      if (!filter?.name || !['RESOURCE_PROPERTY', 'INSTANCE_PROPERTY'].includes(filter.type)) {
        throw new InvalidArgumentError(
          `Each dashboard filter needs a name and a type of RESOURCE_PROPERTY or INSTANCE_PROPERTY (got ${JSON.stringify(filter)}).`
        );
      }
      return { name: filter.name, alias: filter.alias ?? '', type: filter.type, label: filter.label ?? '' };
    }),
  };
}

export class LogicMonitorHandlers {
  constructor(private client: LogicMonitorClient) {}

  async handleToolCall(
    name: string,
    args: any,
    progressCallback?: ProgressCallback,
  ): Promise<any> {
    // returnFull only controls how the result is presented. Take it out of the arguments first:
    // several handlers pass their arguments on as the request body.
    let callArgs = args;
    let returnFull = false;
    if (args && typeof args === 'object' && 'returnFull' in args) {
      const { returnFull: requested, ...rest } = args;
      returnFull = isTrue(requested);
      callArgs = rest;
    }

    // excludeFields (list tools) only changes what is shown, so it is not passed on to the handlers.
    let excludeFields: string[] = [];
    if (name.startsWith('list_') && callArgs && typeof callArgs === 'object' && 'excludeFields' in callArgs) {
      const { excludeFields: requested, ...rest } = callArgs;
      excludeFields = String(requested ?? '').split(',').map(f => f.trim()).filter(Boolean);
      callArgs = rest;
    }

    let result = await this.runToolCall(name, callArgs, progressCallback);

    if (excludeFields.length > 0 && Array.isArray(result?.items)) {
      result = {
        ...result,
        items: result.items.map((item: any) => {
          if (!item || typeof item !== 'object') return item;
          const kept = { ...item };
          for (const field of excludeFields) delete kept[field];
          return kept;
        }),
      };
    }

    // One broad filter (or fields="*") on any list tool can return far more than a client accepts
    // (every resource's customProperties, every collector's config files); cut it to what fits.
    if (name.startsWith('list_') && Array.isArray(result?.items)) {
      return capListResponse(
        result,
        MAX_LIST_RESPONSE_CHARS,
        'Narrow the filter, page with size/offset, or pass fields= (for example "id,displayName") to get fewer fields per item.',
      );
    }

    // Create/update responses can be very large (a whole DataSource, a whole resource); shorten them
    // unless the caller asked for everything.
    return !returnFull && isConciseResultTool(name) ? compactWriteResult(result) : result;
  }

  /**
   * Find the ConfigSource instance a version list is for and say how long ago it last collected. Callers pass
   * either deviceDataSourceId + instanceId, or just configSourceId (the ConfigSource's id), in which case the
   * resource's instance is looked up, and a resource without one is reported as "never" instead of an error.
   */
  private async resolveConfigInstance(args: Record<string, any>): Promise<{
    deviceDataSourceId: number;
    instanceId: number;
    collection?: Record<string, any>;
    never?: Record<string, any>;
  }> {
    const { deviceId } = args;
    let deviceDataSourceId: number | undefined = args.deviceDataSourceId;
    let instanceId: number | undefined = args.instanceId;
    const configSourceId: number | undefined = args.configSourceId;

    if (deviceDataSourceId === undefined || instanceId === undefined) {
      if (configSourceId === undefined) {
        throw new InvalidArgumentError('Pass either configSourceId (the ConfigSource id), or both deviceDataSourceId and instanceId (from list_resource_datasources and list_resource_instances)');
      }
      if (deviceDataSourceId === undefined) {
        const applied: any = await this.client.listDeviceDataSources(deviceId, {
          filter: `dataSourceId:${configSourceId}`, fields: 'id,dataSourceId', size: 1,
        });
        if (!applied?.items?.length) {
          return {
            deviceDataSourceId: 0,
            instanceId: 0,
            never: {
              status: 'never',
              summary: `ConfigSource ${configSourceId} has no instance on resource ${deviceId}, so it has never collected a config. It does not apply to this resource (check its appliesTo against the resource's properties) or discovery has not created the instance yet (schedule_resource_discovery).`,
            },
          };
        }
        deviceDataSourceId = applied.items[0].id;
      }
      if (instanceId === undefined) {
        const all: any = await this.client.listDeviceDataSourceInstances(deviceId, deviceDataSourceId!, { fields: 'id', size: 1000 });
        const ids: number[] = (all?.items ?? []).map((i: any) => i.id);
        if (ids.length === 0) {
          return {
            deviceDataSourceId: deviceDataSourceId!,
            instanceId: 0,
            never: { status: 'never', summary: `ConfigSource ${configSourceId} is applied to resource ${deviceId} but has no instance, so it has never collected a config (schedule_resource_discovery).` },
          };
        }
        if (ids.length > 1) {
          throw new InvalidArgumentError(`ConfigSource ${configSourceId} has ${ids.length} instances on resource ${deviceId} (${ids.join(', ')}); pass instanceId to choose one`);
        }
        instanceId = ids[0];
      }
    }

    const instances: any = await this.client.listDeviceDataSourceInstances(deviceId, deviceDataSourceId!, {
      fields: 'id,dataSourceId,lastCollectedTime,lastUpdatedTime,alertStatus', size: 1000,
    });
    const instance = (instances?.items ?? []).find((i: any) => i.id === instanceId);
    if (!instance) {
      throw new InvalidArgumentError(`No instance ${instanceId} found under deviceDataSourceId ${deviceDataSourceId} on resource ${deviceId}; get both ids from list_resource_datasources and list_resource_instances`);
    }

    let collectIntervalSeconds: number | undefined;
    try {
      const source: any = await this.client.getConfigSource(configSourceId ?? instance.dataSourceId, { fields: 'collectInterval' });
      if (typeof source?.collectInterval === 'number' && source.collectInterval > 0) collectIntervalSeconds = source.collectInterval;
    } catch {
      // The interval only sharpens the verdict; without it the age is still reported.
    }

    return {
      deviceDataSourceId: deviceDataSourceId!,
      instanceId: instanceId!,
      collection: describeConfigCollection(instance, collectIntervalSeconds, Math.floor(Date.now() / 1000)),
    };
  }

  /**
   * The pollTimestamp of one config version. LogicMonitor ignores filters on the version list, so this pages
   * through ids and timestamps (newest first) until it finds the version.
   */
  private async findConfigPollTimestamp(deviceId: number, deviceDataSourceId: number, instanceId: number, configId: string): Promise<number> {
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
      const page: any = await this.client.listDeviceConfigSourceConfigs(deviceId, deviceDataSourceId, instanceId, {
        size: pageSize, offset, fields: 'id,pollTimestamp',
      });
      const items: any[] = page?.items ?? [];
      const found = items.find(item => item?.id === configId);
      if (found) return found.pollTimestamp;
      if (items.length < pageSize) {
        throw new InvalidArgumentError(
          `No config version "${configId}" found for instance ${instanceId}; get the id from list_resource_configs`,
        );
      }
    }
  }

  /** The fields of a website group request body (create or update) that were given. */
  private websiteGroupFields(args: Record<string, any>, includeName = false): Record<string, any> {
    const fields: Record<string, any> = {};
    if (includeName && args.name !== undefined) fields.name = args.name;
    if (args.description !== undefined) fields.description = args.description;
    if (args.parentId !== undefined && includeName) fields.parentId = args.parentId;
    if (args.disableAlerting !== undefined) fields.disableAlerting = isTrue(args.disableAlerting);
    if (args.stopMonitoring !== undefined) fields.stopMonitoring = isTrue(args.stopMonitoring);
    if (args.testLocation !== undefined) fields.testLocation = parseJsonObject(args.testLocation);
    if (args.properties !== undefined) fields.properties = parseJsonArray(args.properties);
    return fields;
  }

  /**
   * LogicMonitor replaces the whole autoDiscoveryConfig on update and rejects one without the discovery
   * method, so a partial config (just filters, say) is completed from the saved one (see
   * mergeAutoDiscoveryConfig). If the saved config cannot be read the update is refused: sending the
   * partial config would only fail with an unexplained 400.
   */
  private async completeAutoDiscoveryUpdate(dataSourceId: number, config: Record<string, any>): Promise<Record<string, any>> {
    try {
      const current: any = await this.client.getDataSource(dataSourceId, { fields: 'autoDiscoveryConfig' });
      return mergeAutoDiscoveryConfig(config, current?.autoDiscoveryConfig);
    } catch (error) {
      throw new MCPError(
        `Could not read the saved autoDiscoveryConfig of DataSource ${dataSourceId} to complete this update: ${error instanceof Error ? error.message : String(error)}`,
        ErrorCodes.INVALID_PARAMETERS,
        { dataSourceId },
        ['Retry; LogicMonitor replaces the whole autoDiscoveryConfig, so a partial one cannot be sent as it is'],
      );
    }
  }

  /**
   * LogicMonitor replaces the whole datapoint list on update. A saved datapoint that is not in the list
   * is deleted, and its collected history is lost permanently; a datapoint that is in it is replaced by
   * exactly what is sent (an omitted rawDataFieldName leaves a script datapoint with no data, a blank
   * originId breaks its graphs). So, before an update that carries dataPoints: read the saved
   * datapoints, refuse the update if it would drop any (unless the caller passed allowDatapointRemoval,
   * which is for when the user has explicitly asked to delete datapoints), and fill in the fields that
   * datapoints sent with an id leave out (see fillDatapointsFromSaved). If the saved datapoints cannot
   * be read the update is refused as well, because nothing can then be checked.
   */
  /** The DataSource's collection interval in seconds, or undefined when it cannot be read. */
  private async readCollectInterval(dataSourceId: number): Promise<number | undefined> {
    try {
      const ds: any = await this.client.getDataSource(dataSourceId, { fields: 'collectInterval' });
      return typeof ds?.collectInterval === 'number' ? ds.collectInterval : undefined;
    } catch {
      return undefined;
    }
  }

  /** Fold structured alertThresholds/timezone on each datapoint into its alertExpr string. */
  private applyDatapointThresholds(dataPoints: unknown): unknown {
    const parsed = parseJsonArray(dataPoints);
    return Array.isArray(parsed) ? parsed.map(dp => applyAlertThresholds(dp)) : dataPoints;
  }

  /** Warnings about "alert on any occurrence" datapoints whose trigger interval would swallow a one-poll spike. */
  private async alertIntervalWarnings(dataPoints: unknown, collectInterval: number | undefined, dataSourceId?: number): Promise<string[]> {
    let warnings = datapointIntervalWarnings(dataPoints, collectInterval);
    if (warnings.length > 0 && collectInterval === undefined && dataSourceId !== undefined) {
      const rate = await this.readCollectInterval(dataSourceId);
      if (rate !== undefined) warnings = datapointIntervalWarnings(dataPoints, rate);
    }
    return warnings;
  }

  private async prepareDatapointUpdate(dataSourceId: number, updates: Record<string, any>, allowRemoval: boolean): Promise<void> {
    if (updates.dataPoints === undefined) return;
    const dataPoints = parseJsonArray(updates.dataPoints);
    if (!Array.isArray(dataPoints)) {
      throw new InvalidArgumentError('dataPoints must be an array of datapoint definitions (send every datapoint of the DataSource, each with its "id")');
    }
    updates.dataPoints = dataPoints;

    let saved: unknown[];
    try {
      const current: any = await this.client.getDataSource(dataSourceId, { fields: 'dataPoints' });
      saved = current?.dataPoints ?? [];
    } catch (error) {
      if (allowRemoval) return;
      throw new MCPError(
        `Could not read the saved datapoints of DataSource ${dataSourceId} to check that this update keeps them: ${error instanceof Error ? error.message : String(error)}`,
        ErrorCodes.INVALID_PARAMETERS,
        { dataSourceId },
        ['Retry; the update is refused rather than risk deleting datapoints and their history'],
      );
    }

    const dropped = findDroppedDatapoints(dataPoints, saved);
    if (dropped.length > 0 && !allowRemoval) {
      const list = dropped.map(dp => `${dp.name} (id ${dp.id})`).join(', ');
      throw new MCPError(
        `This update would delete ${dropped.length} saved datapoint(s) of DataSource ${dataSourceId}: ${list}. `
          + 'LogicMonitor replaces the whole datapoint list, and a deleted datapoint loses all of its collected history permanently. Nothing was changed.',
        ErrorCodes.INVALID_PARAMETERS,
        { dataSourceId, dropped },
        [
          `Send every datapoint, each with its "id" (an id alone keeps a datapoint as it is): ${list}`,
          'A datapoint sent without an "id" is created as a new one and does not keep a saved datapoint of the same name',
          'Pass allowDatapointRemoval:true only when the user has explicitly asked for these datapoints to be deleted',
        ],
      );
    }

    updates.dataPoints = fillDatapointsFromSaved(dataPoints, saved);
  }

  /**
   * LogicMonitor replaces the whole configChecks array on a ConfigSource update, so a saved check that is
   * left out is deleted (re-adding it creates a new one with a new id). Before an update that carries
   * configChecks, read the saved checks and refuse the update if it would drop any, unless the caller
   * passed allowConfigCheckRemoval (for when the user has explicitly asked to delete checks). If the saved
   * checks cannot be read the update is refused as well, because nothing can then be checked.
   */
  private async checkConfigChecksKept(configSourceId: number, updates: Record<string, any>, allowRemoval: boolean): Promise<void> {
    if (updates.configChecks === undefined) return;
    const configChecks = parseJsonArray(updates.configChecks);
    if (!Array.isArray(configChecks)) {
      throw new InvalidArgumentError('configChecks must be an array of config checks (send every check of the ConfigSource, each existing one with its "id")');
    }
    updates.configChecks = configChecks;

    let saved: unknown[];
    try {
      const current: any = await this.client.getConfigSource(configSourceId, { fields: 'configChecks' });
      saved = current?.configChecks ?? [];
    } catch (error) {
      if (allowRemoval) return;
      throw new MCPError(
        `Could not read the saved config checks of ConfigSource ${configSourceId} to check that this update keeps them: ${error instanceof Error ? error.message : String(error)}`,
        ErrorCodes.INVALID_PARAMETERS,
        { configSourceId },
        ['Retry; the update is refused rather than risk deleting config checks'],
      );
    }

    const dropped = findDroppedConfigChecks(configChecks, saved);
    if (dropped.length > 0 && !allowRemoval) {
      const list = dropped.map(check => `${check.name} (id ${check.id})`).join(', ');
      throw new MCPError(
        `This update would delete ${dropped.length} saved config check(s) of ConfigSource ${configSourceId}: ${list}. `
          + 'LogicMonitor replaces the whole configChecks array, and a deleted check cannot be restored (adding it again creates a new check with a new id). Nothing was changed.',
        ErrorCodes.INVALID_PARAMETERS,
        { configSourceId, dropped },
        [
          `Send every check, each existing one with its "id" (get them from get_configsource): ${list}`,
          'A check sent without an "id" is created as a new one and does not keep a saved check of the same name',
          'Pass allowConfigCheckRemoval:true only when the user has explicitly asked for these checks to be deleted',
        ],
      );
    }
  }

  /** The id and name of each datapoint on a DataSource, for resolving graph lines written by name. */
  private async dataSourcePoints(dataSourceId: number): Promise<Array<{ id: number; name: string }>> {
    const dataSource: any = await this.client.getDataSource(dataSourceId, { fields: 'dataPoints' });
    return (dataSource?.dataPoints ?? []).map((dp: any) => ({ id: dp.id, name: dp.name }));
  }

  /**
   * Run a saved script DataSource against a resource: its Active Discovery script (if any) and its
   * collection script, on a usable collector with the resource's properties bound, then apply each
   * datapoint's post-processor to the output to show the values per instance.
   */
  private async testDataSource(args: any): Promise<any> {
    const device: any = await this.client.getDevice(args.deviceId, { fields: 'id,displayName,preferredCollectorId' });
    const collectorId = args.collectorId ?? device?.preferredCollectorId;
    if (!collectorId) {
      throw new InvalidArgumentError('The resource has no preferred collector; pass collectorId');
    }
    const collector: any = await this.client.getCollector(collectorId, { fields: 'id,description,isDown' });
    if (collector?.isDown === true) {
      throw new MCPError(
        `Collector ${collectorId} is down`,
        ErrorCodes.INVALID_PARAMETERS,
        { collectorId },
        ['Pass collectorId of a collector that is up (see list_collectors)'],
      );
    }

    const ds: any = await this.client.getDataSource(args.dataSourceId);
    const attr = ds?.collectorAttribute ?? {};
    const batch = ds?.collectMethod === 'batchscript';
    if ((ds?.collectMethod !== 'script' && !batch) || typeof attr.groovyScript !== 'string' || attr.groovyScript === '') {
      throw new InvalidArgumentError('test_datasource supports DataSources whose collectMethod is script or batchscript with an embedded Groovy script');
    }
    if (ds.hasMultiInstances && !batch) {
      throw new InvalidArgumentError('test_datasource does not support multi-instance DataSources that use collectMethod "script" (run per instance); use execute_groovy_script with hostId');
    }

    const run = async (script: string) => {
      const cmdline = `!groovy hostId=${args.deviceId} \n${script}`;
      return await runDebugCommand(this.client, cmdline, collectorId, { waitSeconds: args.waitSeconds });
    };

    const result: Record<string, any> = {
      dataSourceId: args.dataSourceId,
      deviceId: args.deviceId,
      collectorId,
      collectorUsed: collector?.description,
    };
    const warnings = datapointWarnings(ds.dataPoints);

    let instances: Array<{ wildvalue: string; wildalias?: string; description?: string; properties?: Record<string, string> }> = [];
    const adScript = ds.autoDiscoveryConfig?.method?.groovyScript;
    if (ds.enableAutoDiscovery && typeof adScript === 'string' && adScript !== '') {
      const ad = await run(adScript);
      if (ad.pending) return { ...result, ...(warnings.length > 0 ? { warnings } : {}), stage: 'discovery', ...ad };
      instances = parseDiscoveryOutput(String(ad.output ?? ''));
      result.discovery = { output: stripReturnHeader(String(ad.output ?? '')), instances, ...this.scriptRunDetails(ad, 'Active Discovery script', warnings) };
    }

    const collection = await run(attr.groovyScript);
    if (collection.pending) return { ...result, ...(warnings.length > 0 ? { warnings } : {}), stage: 'collection', ...collection };
    const output = String(collection.output ?? '');
    result.collection = { output: stripReturnHeader(output), ...this.scriptRunDetails(collection, 'Collection script', warnings) };
    if (warnings.length > 0) result.warnings = warnings;

    if (batch) {
      result.results = instances.map(instance => ({
        instance: instance.wildvalue,
        datapoints: evaluateDatapoints(ds.dataPoints, output, instance.wildvalue),
      }));
      if (instances.length === 0) {
        result.note = 'No instances were discovered, so no datapoints were evaluated; see discovery.output and collection.output.';
      }
    } else {
      result.results = [{ datapoints: evaluateDatapoints(ds.dataPoints, output) }];
    }
    return isTrue(args.verbose) ? result : this.compactTestResult(result, Number(args.maxInstances ?? DEFAULT_TEST_MAX_INSTANCES));
  }

  /**
   * Keep a test_datasource result small: the first maxInstances instances' results in full,
   * every other instance reduced to its name (and listed under instancesWithMissingValues when a datapoint
   * had no value), and the raw script output cut. verbose:true skips this.
   */
  private compactTestResult(result: Record<string, any>, maxInstances: number): Record<string, any> {
    const limit = Number.isFinite(maxInstances) && maxInstances >= 0 ? Math.floor(maxInstances) : DEFAULT_TEST_MAX_INSTANCES;
    const out: Record<string, any> = { ...result };
    const omitted: string[] = [];
    const cutOutput = (stage: 'discovery' | 'collection') => {
      const section = out[stage];
      if (!section || typeof section.output !== 'string') return;
      const cut = capText(section.output, MAX_TEST_OUTPUT_CHARS);
      if (cut.omitted > 0) {
        out[stage] = { ...section, output: cut.text, outputCharsOmitted: cut.omitted };
        omitted.push(`${stage}.output (${cut.omitted} characters)`);
      }
    };
    cutOutput('discovery');
    cutOutput('collection');

    const results: any[] = Array.isArray(out.results) ? out.results : [];
    const instanceCount = Array.isArray(out.discovery?.instances) ? out.discovery.instances.length : results.length;
    if (results.length > limit) {
      const missing = results
        // A "not simulated" note is about the post-processor, not about a missing value.
        .filter(r => Array.isArray(r.datapoints) && r.datapoints.some((d: any) => d.note !== undefined && !/not simulated/.test(d.note)))
        .map(r => r.instance);
      out.results = results.slice(0, limit);
      out.instancesWithMissingValues = missing;
      omitted.push(`results for ${results.length - limit} instances`);
    }
    if (out.discovery && Array.isArray(out.discovery.instances) && out.discovery.instances.length > limit) {
      // Names only: each instance's discovered properties are dozens of lines, and verbose:true has them.
      const names = out.discovery.instances.slice(0, limit).map((i: any) => ({ wildvalue: i.wildvalue, wildalias: i.wildalias, description: i.description }));
      out.discovery = { ...out.discovery, instances: names, instanceCount };
    }
    if (omitted.length > 0) {
      out.truncated = true;
      out.truncationNote = `Left out: ${omitted.join('; ')}. ${instanceCount} instance(s) in total. Raise maxInstances, or pass verbose:true for the complete output.`;
    }
    return out;
  }

  /**
   * Exit code and error text of a script run for test_datasource, and a warning when it printed
   * nothing (a silent failure otherwise looks like a clean run).
   */
  private scriptRunDetails(run: any, label: string, warnings: string[]): Record<string, any> {
    const info = describeScriptRun(run);
    if (info.empty) {
      const why = [
        info.exitCode !== undefined ? `exit code ${info.exitCode}` : undefined,
        info.error ? `error: ${info.error}` : undefined,
      ].filter(Boolean).join('; ');
      warnings.push(`${label} printed nothing${why ? ` (${why})` : ''}. The collector returns no stderr for this run, so a failure shows only as empty output; println calls inside nested closures may not reach the output, so try a plain for-loop, and wrap the body in try/catch that prints the exception.`);
    }
    return { ...(info.exitCode !== undefined ? { exitCode: info.exitCode } : {}), ...(info.error ? { error: info.error } : {}) };
  }

  /** Make sure a fields list asks for hostGroupIds (needed to expand groups); "*" and no list already include it. */
  private withHostGroupIds(fields?: string): string | undefined {
    if (!fields || fields.trim() === '*') return fields;
    const names = fields.split(',').map(f => f.trim());
    return names.includes('hostGroupIds') ? fields : `${fields},hostGroupIds`;
  }

  /**
   * Add "groups" ([{id, name, fullPath, appliesTo}]) to a resource, resolved from its hostGroupIds.
   * appliesTo is set only for dynamic groups. Lookups are shared through cache; a group that cannot
   * be read (deleted, no permission) is reported as {id, error}.
   */
  private async addGroupDetails(device: any, cache: Map<number, Promise<any>>): Promise<any> {
    if (!device || typeof device !== 'object' || device.hostGroupIds === undefined) return device;
    const ids = String(device.hostGroupIds).split(',').map(id => id.trim()).filter(Boolean).map(Number)
      .filter(id => Number.isInteger(id));
    const groups = await Promise.all(ids.map(async (id) => {
      let lookup = cache.get(id);
      if (!lookup) {
        lookup = this.client.getDeviceGroup(id, { fields: 'id,name,fullPath,appliesTo' })
          .then((g: any) => {
            const group: any = { id, name: g.name, fullPath: g.fullPath };
            if (g.appliesTo) group.appliesTo = g.appliesTo;
            return group;
          })
          .catch((e: any) => ({ id, error: e?.message ?? String(e) }));
        cache.set(id, lookup);
      }
      return lookup;
    }));
    return { ...device, groups };
  }

  private async runToolCall(
    name: string,
    args: any,
    progressCallback?: ProgressCallback,
  ): Promise<any> {
    try {
      // Reject calls missing required arguments before any request is built, since
      // request paths interpolate IDs (a missing one would hit /.../undefined).
      const tool = toolsByName().get(name);
      args = applyParameterAliases(tool, args);
      args = applyIdAlias(tool, args);
      const missing = findMissingRequired(tool, args);
      if (missing.length) {
        const unknown = findUnknownArguments(tool, args);
        throw new MCPError(
          `Missing required argument${missing.length > 1 ? 's' : ''} for ${name}: ${missing.join(', ')}`
            + (unknown.length ? ` (unrecognized argument${unknown.length > 1 ? 's' : ''} received: ${unknown.join(', ')})` : ''),
          ErrorCodes.MISSING_REQUIRED_FIELD,
          { toolName: name, missing, unrecognized: unknown },
          [
            `Provide: ${missing.join(', ')}`,
            `Accepted parameters for ${name}: ${acceptedParameterNames(tool).join(', ')}`,
          ],
        );
      }

      switch (name) {
        // Resource Management
        case 'list_resources': {
          // Handle query parameter - convert to filter
          const filter = this.combineQueryAndFilter(args.query, args.filter, SEARCH_FIELDS.devices, name);

          const expandGroups = isTrue(args.expandGroups);
          const result = await this.client.listResources({
            size: args.size,
            offset: args.offset,
            filter: filter,
            fields: expandGroups ? this.withHostGroupIds(args.fields) : args.fields,
            autoPaginate: args.autoPaginate,
          });

          // If user specified fields, return raw data; otherwise curated fields
          const listed = args.fields
            ? result
            : {
              ...result,
              items: result.items.map((device: any) =>
                filterFields(device, DEFAULT_DEVICE_FIELDS),
              ),
            };
          if (!expandGroups) return listed;

          const groupCache = new Map<number, Promise<any>>();
          return {
            ...listed,
            items: await Promise.all(
              listed.items.map((device: any) => this.addGroupDetails(device, groupCache)),
            ),
          };
        }

        case 'get_resource': {
          const expandGroups = isTrue(args.expandGroups);
          const device = await this.client.getDevice(args.deviceId, {
            fields: expandGroups ? this.withHostGroupIds(args.fields) : args.fields,
          });
          return expandGroups ? await this.addGroupDetails(device, new Map()) : device;
        }

        case 'create_resource': {
          // Check if this is a batch operation
          if (args.devices && Array.isArray(args.devices)) {
            // Batch mode with adaptive concurrency support
            // Use smartBatchProcessor for automatic rate limit handling:
            // const result = await smartBatchProcessor.processBatchSmart(..., { adaptiveConcurrency: true })
            const batchOptions = args.batchOptions || {};
            const result = await batchProcessor.processBatch(
              args.devices,
              async (device: any) => {
                const deviceData: any = {
                  displayName: device.displayName,
                  name: device.name,
                  preferredCollectorId: device.preferredCollectorId,
                };
                if (device.hostGroupIds) deviceData.hostGroupIds = device.hostGroupIds;
                if (device.description) deviceData.description = device.description;
                if (device.disableAlerting !== undefined) deviceData.disableAlerting = device.disableAlerting;
                if (device.customProperties) deviceData.customProperties = device.customProperties;

                const created = await this.client.createDevice(deviceData);
                return { id: (created as any).id, displayName: (created as any).displayName };
              },
              {
                maxConcurrent: batchOptions.maxConcurrent || 5,
                continueOnError: batchOptions.continueOnError ?? true,
                retryOnRateLimit: true,
                onProgress: progressCallback ? (completed, total) => {
                  // Send progress notification if callback provided
                  progressCallback(completed, total).catch(() => {
                    // Ignore errors in progress notifications
                  });
                } : undefined,
              },
            );

            // Return batch result in reference format
            return {
              success: result.success,
              summary: result.summary,
              devices: result.results.map(r => ({
                index: r.index,
                success: r.success,
                ...(r.success ? { device: r.data } : { error: r.error }),
              })),
            };
          }

          // Single mode
          const device: any = {
            displayName: args.displayName,
            name: args.name,
            preferredCollectorId: args.preferredCollectorId,
          };
          if (args.hostGroupIds) device.hostGroupIds = args.hostGroupIds;
          if (args.description) device.description = args.description;
          if (args.disableAlerting !== undefined) device.disableAlerting = args.disableAlerting;
          if (args.customProperties) device.customProperties = args.customProperties;
          return await this.client.createDevice(device);
        }

        case 'update_resource': {
          // Check if this is a batch operation
          if (args.devices && Array.isArray(args.devices)) {
            // Batch mode
            const batchOptions = args.batchOptions || {};
            const result = await batchProcessor.processBatch(
              args.devices,
              async (device: any) => {
                const { deviceId, opType, ...deviceData } = device;
                const updated = await this.client.updateDevice(deviceId, deviceData, {
                  opType: opType || 'replace',
                });
                return { id: (updated as any).id, displayName: (updated as any).displayName };
              },
              {
                maxConcurrent: batchOptions.maxConcurrent || 5,
                continueOnError: batchOptions.continueOnError ?? true,
                retryOnRateLimit: true,
                onProgress: progressCallback ? (completed, total) => {
                  progressCallback(completed, total).catch(() => {});
                } : undefined,
              },
            );

            // Return batch result in reference format
            return {
              success: result.success,
              summary: result.summary,
              devices: result.results.map(r => ({
                index: r.index,
                success: r.success,
                ...(r.success ? { device: r.data } : { error: r.error }),
              })),
            };
          }

          // Single mode
          const { deviceId, opType, ...deviceData } = args;
          return await this.client.updateDevice(deviceId, deviceData, {
            opType: opType || 'replace',
          });
        }

        case 'delete_resource': {
          // Check if this is a batch operation
          if (args.deviceIds && Array.isArray(args.deviceIds)) {
            // Batch mode
            const batchOptions = args.batchOptions || {};
            const result = await batchProcessor.processBatch(
              args.deviceIds,
              async (deviceId: number) => {
                const displayName = await this.resolveResourceName(deviceId);
                await this.client.deleteDevice(deviceId, {
                  deleteFromSystem: args.deleteFromSystem,
                });
                return { id: deviceId, displayName };
              },
              {
                maxConcurrent: batchOptions.maxConcurrent || 5,
                continueOnError: batchOptions.continueOnError ?? true,
                retryOnRateLimit: true,
                onProgress: progressCallback ? (completed, total) => {
                  progressCallback(completed, total).catch(() => {});
                } : undefined,
              },
            );

            // Return batch result in reference format
            return {
              success: result.success,
              summary: result.summary,
              devices: result.results.map(r => ({
                index: r.index,
                success: r.success,
                ...(r.success ? { device: r.data } : { error: r.error }),
              })),
            };
          }

          // Single mode
          const deletedName = await this.resolveResourceName(args.deviceId);
          return this.withResourceTarget(
            await this.client.deleteDevice(args.deviceId, {
              deleteFromSystem: args.deleteFromSystem,
            }),
            args.deviceId,
            deletedName,
          );
        }

        // Device Groups
        case 'list_resource_groups': {
          const result = await this.client.listDeviceGroups({
            size: args.size,
            offset: args.offset,
            filter: args.filter,
            fields: args.fields,
            autoPaginate: args.autoPaginate,
          });

          if (args.fields) {
            return result;
          }

          return {
            ...result,
            items: result.items.map((group: any) =>
              filterFields(group, DEFAULT_DEVICE_GROUP_FIELDS),
            ),
          };
        }

        case 'get_resource_group_membership': {
          const device = await this.client.getDevice(args.deviceId, {
            fields: 'id,displayName,hostGroupIds,customProperties,autoProperties,systemProperties,inheritedProperties',
          });
          const expanded = await this.addGroupDetails(device, new Map());
          const properties = new Map<string, any>();
          for (const list of [device.inheritedProperties, device.systemProperties, device.autoProperties, device.customProperties]) {
            if (Array.isArray(list)) for (const p of list) if (p?.name) properties.set(p.name, p.value);
          }
          const groups = (expanded.groups ?? []).map((group: any) => {
            if (!group.appliesTo) return { ...group, dynamic: false };
            // Which of the device's properties the rule mentions, with their values: the "why".
            const mentioned: Record<string, any> = {};
            for (const [propName, value] of properties) {
              if (group.appliesTo.includes(propName)) mentioned[propName] = value;
            }
            return { ...group, dynamic: true, referencedProperties: mentioned };
          });
          return {
            id: device.id,
            displayName: device.displayName,
            groups,
            note: 'Groups are the resource\'s direct memberships (static and dynamic); every parent of a group in its fullPath contains the resource too. For dynamic groups, referencedProperties lists the resource\'s own properties named in the appliesTo rule; the rule itself is not evaluated here.',
          };
        }

        case 'find_resource_groups_by_applies_to': {
          const needle = String(args.text ?? '').trim().toLowerCase();
          const all = await this.client.listDeviceGroups({
            fields: 'id,name,fullPath,appliesTo',
            filter: args.filter,
            autoPaginate: true,
          });
          const items = (all.items ?? []).filter((g: any) =>
            typeof g?.appliesTo === 'string' && g.appliesTo.toLowerCase().includes(needle));
          return { items, total: items.length };
        }

        case 'get_resource_group':
          return await this.client.getDeviceGroup(args.groupId, {
            fields: args.fields,
          });

        case 'create_resource_group': {
          const group: any = {
            name: args.name,
          };
          if (args.parentId) group.parentId = args.parentId;
          if (args.description) group.description = args.description;
          if (args.disableAlerting !== undefined) group.disableAlerting = args.disableAlerting;
          if (args.customProperties) group.customProperties = args.customProperties;
          if (args.appliesTo) group.appliesTo = args.appliesTo;
          return await this.client.createDeviceGroup(group);
        }

        case 'update_resource_group': {
          const { groupId, opType, ...groupData } = args;
          return await this.client.updateDeviceGroup(groupId, groupData, {
            opType: opType || 'replace',
          });
        }

        case 'delete_resource_group':
          return await this.client.deleteDeviceGroup(args.groupId, {
            deleteChildren: args.deleteChildren,
          });

        // Alerts
        case 'list_alerts': {
          // Handle query parameter - convert to filter
          let filter = args.filter;
          if (args.query) {
            // Alert API doesn't support OR (||) operator, so handle differently
            if (args.query.includes(':') || args.query.includes('~')) {
              // User provided filter syntax - format it
              const queryFilter = autoFormatFilter(args.query);
              filter = filter ? `${queryFilter},${filter}` : queryFilter;
            } else {
              // Free text search - use only monitorObjectName (most relevant field for alerts)
              const queryFilter = autoFormatFilter(args.query, ['monitorObjectName']);
              filter = filter ? `${queryFilter},${filter}` : queryFilter;
            }
          }

          const result = await this.client.listAlerts({
            size: args.size,
            offset: args.offset,
            filter: filter,
            fields: args.fields,
            needMessage: args.needMessage,
            autoPaginate: args.autoPaginate,
          });

          // If user specified fields, return raw data
          if (args.fields) {
            return result;
          }

          // Otherwise, return curated fields
          return {
            ...result,
            items: result.items.map((alert: any) =>
              filterFields(alert, DEFAULT_ALERT_FIELDS),
            ),
          };
        }

        case 'get_alert':
          return await this.client.getAlert(args.alertId, {
            fields: args.fields,
            needMessage: args.needMessage,
          });

        case 'acknowledge_alert':
          return await this.client.acknowledgeAlert(args.alertId, args.comment);

        case 'add_alert_note':
          return await this.client.addAlertNote(args.alertId, args.note);

        // Collectors
        case 'list_collectors': {
          const result = await this.client.listCollectors({
            size: args.size,
            offset: args.offset,
            filter: args.filter,
            fields: args.fields,
            autoPaginate: args.autoPaginate,
          });

          if (args.fields) {
            return result;
          }

          return {
            ...result,
            items: result.items.map((collector: any) =>
              filterFields(collector, DEFAULT_COLLECTOR_FIELDS),
            ),
          };
        }

        case 'get_collector':
          return await this.client.getCollector(args.collectorId, {
            fields: args.fields,
          });

        case 'update_collector': {
          const {
            collectorId,
            opType,
            autoBalanceMonitoredDevices,
            forceUpdateFailedOverDevices,
            ...collectorData
          } = args;
          return await this.client.updateCollector(collectorId, collectorData, {
            opType: opType || 'replace',
            autoBalanceMonitoredDevices,
            forceUpdateFailedOverDevices,
          });
        }

        case 'delete_collector':
          return await this.client.deleteCollector(args.collectorId);

        // Debug Commands
        case 'execute_debug_command':
          return await runDebugCommand(this.client, args.cmdline, args.collectorId, {
            waitSeconds: args.waitSeconds,
            includeCommand: args.includeCommand,
          });

        case 'get_debug_command_result':
          return await fetchDebugResult(
            this.client,
            args.id,
            args.collectorId,
            normalizeWaitSeconds(args.waitSeconds, 0),
          );

        case 'execute_groovy_script': {
          if (!!args.scriptPath === !!args.scriptBody) {
            throw new MCPError(
              'Provide exactly one of scriptPath or scriptBody',
              ErrorCodes.INVALID_PARAMETERS,
              { scriptPath: args.scriptPath, scriptBody: args.scriptBody },
              [
                'Set scriptPath to run a script file already on the collector',
                'Set scriptBody to run an inline script instead',
              ],
            );
          }

          const options: string[] = ['!groovy'];
          if (args.timeout !== undefined) options.push(`timeout=${args.timeout}`);
          if (args.runner !== undefined) options.push(`runner=${args.runner}`);
          if (args.hostId !== undefined) options.push(`hostId=${args.hostId}`);
          if (args.collectorHostId !== undefined) options.push(`h=${args.collectorHostId}`);

          const cmdline = args.scriptPath
            ? `${options.join(' ')} ${args.scriptPath}`
            : `${options.join(' ')} \n${args.scriptBody}`;

          return await runDebugCommand(this.client, cmdline, args.collectorId, {
            waitSeconds: args.waitSeconds,
            includeCommand: args.includeCommand,
          });
        }

        case 'execute_powershell_script': {
          const options: string[] = ['!posh'];
          if (args.timeout !== undefined) options.push(`timeout=${args.timeout}`);
          if (args.hostId !== undefined) options.push(`hostId=${args.hostId}`);

          const cmdline = `${options.join(' ')} ${args.scriptPath}`;

          return await runDebugCommand(this.client, cmdline, args.collectorId, {
            waitSeconds: args.waitSeconds,
            includeCommand: args.includeCommand,
          });
        }

        // DataSources
        case 'list_datasources': {
          const result = await this.client.listDataSources({
            size: args.size,
            offset: args.offset,
            filter: args.filter,
            fields: args.fields,
            autoPaginate: args.autoPaginate,
          });

          if (args.fields) {
            return result;
          }

          return {
            ...result,
            items: result.items.map((datasource: any) =>
              filterFields(datasource, DEFAULT_DATASOURCE_FIELDS),
            ),
          };
        }

        case 'get_datasource': {
          const nested = planNestedFields(args.fields);
          const dataSource = await this.client.getDataSource(args.dataSourceId, {
            fields: nested.apiFields ?? (isTrue(args.datapointsOnly) ? 'id,name,collectInterval,dataPoints' : undefined),
          });
          // An explicit fields selection is returned as asked (dot paths are projected here, because the API
          // answers them with {}); the full definition (every script, alert template and access group) is too
          // large to be a useful default.
          if (args.fields) return projectResult(dataSource, nested.paths);
          if (isTrue(args.datapointsOnly)) {
            return { id: dataSource?.id, name: dataSource?.name, dataPoints: (dataSource?.dataPoints ?? []).map((dp: any) => compactDataPoint(dp, dataSource?.collectInterval)) };
          }
          return curateDataSource(dataSource);
        }

        case 'test_datasource':
          return await this.testDataSource(args);

        case 'get_datasource_scripts': {
          const dataSource = await this.client.getDataSource(args.dataSourceId);
          return {
            dataSourceId: args.dataSourceId,
            scripts: extractDataSourceScripts(dataSource),
          };
        }

        case 'list_datasource_overview_graphs':
          return await this.client.listDataSourceOverviewGraphs(args.dataSourceId, {
            size: args.size, offset: args.offset, filter: args.filter, fields: args.fields,
          });

        case 'get_datasource_overview_graph':
          return await this.client.getDataSourceOverviewGraph(args.dataSourceId, args.graphId, { fields: args.fields });

        case 'list_datasource_graphs':
          return await this.client.listDataSourceGraphs(args.dataSourceId, {
            size: args.size, offset: args.offset, filter: args.filter, fields: args.fields,
          });

        case 'get_datasource_graph':
          return await this.client.getDataSourceGraph(args.dataSourceId, args.graphId, { fields: args.fields });

        case 'create_datasource_overview_graph':
        case 'create_datasource_graph': {
          const kind = name === 'create_datasource_graph' ? 'instance' : 'overview';
          const body = buildGraphBody(kind, { ...args, title: args.title ?? args.name }, await this.dataSourcePoints(args.dataSourceId));
          return kind === 'overview'
            ? await this.client.createDataSourceOverviewGraph(args.dataSourceId, body)
            : await this.client.createDataSourceGraph(args.dataSourceId, body);
        }

        case 'update_datasource_overview_graph':
        case 'update_datasource_graph': {
          const kind = name === 'update_datasource_graph' ? 'instance' : 'overview';
          const needsPoints = args.lines !== undefined || args.dataPoints !== undefined;
          const current: any = needsPoints && args.dataPoints === undefined
            ? await (kind === 'overview'
              ? this.client.getDataSourceOverviewGraph(args.dataSourceId, args.graphId, { fields: 'dataPoints' })
              : this.client.getDataSourceGraph(args.dataSourceId, args.graphId, { fields: 'dataPoints' }))
            : undefined;
          const body = buildGraphBody(
            kind, args, needsPoints ? await this.dataSourcePoints(args.dataSourceId) : [], current?.dataPoints ?? [],
          );
          return kind === 'overview'
            ? await this.client.updateDataSourceOverviewGraph(args.dataSourceId, args.graphId, body)
            : await this.client.updateDataSourceGraph(args.dataSourceId, args.graphId, body);
        }

        case 'delete_datasource_overview_graph':
          return await this.client.deleteDataSourceOverviewGraph(args.dataSourceId, args.graphId);

        case 'delete_datasource_graph':
          return await this.client.deleteDataSourceGraph(args.dataSourceId, args.graphId);

        case 'create_datasource': {
          const created: any = await this.client.createDataSource({
            name: args.name,
            displayName: args.displayName,
            description: args.description,
            appliesTo: args.appliesTo,
            group: args.group,
            technology: args.technology,
            tags: args.tags,
            collectMethod: args.collectMethod,
            collectInterval: args.collectInterval,
            collectorAttribute: normalizeCollectorAttribute(args.collectorAttribute, args.collectMethod, true),
            dataPoints: this.applyDatapointThresholds(args.dataPoints),
            // hasMultiInstances is create-only in LM; default to true when Active Discovery is on
            hasMultiInstances: args.hasMultiInstances ?? (args.enableAutoDiscovery ? true : undefined),
            useWildValueAsUUID: args.useWildValueAsUUID === undefined ? undefined : isTrue(args.useWildValueAsUUID),
            enableAutoDiscovery: args.enableAutoDiscovery,
            autoDiscoveryConfig: normalizeAutoDiscoveryConfig(args.autoDiscoveryConfig, true),
            enableEriDiscovery: args.enableEriDiscovery,
            eriDiscoveryConfig: args.eriDiscoveryConfig,
          });
          const createWarnings = await this.alertIntervalWarnings(this.applyDatapointThresholds(args.dataPoints), args.collectInterval);
          return createWarnings.length > 0 && created && typeof created === 'object'
            ? { ...created, warning: createWarnings.join(' ') }
            : created;
        }

        case 'update_datasource': {
          const { dataSourceId, allowDatapointRemoval, ...updates } = args;
          if (updates.useWildValueAsUUID !== undefined) updates.useWildValueAsUUID = isTrue(updates.useWildValueAsUUID);
          if (updates.collectorAttribute !== undefined) {
            updates.collectorAttribute = normalizeCollectorAttribute(updates.collectorAttribute, updates.collectMethod, false);
          }
          if (updates.autoDiscoveryConfig !== undefined) {
            updates.autoDiscoveryConfig = await this.completeAutoDiscoveryUpdate(
              dataSourceId,
              normalizeAutoDiscoveryConfig(updates.autoDiscoveryConfig, false) as Record<string, any>,
            );
          }
          if (updates.dataPoints !== undefined) updates.dataPoints = this.applyDatapointThresholds(updates.dataPoints);
          await this.prepareDatapointUpdate(dataSourceId, updates, isTrue(allowDatapointRemoval));
          const updated = await this.client.updateDataSource(dataSourceId, updates);
          const withoutId = Array.isArray(updates.dataPoints)
            ? updates.dataPoints.filter((dp: any) => dp && typeof dp === 'object' && dp.id === undefined).length
            : 0;
          const updateWarnings: string[] = [];
          if (withoutId > 0) {
            updateWarnings.push(`${withoutId} datapoint(s) were sent without an "id" and were recreated; graphs that used them lost them. Re-save the lines of each graph (update_datasource_graph / update_datasource_overview_graph), and pass each datapoint's id on future updates.`);
          }
          updateWarnings.push(...await this.alertIntervalWarnings(updates.dataPoints, updates.collectInterval, dataSourceId));
          return updateWarnings.length > 0 && updated && typeof updated === 'object'
            ? { ...updated, warning: updateWarnings.join(' ') }
            : updated;
        }

        case 'delete_datasource':
          return await this.client.deleteDataSource(args.dataSourceId);

        // Device DataSource Instances
        case 'list_resource_instances':
          return await this.client.listDeviceDataSourceInstances(
            args.deviceId,
            args.deviceDataSourceId,
            {
              size: args.size,
              offset: args.offset,
              filter: args.filter,
              fields: args.fields,
            },
          );

        case 'list_resource_configs': {
          const target = await this.resolveConfigInstance(args);
          if (target.never) {
            return { items: [], total: 0, collection: target.never };
          }
          const versions: any = await this.client.listDeviceConfigSourceConfigs(
            args.deviceId,
            target.deviceDataSourceId,
            target.instanceId,
            {
              size: args.size,
              offset: args.offset,
              filter: args.filter,
              // The config text and diff are heavy; the version list defaults to the metadata.
              fields: args.fields ?? DEFAULT_CONFIG_VERSION_FIELDS,
              autoPaginate: args.autoPaginate,
            },
          );
          return { ...versions, collection: target.collection };
        }

        case 'get_resource_config': {
          // LogicMonitor answers 400 "Missing essential query parameter 'startEpoch'" without it; the value
          // that works is the version's own pollTimestamp, so look it up when the caller did not give one.
          const startEpoch = args.startEpoch ?? await this.findConfigPollTimestamp(
            args.deviceId, args.deviceDataSourceId, args.instanceId, String(args.configId),
          );
          const config = await this.client.getDeviceConfigSourceConfig(
            args.deviceId,
            args.deviceDataSourceId,
            args.instanceId,
            String(args.configId),
            { format: args.format, startEpoch: toEpochSeconds(startEpoch), fields: args.fields },
          );
          return capConfigVersion(config, args.maxChars ?? MAX_CONFIG_CHARS, args.maxDiffLines ?? MAX_CONFIG_DIFF_LINES);
        }

        case 'get_resource_instance_data':
          return await this.client.getDeviceDataSourceInstanceData(
            args.deviceId,
            args.deviceDataSourceId,
            args.instanceId,
            {
              datapoints: args.datapoints,
              start: toEpochSeconds(args.start),
              end: toEpochSeconds(args.end),
              format: args.format,
              autoPaginate: args.autoPaginate,
              maxPages: args.maxPages,
              summarize: args.summarize,
            },
          );

        // Dashboards
        case 'list_dashboards': {
          const nested = planNestedFields(args.fields);
          const result = await this.client.listDashboards({
            size: args.size,
            offset: args.offset,
            filter: args.filter,
            fields: nested.apiFields,
            autoPaginate: args.autoPaginate,
          });

          if (args.fields) {
            return projectResult(result, nested.paths);
          }

          return {
            ...result,
            items: result.items.map((dashboard: any) =>
              filterFields(dashboard, DEFAULT_DASHBOARD_FIELDS),
            ),
          };
        }

        case 'get_dashboard':
          return await this.client.getDashboard(args.dashboardId, {
            fields: args.fields,
          });

        case 'create_dashboard': {
          const dashboard: any = {
            name: args.name,
          };
          if (args.description) dashboard.description = args.description;
          if (args.groupId) dashboard.groupId = args.groupId;
          if (args.widgetsConfig) dashboard.widgetsConfig = args.widgetsConfig;
          const sharable = args.sharable === undefined ? undefined : isTrue(args.sharable);
          if (sharable !== undefined) dashboard.sharable = sharable;
          // LogicMonitor leaves a private dashboard in the root group, whatever groupId says
          if (inFolder(args.groupId)) {
            if (sharable === false) throw privateInFolderError();
            dashboard.sharable = true;
          }
          if (args.widgetTokens) dashboard.widgetTokens = parseJsonArray(args.widgetTokens);
          if (args.defaultDashboardFilters !== undefined) dashboard.defaultDashboardFilters = toDashboardFilters(args.defaultDashboardFilters);
          return await this.client.createDashboard(dashboard);
        }

        case 'update_dashboard': {
          const { dashboardId, ...dashboardData } = args;
          if (dashboardData.widgetTokens !== undefined) dashboardData.widgetTokens = parseJsonArray(dashboardData.widgetTokens);
          if (dashboardData.sharable !== undefined) dashboardData.sharable = isTrue(dashboardData.sharable);
          if (dashboardData.defaultDashboardFilters !== undefined) dashboardData.defaultDashboardFilters = toDashboardFilters(dashboardData.defaultDashboardFilters);
          if (inFolder(dashboardData.groupId)) {
            if (dashboardData.sharable === false) throw privateInFolderError();
            if (dashboardData.sharable === undefined) {
              const current: any = await this.client.getDashboard(dashboardId);
              if (current?.sharable !== true) {
                throw new InvalidArgumentError(
                  `Dashboard ${dashboardId} is private, and LogicMonitor only puts public dashboards in a folder (it silently ignores the move). Pass sharable:true to make it public and move it in the same call.`
                );
              }
            }
          }
          return await this.client.updateDashboard(dashboardId, dashboardData);
        }

        case 'delete_dashboard':
          return await this.client.deleteDashboard(args.dashboardId);

        // Widgets
        case 'list_widgets': {
          const result = await this.client.listWidgets({
            dashboardId: args.dashboardId,
            size: args.size,
            offset: args.offset,
            filter: args.filter,
            fields: args.fields,
            autoPaginate: args.autoPaginate,
          });

          if (args.fields) {
            return result;
          }

          return {
            ...result,
            items: result.items.map((widget: any) =>
              filterFields(widget, DEFAULT_WIDGET_FIELDS),
            ),
          };
        }

        case 'get_widget': {
          const nested = planNestedFields(args.fields);
          const widget = await this.client.getWidget(args.widgetId, { fields: nested.apiFields });
          return projectResult(widget, nested.paths);
        }

        case 'create_widget': {
          const { config, columns, ...widgetFields } = args;
          const widget: any = { ...widgetFields };
          if (config) Object.assign(widget, config);
          if (widget.type === 'alert' && !Array.isArray(widget.displaySettings?.columns)) {
            // LogicMonitor creates an alert list with no columns unless it is sent some: start from the UI's standard set
            const changes = columns === undefined ? [] : parseJsonArray(columns);
            if (!Array.isArray(changes)) throw new InvalidArgumentError('columns must be a list of column changes.');
            widget.displaySettings = { ...widget.displaySettings, columns: applyColumnChanges(defaultAlertColumns(), changes as ColumnChange[]) };
          } else if (columns !== undefined) {
            throw new InvalidArgumentError('columns only applies to a new alert list widget that has no displaySettings.columns of its own.');
          }
          if (widget.type === 'dynamicTable' && !isAcceptedTopX(widget.topX)) throw new InvalidArgumentError(topXErrorMessage(widget.topX));
          return await this.client.createWidget(widget);
        }

        case 'update_widget': {
          const { widgetId, config, columns, tableColumns, ...widgetFields } = args;
          const widget: any = { ...widgetFields };
          if (config) Object.assign(widget, config);
          if (tableColumns !== undefined) {
            const changes = parseJsonArray(tableColumns);
            if (!Array.isArray(changes)) throw new InvalidArgumentError('tableColumns must be a list of column changes.');
            const current: any = await this.client.getWidget(widgetId, { fields: 'type,displaySettings,columns' });
            if (current?.type !== 'dynamicTable') {
              throw new InvalidArgumentError(`Widget ${widgetId} is a ${current?.type ?? 'unknown'} widget; tableColumns only applies to dynamicTable widgets.`);
            }
            const updated = applyTableColumnChanges(
              { displaySettings: widget.displaySettings ?? current.displaySettings, columns: widget.columns ?? current.columns },
              changes as TableColumnChange[]
            );
            widget.displaySettings = updated.displaySettings;
            widget.columns = updated.columns;
          }
          if (columns !== undefined) {
            // LogicMonitor replaces displaySettings as a whole, so send the current one with the new column list
            const changes = parseJsonArray(columns);
            if (!Array.isArray(changes)) throw new InvalidArgumentError('columns must be a list of column changes.');
            const current: any = await this.client.getWidget(widgetId, { fields: 'displaySettings' });
            const displaySettings = widget.displaySettings ?? current?.displaySettings;
            if (!Array.isArray(displaySettings?.columns)) {
              throw new InvalidArgumentError(`Widget ${widgetId} has no column list (columns only applies to alert list widgets).`);
            }
            widget.displaySettings = { ...displaySettings, columns: applyColumnChanges(displaySettings.columns, changes as ColumnChange[]) };
          }
          if (!isAcceptedTopX(widget.topX)) {
            // an update usually omits the type, so look it up only when the limit would be refused for a dynamic table
            const type = widget.type ?? ((await this.client.getWidget(widgetId, { fields: 'type' })) as any)?.type;
            if (type === 'dynamicTable') throw new InvalidArgumentError(topXErrorMessage(widget.topX));
          }
          return await this.client.updateWidget(widgetId, widget);
        }

        case 'find_widgets_using_datasource': {
          const text = typeof args.name === 'string' ? args.name.trim() : '';
          if (!text) throw new InvalidArgumentError('name is required: the DataSource name to look for (display name or internal name).');
          const result: any = await this.client.listWidgets({
            dashboardId: args.dashboardId,
            fields: WIDGET_REFERENCE_FIELDS,
            autoPaginate: true,
          });
          const references = findWidgetReferences(result?.items ?? [], text);
          return { searched: text, widgetsChecked: (result?.items ?? []).length, count: references.length, widgets: references };
        }

        case 'delete_widget':
          return await this.client.deleteWidget(args.widgetId);

        case 'get_widget_data': {
          const data = await this.client.getWidgetData(args.widgetId, {
            start: toEpochSeconds(args.start),
            end: toEpochSeconds(args.end),
            format: args.format,
          });
          if (typeof data !== 'object' || data === null) return data;
          // With no maxRows, keep as many rows as fit the list-response limit (a table row can be 2,000 characters).
          const maxRows = args.maxRows === undefined ? undefined : Number(args.maxRows);
          if (maxRows !== undefined && (!Number.isFinite(maxRows) || maxRows < 0)) return data;
          const capped = maxRows === undefined
            ? capRowsToSize(data, MAX_LIST_RESPONSE_CHARS)
            : capRows(data, Math.floor(maxRows));
          if (!capped.truncated) return data;
          return {
            ...(Array.isArray(capped.value) ? { data: capped.value } : capped.value),
            truncated: true,
            truncationNote: `Only the first ${capped.truncated.returned} of ${capped.truncated.total} entries of "${capped.truncated.path}" are shown. Raise maxRows (a large value returns everything) to see more.`,
          };
        }

        case 'generate_dashboard_link':
          return await this.client.generateDashboardLink(args.dashboardId);

        case 'generate_resource_link':
          return await this.client.generateResourceLink(args.deviceId);

        case 'generate_alert_link':
          return await this.client.generateAlertLink(args.alertId);

        case 'generate_website_link':
          return await this.client.generateWebsiteLink(args.websiteId);

        // Dashboard Groups
        case 'list_dashboard_groups': {
          const result = await this.client.listDashboardGroups({
            size: args.size,
            offset: args.offset,
            filter: args.filter,
            fields: args.fields,
            autoPaginate: args.autoPaginate,
          });

          if (args.fields) {
            return result;
          }

          return {
            ...result,
            items: result.items.map((group: any) =>
              filterFields(group, DEFAULT_DASHBOARD_GROUP_FIELDS),
            ),
          };
        }

        case 'get_dashboard_group':
          return await this.client.getDashboardGroup(args.groupId, {
            fields: args.fields,
          });

        // Reports
        case 'list_reports': {
          const result = await this.client.listReports({
            size: args.size,
            offset: args.offset,
            filter: args.filter,
            fields: args.fields,
            autoPaginate: args.autoPaginate,
          });

          if (args.fields) {
            return result;
          }

          return {
            ...result,
            items: result.items.map((report: any) =>
              filterFields(report, DEFAULT_REPORT_FIELDS),
            ),
          };
        }

        case 'get_report':
          return await this.client.getReport(args.reportId, {
            fields: args.fields,
          });

        // Websites
        case 'list_websites': {
          const result = await this.client.listWebsites({
            size: args.size,
            offset: args.offset,
            filter: args.filter,
            fields: args.fields,
            autoPaginate: args.autoPaginate,
          });

          if (args.fields) {
            return result;
          }

          return {
            ...result,
            items: result.items.map((website: any) =>
              filterFields(website, DEFAULT_WEBSITE_FIELDS),
            ),
          };
        }

        case 'get_website':
          return await this.client.getWebsite(args.websiteId, {
            fields: args.fields,
          });

        case 'create_website': {
          const body = buildWebsiteCreate(args);
          const isInternal = isTrue(args.isInternal);
          const location = await this.resolveUptimeLocation(isInternal, parseJsonObject(args.testLocation));
          return await this.client.createWebsite({ ...body, isInternal, ...location });
        }

        case 'update_website': {
          const body: Record<string, any> = buildWebsiteUpdate(args);
          if (args.isInternal !== undefined || args.testLocation !== undefined) {
            let isInternal: boolean;
            if (args.isInternal !== undefined) {
              isInternal = isTrue(args.isInternal);
            } else {
              const current: any = await this.client.getWebsite(args.websiteId, { fields: 'isInternal' });
              isInternal = !!current?.isInternal;
            }
            Object.assign(body, { isInternal }, await this.resolveUptimeLocation(isInternal, parseJsonObject(args.testLocation)));
          }
          return await this.client.updateWebsite(args.websiteId, body, args.opType ? { opType: args.opType } : undefined);
        }

        case 'get_website_checkpoint_data': {
          const raw = await this.client.getWebsiteCheckpointData(args.websiteId, args.checkpointId, {
            start: toEpochSeconds(args.start),
            end: toEpochSeconds(args.end),
            period: args.period,
            datapoints: Array.isArray(args.datapoints) ? args.datapoints.join(',') : args.datapoints,
          });
          return websiteCheckpointRows(raw);
        }

        case 'list_website_alerts':
          return await this.client.listWebsiteAlerts(args.websiteId, {
            size: args.size,
            offset: args.offset,
            filter: args.filter,
            fields: args.fields,
            needMessage: args.needMessage === undefined ? undefined : isTrue(args.needMessage),
            autoPaginate: args.autoPaginate,
          });

        case 'list_website_properties':
          return await this.client.listWebsiteProperties(args.websiteId, {
            size: args.size,
            offset: args.offset,
            filter: args.filter,
            fields: args.fields,
            autoPaginate: args.autoPaginate,
          });

        case 'list_website_sdts':
          return await this.client.listWebsiteSdts(args.websiteId, {
            size: args.size,
            offset: args.offset,
            filter: args.filter,
            fields: args.fields,
            autoPaginate: args.autoPaginate,
          });

        case 'delete_website':
          return await this.client.deleteWebsite(args.websiteId);

        case 'create_uptime_check': {
          const useDefaultAlertSetting = this.resolveUptimeAlertSetting(args);
          if (args.checkType === 'ping') {
            if (!args.host) throw new InvalidArgumentError('host is required when checkType is "ping"');
            this.validatePingCount(args.count);
          } else if (!args.domain) {
            throw new InvalidArgumentError('domain is required when checkType is "web" (the default)');
          }
          const isInternal = args.isInternal ?? false;
          const { useDefaultLocationSetting, testLocation } = await this.resolveUptimeLocation(isInternal, args.testLocation);
          if (args.checkType === 'ping') {
            // Payload shape mirrors New-LMUptimeDevice in the LogicMonitor PowerShell module
            const device: any = {
              type: 'uptimepingcheck',
              model: 'websiteDevice',
              deviceType: 19,
              id: 0,
              name: args.name,
              displayName: args.displayName,
              host: args.host,
              count: args.count ?? 5,
              percentPktsNotReceiveInTime: args.percentPktsNotReceiveInTime ?? 80,
              timeoutInMSPktsNotReceive: args.timeoutInMSPktsNotReceive ?? 500,
              isInternal,
              useDefaultAlertSetting,
            };
            if (args.pollingInterval !== undefined) device.pollingInterval = args.pollingInterval;
            device.useDefaultLocationSetting = useDefaultLocationSetting;
            device.testLocation = testLocation;
            if (args.hostGroupIds) {
              device.groupIds = String(args.hostGroupIds).split(',').map((id: string) => id.trim()).filter(Boolean);
            }
            if (args.description) device.description = args.description;
            return await this.client.createDevice(device, { type: 'uptimepingcheck' });
          }
          const device: any = {
            type: 'uptimewebcheck',
            displayName: args.displayName,
            name: args.name,
            domain: args.domain,
            testLocation,
            useDefaultLocationSetting,
            isInternal,
            useDefaultAlertSetting,
          };
          if (args.schema) device.schema = args.schema;
          if (args.pollingInterval !== undefined) device.pollingInterval = args.pollingInterval;
          if (args.hostGroupIds) device.hostGroupIds = args.hostGroupIds;
          if (args.description) device.description = args.description;
          if (args.preferredCollectorId) device.preferredCollectorId = args.preferredCollectorId;
          if (args.steps) {
            device.steps = args.steps.map((step: any) => this.withStepDefaults(step));
          }
          return await this.client.createDevice(device);
        }

        case 'update_uptime_check': {
          const existing: any = await this.client.getDevice(args.deviceId);
          if (existing.type !== 'uptimewebcheck' && existing.type !== 'uptimepingcheck') {
            throw new InvalidArgumentError(
              `Resource ${args.deviceId} is type "${existing.type}", not an LM Uptime check. Use update_resource for other resource types.`,
            );
          }
          const isPing = existing.type === 'uptimepingcheck';
          if (!isPing && (args.host !== undefined || args.count !== undefined
              || args.percentPktsNotReceiveInTime !== undefined || args.timeoutInMSPktsNotReceive !== undefined)) {
            throw new InvalidArgumentError('host, count, percentPktsNotReceiveInTime and timeoutInMSPktsNotReceive only apply to ping checks');
          }
          if (isPing && (args.domain !== undefined || args.schema !== undefined || args.steps !== undefined)) {
            throw new InvalidArgumentError('domain, schema and steps only apply to web checks');
          }
          this.validatePingCount(args.count);
          const patch: any = {};
          for (const key of [
            'displayName', 'name', 'description', 'host', 'count', 'percentPktsNotReceiveInTime',
            'timeoutInMSPktsNotReceive', 'domain', 'schema', 'preferredCollectorId',
          ]) {
            if (args[key] !== undefined) patch[key] = args[key];
          }
          if (args.pollingInterval !== undefined) patch.pollingInterval = args.pollingInterval;
          if (args.pollingInterval !== undefined || args.useDefaultAlertSetting !== undefined) {
            patch.useDefaultAlertSetting = this.resolveUptimeAlertSetting(args);
          }
          if (args.testLocation !== undefined) {
            const { useDefaultLocationSetting, testLocation } = await this.resolveUptimeLocation(
              existing.isInternal === true,
              args.testLocation,
            );
            patch.useDefaultLocationSetting = useDefaultLocationSetting;
            patch.testLocation = testLocation;
          }
          if (args.steps) patch.steps = args.steps.map((step: any) => this.withStepDefaults(step));
          if (Object.keys(patch).length === 0) {
            throw new InvalidArgumentError('No changes specified; provide at least one field to update');
          }
          return await this.client.updateDevice(args.deviceId, patch, { opType: 'replace' });
        }

        // Website Groups
        case 'list_website_groups': {
          const result = await this.client.listWebsiteGroups({
            size: args.size,
            offset: args.offset,
            filter: args.filter,
            fields: args.fields,
            autoPaginate: args.autoPaginate,
          });

          if (args.fields) {
            return result;
          }

          return {
            ...result,
            items: result.items.map((group: any) =>
              filterFields(group, DEFAULT_WEBSITE_GROUP_FIELDS),
            ),
          };
        }

        case 'get_website_group':
          return await this.client.getWebsiteGroup(args.groupId, {
            fields: args.fields,
          });

        case 'create_website_group': {
          const group: Record<string, any> = { name: args.name, parentId: args.parentId ?? 1 };
          Object.assign(group, this.websiteGroupFields(args));
          return await this.client.createWebsiteGroup(group);
        }

        case 'update_website_group':
          return await this.client.updateWebsiteGroup(
            args.groupId,
            this.websiteGroupFields(args, true),
            args.opType ? { opType: args.opType } : undefined,
          );

        case 'delete_website_group':
          return await this.client.deleteWebsiteGroup(args.groupId);

        case 'list_website_group_websites': {
          const result = await this.client.listWebsiteGroupWebsites(args.groupId, {
            size: args.size,
            offset: args.offset,
            filter: args.filter,
            fields: args.fields,
            autoPaginate: args.autoPaginate,
          });
          if (args.fields) {
            return result;
          }
          return {
            ...result,
            items: result.items.map((website: any) => filterFields(website, DEFAULT_WEBSITE_FIELDS)),
          };
        }

        case 'list_website_group_sdts':
          return await this.client.listWebsiteGroupSdts(args.groupId, {
            size: args.size,
            offset: args.offset,
            filter: args.filter,
            fields: args.fields,
            autoPaginate: args.autoPaginate,
          });

        // Users
        case 'list_users': {
          const result = await this.client.listUsers({
            size: args.size,
            offset: args.offset,
            filter: args.filter,
            fields: args.fields,
            autoPaginate: args.autoPaginate,
          });

          if (args.fields) {
            return result;
          }

          return {
            ...result,
            items: result.items.map((user: any) => {
              const curated: any = filterFields(user, DEFAULT_USER_FIELDS);
              // Each role object carries its whole privilege list; the id and name are what a user listing needs.
              if ('roles' in curated) curated.roles = compactRoles(curated.roles);
              return curated;
            }),
          };
        }

        case 'get_user':
          return await this.client.getUser(args.userId, {
            fields: args.fields,
          });

        // Roles
        case 'list_roles': {
          const result = await this.client.listRoles({
            size: args.size,
            offset: args.offset,
            filter: args.filter,
            fields: args.fields,
            autoPaginate: args.autoPaginate,
          });

          if (args.fields) {
            return result;
          }

          return {
            ...result,
            items: result.items.map((role: any) =>
              filterFields(role, DEFAULT_ROLE_FIELDS),
            ),
          };
        }

        case 'get_role':
          return await this.client.getRole(args.roleId, {
            fields: args.fields,
          });

        // API Tokens
        case 'list_api_tokens': {
          const result = await this.client.listApiTokens(args.userId, {
            size: args.size,
            offset: args.offset,
            filter: args.filter,
            fields: args.fields,
            autoPaginate: args.autoPaginate,
          });

          if (args.fields) {
            return result;
          }

          return {
            ...result,
            items: result.items.map((token: any) =>
              filterFields(token, DEFAULT_API_TOKEN_FIELDS),
            ),
          };
        }

        // SDTs
        case 'list_sdts': {
          const result = await this.client.listSDTs({
            size: args.size,
            offset: args.offset,
            filter: args.filter,
            fields: args.fields,
            autoPaginate: args.autoPaginate,
          });

          if (args.fields) {
            return result;
          }

          return {
            ...result,
            items: result.items.map((sdt: any) =>
              filterFields(sdt, DEFAULT_SDT_FIELDS),
            ),
          };
        }

        case 'get_sdt':
          return await this.client.getSDT(args.sdtId, {
            fields: args.fields,
          });

        case 'create_resource_sdt': {
          const sdt: any = {
            sdtType: 1, // Device SDT
            deviceId: args.deviceId,
            type: args.type,
            startDateTime: toEpochMillis(args.startDateTime),
            endDateTime: toEpochMillis(args.endDateTime),
          };
          const hasDsId = args.deviceDataSourceId !== undefined && args.deviceDataSourceId !== null;
          const hasInstanceId = args.instanceId !== undefined && args.instanceId !== null;
          if (args.type === 'DeviceDataSourceSDT') {
            if (!hasDsId) {
              throw new InvalidArgumentError('type "DeviceDataSourceSDT" needs deviceDataSourceId (the "id" from list_resource_datasources); refusing so it never becomes a device-wide SDT');
            }
            if (hasInstanceId) {
              throw new InvalidArgumentError('instanceId was given with type "DeviceDataSourceSDT"; use type "DeviceDataSourceInstanceSDT" to silence one instance');
            }
            sdt.sdtType = 'oneTime';
            sdt.deviceDataSourceId = args.deviceDataSourceId;
          } else if (args.type === 'DeviceDataSourceInstanceSDT') {
            if (!hasInstanceId || !hasDsId) {
              throw new InvalidArgumentError('type "DeviceDataSourceInstanceSDT" needs both deviceDataSourceId (the "id" from list_resource_datasources) and instanceId (the "id" from list_resource_instances); refusing so it never becomes a device-wide SDT');
            }
            // LogicMonitor also wants the datasource and instance names, so look them up.
            const instances = await this.client.listDeviceDataSourceInstances(
              args.deviceId,
              args.deviceDataSourceId,
              { filter: `id:${args.instanceId}`, fields: 'id,name,displayName,dataSourceName' },
            );
            const instance = instances?.items?.find((i: any) => Number(i.id) === Number(args.instanceId));
            if (!instance) {
              throw new InvalidArgumentError(`No instance ${args.instanceId} found under deviceDataSourceId ${args.deviceDataSourceId} on device ${args.deviceId}; get both ids from list_resource_datasources and list_resource_instances`);
            }
            const deviceDs = await this.client.getDeviceDataSource(
              args.deviceId,
              args.deviceDataSourceId,
              { fields: 'id,dataSourceName' },
            );
            sdt.sdtType = 'oneTime';
            sdt.deviceDataSourceId = args.deviceDataSourceId;
            sdt.deviceDataSourceInstanceId = args.instanceId;
            sdt.dataSourceName = instance.dataSourceName ?? deviceDs?.dataSourceName;
            sdt.dataSourceInstanceName = instance.name;
          } else if (hasDsId || hasInstanceId) {
            throw new InvalidArgumentError('deviceDataSourceId / instanceId only apply to type "DeviceDataSourceSDT" / "DeviceDataSourceInstanceSDT"; refusing so the SDT is not silently widened to the whole device');
          }
          if (args.comment) sdt.comment = args.comment;
          return await this.client.createDeviceSDT(sdt);
        }

        case 'delete_sdt':
          return await this.client.deleteSDT(args.sdtId);

        // ConfigSources
        case 'list_configsources': {
          const result = await this.client.listConfigSources({
            size: args.size,
            offset: args.offset,
            filter: args.filter,
            fields: args.fields,
            autoPaginate: args.autoPaginate,
          });

          if (args.fields) {
            return result;
          }

          return {
            ...result,
            items: result.items.map((configsource: any) =>
              filterFields(configsource, DEFAULT_CONFIGSOURCE_FIELDS),
            ),
          };
        }

        case 'get_configsource':
          return await this.client.getConfigSource(args.configSourceId, {
            fields: args.fields,
          });

        case 'create_configsource':
          return await this.client.createConfigSource({
            name: args.name,
            displayName: args.displayName,
            description: args.description,
            appliesTo: args.appliesTo,
            group: args.group,
            technology: args.technology,
            tags: args.tags,
            collectMethod: args.collectMethod,
            collectInterval: args.collectInterval,
            collectorAttribute: normalizeCollectorAttribute(args.collectorAttribute, args.collectMethod, true),
            hasMultiInstances: args.hasMultiInstances,
            enableAutoDiscovery: args.enableAutoDiscovery,
            autoDiscoveryConfig: args.autoDiscoveryConfig,
            fileFormat: args.fileFormat,
            timestampFormat: args.timestampFormat,
            configChecks: args.configChecks,
          });

        case 'get_configsource_scripts': {
          const configSource = await this.client.getConfigSource(args.configSourceId);
          return {
            configSourceId: args.configSourceId,
            scripts: extractConfigSourceScripts(configSource),
          };
        }

        case 'update_configsource': {
          const { configSourceId, allowConfigCheckRemoval, ...updates } = args;
          if (updates.collectorAttribute !== undefined) {
            updates.collectorAttribute = normalizeCollectorAttribute(updates.collectorAttribute, updates.collectMethod, false);
          }
          await this.checkConfigChecksKept(configSourceId, updates, isTrue(allowConfigCheckRemoval));
          return await this.client.updateConfigSource(configSourceId, updates);
        }

        case 'delete_configsource':
          return await this.client.deleteConfigSource(args.configSourceId);

        // PropertySources
        case 'list_propertysources': {
          const result = await this.client.listPropertySources({
            size: args.size,
            offset: args.offset,
            filter: args.filter,
            fields: args.fields,
            autoPaginate: args.autoPaginate,
          });

          if (args.fields) {
            return result;
          }

          return {
            ...result,
            items: result.items.map((propertysource: any) =>
              filterFields(propertysource, DEFAULT_PROPERTYSOURCE_FIELDS),
            ),
          };
        }

        case 'get_propertysource':
          return await this.client.getPropertySource(args.propertySourceId, {
            fields: args.fields,
          });

        // Device Properties
        case 'list_resource_properties': {
          const result = await this.client.listDeviceProperties(args.deviceId, {
            size: args.size,
            offset: args.offset,
            filter: args.filter,
            fields: args.fields,
            autoPaginate: args.autoPaginate,
          });

          if (args.fields) {
            return result;
          }

          return {
            ...result,
            items: result.items.map((property: any) =>
              filterFields(property, DEFAULT_DEVICE_PROPERTY_FIELDS),
            ),
          };
        }

        case 'update_resource_property': {
          const targetName = await this.resolveResourceName(args.deviceId);
          return this.withResourceTarget(
            await this.client.updateDeviceProperty(args.deviceId, args.propertyName, args.value),
            args.deviceId,
            targetName,
          );
        }

        case 'set_resource_property_bulk': {
          const MAX_BULK = 100;
          const ids = parseJsonArray(args.deviceIds);
          if (args.propertyName === undefined || args.value === undefined) {
            throw new Error('Missing required argument for set_resource_property_bulk: propertyName and value');
          }
          if ((ids === undefined) === (args.filter === undefined)) {
            throw new Error('set_resource_property_bulk needs exactly one of deviceIds or filter');
          }
          let targets: Array<{ id: number; displayName?: string }>;
          if (ids !== undefined) {
            if (!Array.isArray(ids)) throw new Error('deviceIds must be an array of resource ids');
            targets = ids.map((id: any) => ({ id: Number(id) }));
          } else {
            const found = await this.client.listResources({ filter: args.filter, fields: 'id,displayName', autoPaginate: true });
            targets = found.items.map((d: any) => ({ id: d.id, displayName: d.displayName }));
          }
          if (targets.length > MAX_BULK) {
            throw new Error(`set_resource_property_bulk is limited to ${MAX_BULK} resources per call (got ${targets.length}); narrow the selection`);
          }
          const dryRun = args.dryRun === undefined ? true : isTrue(args.dryRun);
          const newValue = String(args.value);
          const rows = [];
          for (const target of targets) {
            const row: any = { deviceId: target.id, displayName: target.displayName, oldValue: null, newValue };
            try {
              if (row.displayName === undefined) {
                const device = await this.client.getDevice(target.id, { fields: 'id,displayName' });
                row.displayName = device.displayName;
              }
              const existing = await this.client.listDeviceProperties(target.id, {
                filter: `name:"${args.propertyName}"`,
                fields: 'name,value',
              });
              const current = existing.items.find((p: any) => p.name === args.propertyName);
              row.oldValue = current ? current.value : null;
              const unchanged = current !== undefined && current.value === newValue;
              if (dryRun) {
                row.status = unchanged ? 'unchanged' : current ? 'would-update' : 'would-create';
              } else if (unchanged) {
                row.status = 'unchanged';
              } else {
                const written = await this.client.updateDeviceProperty(target.id, args.propertyName, newValue);
                row.status = written.action;
              }
            } catch (error) {
              row.status = 'error';
              row.error = error instanceof Error ? error.message : String(error);
            }
            rows.push(row);
          }
          return { dryRun, propertyName: args.propertyName, total: rows.length, results: rows };
        }

        case 'delete_resource_property': {
          const targetName = await this.resolveResourceName(args.deviceId);
          return this.withResourceTarget(
            await this.client.deleteDeviceProperty(args.deviceId, args.propertyName),
            args.deviceId,
            targetName,
          );
        }

        case 'schedule_resource_discovery':
        {
          const response = await this.client.scheduleDeviceDiscovery(args.deviceId);
          return {
            scheduled: true,
            deviceId: args.deviceId,
            scheduledAt: new Date().toISOString(),
            response,
            hint: 'Discovery runs asynchronously on the collector and nothing reports when it finishes. Wait a few seconds to a couple of minutes, then re-list with list_resource_instances (or list_resource_datasources) and compare with what was there before.',
          };
        }

        // Audit Logs
        case 'list_audit_logs': {
          // Handle query parameter - convert to filter
          const filter = this.combineQueryAndFilter(args.query, args.filter, SEARCH_FIELDS.auditLogs, name);

          const result = await this.client.listAuditLogs({
            size: args.size,
            offset: args.offset,
            filter: filter,
            fields: args.fields,
            autoPaginate: args.autoPaginate,
          });

          if (args.fields) {
            return result;
          }

          return {
            ...result,
            items: result.items.map((auditLog: any) =>
              filterFields(auditLog, DEFAULT_AUDIT_LOG_FIELDS),
            ),
          };
        }

        case 'get_audit_log':
          return await this.client.getAuditLog(args.auditLogId, {
            fields: args.fields,
          });

        // Integration Logs
        case 'list_integration_logs': {
          const filter = this.combineQueryAndFilter(args.query, args.filter, SEARCH_FIELDS.integrationLogs, name);

          const result = await this.client.listIntegrationLogs({
            size: args.size,
            offset: args.offset,
            filter: filter,
            fields: args.fields,
            sort: args.sort,
            autoPaginate: args.autoPaginate,
          });

          if (args.fields) {
            return result;
          }

          return {
            ...result,
            items: result.items.map((integrationLog: any) =>
              filterFields(integrationLog, DEFAULT_INTEGRATION_LOG_FIELDS),
            ),
          };
        }

        // Access Groups
        case 'list_access_groups': {
          const result = await this.client.listAccessGroups({
            size: args.size,
            offset: args.offset,
            filter: args.filter,
            fields: args.fields,
            autoPaginate: args.autoPaginate,
          });

          if (args.fields) {
            return result;
          }

          return {
            ...result,
            items: result.items.map((accessGroup: any) =>
              filterFields(accessGroup, DEFAULT_ACCESS_GROUP_FIELDS),
            ),
          };
        }

        case 'get_access_group':
          return await this.client.getAccessGroup(args.accessGroupId, {
            fields: args.fields,
          });

        case 'create_access_group': {
          const data: any = {
            name: args.name,
            description: args.description,
          };
          if (args.tenantId !== undefined) data.tenantId = args.tenantId;
          return await this.client.createAccessGroup(data);
        }

        case 'update_access_group': {
          const data: any = {};
          if (args.name !== undefined) data.name = args.name;
          if (args.description !== undefined) data.description = args.description;
          if (args.tenantId !== undefined) data.tenantId = args.tenantId;
          return await this.client.updateAccessGroup(args.accessGroupId, data);
        }

        case 'delete_access_group':
          return await this.client.deleteAccessGroup(args.accessGroupId);

        // Device DataSources
        case 'list_resource_datasources':
          return await this.client.listDeviceDataSources(args.deviceId, {
            size: args.size,
            offset: args.offset,
            filter: args.filter,
            fields: args.fields,
            autoPaginate: args.autoPaginate,
          });

        case 'list_datasource_resources':
          return await this.client.listDataSourceDevices(args.dataSourceId, {
            size: args.size,
            offset: args.offset,
            filter: args.filter,
            fields: args.fields,
            autoPaginate: args.autoPaginate,
          });

        case 'get_resource_datasource':
          return await this.client.getDeviceDataSource(args.deviceId, args.deviceDataSourceId, {
            fields: args.fields,
          });

        case 'update_resource_datasource': {
          const data: any = {};
          if (args.disableAlerting !== undefined) data.disableAlerting = args.disableAlerting;
          if (args.stopMonitoring !== undefined) data.stopMonitoring = args.stopMonitoring;
          return await this.client.updateDeviceDataSource(args.deviceId, args.deviceDataSourceId, data);
        }

        // EventSources
        case 'list_eventsources':
          return await this.client.listEventSources({
            size: args.size,
            offset: args.offset,
            filter: args.filter,
            fields: args.fields,
            autoPaginate: args.autoPaginate,
          });

        case 'get_eventsource':
          return await this.client.getEventSource(args.eventSourceId, {
            fields: args.fields,
          });

        // Escalation Chains
        case 'list_escalation_chains':
          return await this.client.listEscalationChains({
            size: args.size,
            offset: args.offset,
            filter: args.filter,
            fields: args.fields,
            autoPaginate: args.autoPaginate,
          });

        case 'get_escalation_chain':
          return await this.client.getEscalationChain(args.chainId, {
            fields: args.fields,
          });

        case 'create_escalation_chain': {
          const chain: any = {
            name: args.name,
            description: args.description || '',
          };
          if (args.stages) chain.stages = args.stages;
          return await this.client.createEscalationChain(chain);
        }

        case 'update_escalation_chain': {
          const chain: any = {};
          if (args.name) chain.name = args.name;
          if (args.description !== undefined) chain.description = args.description;
          if (args.stages) chain.stages = args.stages;
          return await this.client.updateEscalationChain(args.chainId, chain);
        }

        case 'delete_escalation_chain':
          return await this.client.deleteEscalationChain(args.chainId);

        // Recipients
        case 'list_recipients':
          return await this.client.listRecipients({
            size: args.size,
            offset: args.offset,
            filter: args.filter,
            fields: args.fields,
            autoPaginate: args.autoPaginate,
          });

        case 'get_recipient':
          return await this.client.getRecipient(args.recipientId, {
            fields: args.fields,
          });

        case 'create_recipient': {
          const recipient: any = {
            type: args.type,
            addr: args.addr,
          };
          if (args.name) recipient.name = args.name;
          if (args.method) recipient.method = args.method;
          return await this.client.createRecipient(recipient);
        }

        case 'update_recipient': {
          const recipient: any = {};
          if (args.name) recipient.name = args.name;
          if (args.addr) recipient.addr = args.addr;
          if (args.method) recipient.method = args.method;
          return await this.client.updateRecipient(args.recipientId, recipient);
        }

        case 'delete_recipient':
          return await this.client.deleteRecipient(args.recipientId);

        // Recipient Groups
        case 'list_recipient_groups':
          return await this.client.listRecipientGroups({
            size: args.size,
            offset: args.offset,
            filter: args.filter,
            fields: args.fields,
            autoPaginate: args.autoPaginate,
          });

        case 'get_recipient_group':
          return await this.client.getRecipientGroup(args.groupId, {
            fields: args.fields,
          });

        case 'create_recipient_group': {
          const group: any = {
            name: args.name,
          };
          if (args.description) group.description = args.description;
          if (args.recipientIds) group.recipientIds = args.recipientIds;
          return await this.client.createRecipientGroup(group);
        }

        case 'update_recipient_group': {
          const group: any = {};
          if (args.name) group.name = args.name;
          if (args.description !== undefined) group.description = args.description;
          if (args.recipientIds) group.recipientIds = args.recipientIds;
          return await this.client.updateRecipientGroup(args.groupId, group);
        }

        case 'delete_recipient_group':
          return await this.client.deleteRecipientGroup(args.groupId);

        // Alert Rules
        case 'list_alert_rules':
          return await this.client.listAlertRules({
            size: args.size,
            offset: args.offset,
            filter: args.filter,
            fields: args.fields,
            autoPaginate: args.autoPaginate,
          });

        case 'get_alert_rule':
          return await this.client.getAlertRule(args.ruleId, {
            fields: args.fields,
          });

        case 'create_alert_rule': {
          const rule: any = {
            name: args.name,
            priority: args.priority || 10,
            // The API field is escalatingChainId (list_alert_rules reports it under that name).
            escalatingChainId: args.escalatingChainId ?? args.escalationChainId,
          };
          Object.assign(rule, alertRuleMatch(args));
          return await this.client.createAlertRule(rule);
        }

        case 'update_alert_rule': {
          const rule: any = {};
          if (args.name) rule.name = args.name;
          if (args.priority !== undefined) rule.priority = args.priority;
          if (args.escalationChainId || args.escalatingChainId) rule.escalatingChainId = args.escalatingChainId ?? args.escalationChainId;
          Object.assign(rule, alertRuleMatch(args));
          return await this.client.updateAlertRule(args.ruleId, rule);
        }

        case 'delete_alert_rule':
          return await this.client.deleteAlertRule(args.ruleId);

        // OpsNotes
        case 'list_opsnotes':
          return await this.client.listOpsNotes({
            size: args.size,
            offset: args.offset,
            filter: args.filter,
            fields: args.fields,
            autoPaginate: args.autoPaginate,
          });

        case 'get_opsnote':
          return await this.client.getOpsNote(args.opsNoteId, {
            fields: args.fields,
          });

        case 'create_opsnote': {
          const opsNote: any = {
            note: args.note,
            scopes: opsNoteScopes(args) ?? [],
          };
          if (args.tags) opsNote.tags = opsNoteTags(args.tags);
          if (args.happenOnInSec) opsNote.happenOnInSec = args.happenOnInSec;
          return await this.client.createOpsNote(opsNote);
        }

        case 'update_opsnote': {
          const opsNote: any = {};
          if (args.note) opsNote.note = args.note;
          const scopes = opsNoteScopes(args);
          if (scopes) opsNote.scopes = scopes;
          if (args.tags) opsNote.tags = opsNoteTags(args.tags);
          if (args.happenOnInSec) opsNote.happenOnInSec = args.happenOnInSec;
          return await this.client.updateOpsNote(args.opsNoteId, opsNote);
        }

        case 'delete_opsnote':
          return await this.client.deleteOpsNote(args.opsNoteId);

        // Report Groups
        case 'list_report_groups':
          return await this.client.listReportGroups({
            size: args.size,
            offset: args.offset,
            filter: args.filter,
            fields: args.fields,
            autoPaginate: args.autoPaginate,
          });

        case 'get_report_group':
          return await this.client.getReportGroup(args.groupId, {
            fields: args.fields,
          });

        case 'create_report_group': {
          const group: any = {
            name: args.name,
          };
          if (args.description) group.description = args.description;
          return await this.client.createReportGroup(group);
        }

        case 'update_report_group': {
          const group: any = {};
          if (args.name) group.name = args.name;
          if (args.description !== undefined) group.description = args.description;
          return await this.client.updateReportGroup(args.groupId, group);
        }

        case 'delete_report_group':
          return await this.client.deleteReportGroup(args.groupId);

        // Collector Groups
        case 'list_collector_groups':
          return await this.client.listCollectorGroups({
            size: args.size,
            offset: args.offset,
            filter: args.filter,
            fields: args.fields,
            autoPaginate: args.autoPaginate,
          });

        case 'get_collector_group':
          return await this.client.getCollectorGroup(args.groupId, {
            fields: args.fields,
          });

        case 'delete_collector_group':
          return await this.client.deleteCollectorGroup(args.groupId);

        case 'update_collector_group': {
          const { groupId, opType, ...groupData } = args;
          return await this.client.updateCollectorGroup(groupId, groupData, {
            opType: opType || 'replace',
          });
        }

        // Device Group Properties
        case 'list_resource_group_properties':
          return await this.client.listDeviceGroupProperties(args.groupId, {
            size: args.size,
            offset: args.offset,
            filter: args.filter,
            fields: args.fields,
            autoPaginate: args.autoPaginate,
          });

        case 'update_resource_group_property':
          return await this.client.updateDeviceGroupProperty(
            args.groupId,
            args.propertyName,
            args.value,
          );

        case 'delete_resource_group_property':
          return await this.client.deleteDeviceGroupProperty(args.groupId, args.propertyName);

        // Device Group DataSources (group-level datasource associations & threshold overrides)
        case 'list_resource_group_datasources':
          return await this.client.listDeviceGroupDataSources(args.groupId, {
            size: args.size,
            offset: args.offset,
            filter: args.filter,
            fields: args.fields,
            autoPaginate: args.autoPaginate,
          });

        case 'get_resource_group_datasource_thresholds': {
          const settings: any = await this.client.getDeviceGroupDataSourceAlertSettings(
            args.groupId,
            args.dataSourceId,
          );
          if (!settings || !Array.isArray(settings.dpConfig)) return settings;
          // Say what each interval means for this DataSource (polls and minutes); -1 means inherited, so use the global value.
          const collectInterval = await this.readCollectInterval(args.dataSourceId);
          const inherit = (value: unknown, globalValue: unknown) => (value === -1 ? globalValue : value);
          return {
            ...settings,
            dpConfig: settings.dpConfig.map((rawDp: any) => {
              const dp = withParsedThreshold(withParsedThreshold(rawDp), 'globalAlertExpr');
              const meaning = describeAlertIntervals(
                inherit(dp.alertTransitionInterval, dp.globalAlertTransitionInterval),
                inherit(dp.alertClearTransitionInterval, dp.globalAlertClearTransitionInterval),
                collectInterval,
              );
              return meaning ? { ...dp, alertIntervals: meaning } : dp;
            }),
          };
        }

        case 'update_resource_group_datasource_thresholds': {
          // The write endpoint requires alertTransitionInterval/alertClearTransitionInterval/alertForNoData
          // to be present with valid values (-1, the "inherited" value the read endpoint reports, is rejected
          // as out-of-range) even when only alertExpr is changing. Fetch current settings and backfill them
          // from the matching datapoint's existing (or, if unset, global) value so callers only ever need to
          // supply dataPointId/dataPointName + alertExpr/disableAlerting, per this tool's documented contract.
          const current: any = await this.client.getDeviceGroupDataSourceAlertSettings(
            args.groupId,
            args.dataSourceId,
          );
          const currentByKey = new Map<string, any>();
          for (const dp of current.dpConfig || []) {
            currentByKey.set(String(dp.dataPointId), dp);
            currentByKey.set(dp.dataPointName, dp);
          }

          const resolveInterval = (value: number, globalValue: number) => (value === -1 ? globalValue : value);

          const dpConfig = (args.dpConfig || []).map((rawEntry: any) => {
            const entry = applyAlertThresholds(rawEntry);
            const key = entry.dataPointId !== undefined ? String(entry.dataPointId) : entry.dataPointName;
            const match = currentByKey.get(key);
            if (!match) {
              throw new MCPError(
                `Datapoint not found on datasource ${args.dataSourceId} for group ${args.groupId}: ${key}`,
                ErrorCodes.INVALID_PARAMETERS,
                { groupId: args.groupId, dataSourceId: args.dataSourceId, requested: key },
                [
                  'Use "get_datasource" or "get_resource_group_datasource_thresholds" to see valid datapoint names/IDs for this datasource',
                ],
              );
            }
            return {
              dataPointId: match.dataPointId,
              dataPointName: match.dataPointName,
              alertExpr: entry.alertExpr !== undefined ? entry.alertExpr : match.alertExpr,
              disableAlerting: entry.disableAlerting !== undefined ? entry.disableAlerting : match.disableAlerting,
              alertTransitionInterval: resolveInterval(match.alertTransitionInterval, match.globalAlertTransitionInterval),
              alertClearTransitionInterval: resolveInterval(match.alertClearTransitionInterval, match.globalAlertClearTransitionInterval),
              alertForNoData: resolveInterval(match.alertForNoData, match.globalAlertForNoData),
            };
          });

          const groupResult: any = await this.client.updateDeviceGroupDataSourceAlertSettings(
            args.groupId,
            args.dataSourceId,
            dpConfig,
          );
          // An empty override alertExpr inherits the datasource's global threshold, so judge that one.
          const groupWarnings = dpConfig
            .map((dp: any) => {
              const global = currentByKey.get(String(dp.dataPointId))?.globalAlertExpr;
              return anyOccurrenceWarning(dp.dataPointName, dp.alertExpr || global, dp.alertTransitionInterval);
            })
            .filter((w: string | undefined): w is string => !!w);
          return groupWarnings.length > 0 && groupResult && typeof groupResult === 'object'
            ? { ...groupResult, warning: groupWarnings.join(' ') }
            : groupResult;
        }

        // Netscans
        case 'list_netscans':
          return await this.client.listNetscans({
            size: args.size,
            offset: args.offset,
            filter: args.filter,
            fields: args.fields,
            autoPaginate: args.autoPaginate,
          });

        case 'get_netscan':
          return await this.client.getNetscan(args.netscanId, {
            fields: args.fields,
          });

        case 'create_netscan':
          return await this.client.createNetscan(buildNetscanCreate(args));

        case 'update_netscan': {
          let method: string | undefined;
          if (updateNeedsMethod(args)) {
            const current: any = await this.client.getNetscan(args.netscanId, { fields: 'method' });
            method = current?.method;
          }
          return await this.client.updateNetscan(
            args.netscanId,
            buildNetscanUpdate(args, method),
            args.reason ? { reason: args.reason } : undefined,
          );
        }

        case 'list_netscan_groups':
          return await this.client.listNetscanGroups({
            size: args.size,
            offset: args.offset,
            filter: args.filter,
            fields: args.fields,
            autoPaginate: args.autoPaginate,
          });

        case 'create_netscan_group': {
          const group: Record<string, any> = { name: args.name };
          if (args.description !== undefined) group.description = args.description;
          return await this.client.createNetscanGroup(group);
        }

        case 'update_netscan_group': {
          const group: Record<string, any> = {};
          if (args.name !== undefined) group.name = args.name;
          if (args.description !== undefined) group.description = args.description;
          return await this.client.updateNetscanGroup(args.groupId, group);
        }

        case 'delete_netscan_group':
          return await this.client.deleteNetscanGroup(args.groupId);

        case 'delete_netscan':
          return await this.client.deleteNetscan(args.netscanId);

        // Integrations
        case 'list_integrations':
          return await this.client.listIntegrations({
            size: args.size,
            offset: args.offset,
            filter: args.filter,
            fields: args.fields,
            autoPaginate: args.autoPaginate,
          });

        case 'get_integration':
          return await this.client.getIntegration(args.integrationId, {
            fields: args.fields,
          });

        case 'create_integration': {
          const integration: any = {
            name: args.name,
            type: args.type,
          };
          if (args.url) integration.url = args.url;
          if (args.extra) integration.extra = args.extra;
          return await this.client.createIntegration(integration);
        }

        case 'update_integration': {
          const integration: any = {};
          if (args.name) integration.name = args.name;
          if (args.url) integration.url = args.url;
          if (args.extra) integration.extra = args.extra;
          return await this.client.updateIntegration(args.integrationId, integration);
        }

        case 'delete_integration':
          return await this.client.deleteIntegration(args.integrationId);

        // Website Checkpoints
        case 'list_website_checkpoints':
          return await this.client.listWebsiteCheckpoints({
            fields: args.fields,
          });

        // Topology
        case 'get_topology':
          return await this.client.getTopology({
            fields: args.fields,
          });

        case 'list_collector_events':
          return await this.client.listCollectorEvents(args.collectorId, {
            size: args.size,
            offset: args.offset,
            filter: args.filter,
            fields: args.fields,
            autoPaginate: args.autoPaginate,
          });

        // Collector Versions
        case 'list_collector_versions':
          return await this.client.listCollectorVersions({
            size: args.size,
            offset: args.offset,
            fields: args.fields,
          });

        default:
          throw new MCPError(
            `Unknown tool: ${name}`,
            ErrorCodes.INVALID_PARAMETERS,
            { toolName: name },
            [
              'Check the tool name spelling',
              'Run list_tools to see available tools',
              'Verify you are using a supported tool version',
            ],
          );
      }
    } catch (error) {
      // If it's already an MCPError, re-throw it
      if (error instanceof MCPError) {
        throw error;
      }

      // If it's a LogicMonitor API error, convert to MCPError with suggestions
      if (error instanceof LogicMonitorApiError) {
        throw this.convertLMErrorToMCPError(error, name);
      }

      // An argument problem found before calling the API is the caller's to fix, not a server fault
      if (error instanceof InvalidArgumentError) {
        throw createMCPError(error, {
          operation: name,
          code: ErrorCodes.INVALID_PARAMETERS,
          suggestions: ['Correct the argument described in the message and call the tool again'],
        });
      }

      // For other errors, wrap them in MCPError
      if (error instanceof Error) {
        throw createMCPError(error, {
          operation: name,
          code: ErrorCodes.INTERNAL_ERROR,
          suggestions: [
            'Check the server logs for more details',
            'Verify your LogicMonitor credentials are valid',
            'Ensure the API endpoint is accessible',
          ],
        });
      }
      throw error;
    }
  }

  /**
   * Combine a free-text "query" search with an explicit "filter" into a single
   * filter string for the LogicMonitor API.
   *
   * LogicMonitor's documented filter syntax only supports comma-separated AND
   * logic - there is no operator precedence or grouping (no parentheses), and
   * mixing OR with AND in one filter is rejected by the API with a 400.
   * When "query" expands across more than one field in `searchFields`, it
   * becomes an OR expression, so it cannot be safely combined with an
   * additional "filter" (AND) in a single request. In that case, this throws
   * an MCPError explaining how to get equivalent results via separate calls
   * instead of sending a request that is guaranteed to fail.
   */
  private withStepDefaults(step: any) {
    return { HTTPMethod: 'GET', matchType: 'plain', enable: true, followRedirection: true, ...step };
  }

  private validatePingCount(count: number | undefined) {
    if (count !== undefined && ![5, 10, 15, 20, 30, 50].includes(count)) {
      throw new InvalidArgumentError('count must be one of 5, 10, 15, 20, 30, 50');
    }
  }

  /**
   * LM ignores pollingInterval while default alert settings are on (it uses the account
   * default), so a requested interval only takes effect with useDefaultAlertSetting false.
   */
  private resolveUptimeAlertSetting(args: any): boolean {
    if (args.pollingInterval !== undefined && args.useDefaultAlertSetting === true) {
      throw new InvalidArgumentError(
        'pollingInterval cannot be combined with useDefaultAlertSetting: true (LM would ignore it and use the account default interval). Omit pollingInterval, or set useDefaultAlertSetting: false.',
      );
    }
    return args.pollingInterval !== undefined ? false : (args.useDefaultAlertSetting ?? true);
  }

  /**
   * External checks follow the account default uptime locations unless specific smgIds are
   * given. The API still requires smgIds in the payload even when the default-location flag
   * is set (it ignores them in that case), so fill them in with the enabled checkpoints.
   */
  private async resolveUptimeLocation(isInternal: boolean, loc?: any) {
    const collectorIds: number[] = loc?.collectorIds ?? [];
    let smgIds: number[] = loc?.smgIds ?? [];
    if (collectorIds.length && smgIds.length) {
      throw new InvalidArgumentError('testLocation.collectorIds and testLocation.smgIds cannot be used together');
    }
    if (isInternal && smgIds.length) {
      throw new InvalidArgumentError('testLocation.smgIds is only valid for external checks');
    }
    if (!isInternal && collectorIds.length) {
      throw new InvalidArgumentError('testLocation.collectorIds is only valid for internal checks (set isInternal: true)');
    }
    if (isInternal && !collectorIds.length) {
      throw new InvalidArgumentError('testLocation.collectorIds is required for internal checks');
    }
    const useDefaultLocationSetting = !isInternal && !smgIds.length;
    if (useDefaultLocationSetting) {
      const checkpoints = await this.client.listWebsiteCheckpoints();
      smgIds = (checkpoints.items ?? [])
        .filter((c: any) => c.isEnabledInRoot !== false)
        .map((c: any) => c.id);
      if (!smgIds.length) {
        throw new InvalidArgumentError('No enabled checkpoint locations found; specify testLocation.smgIds explicitly');
      }
    }
    return {
      useDefaultLocationSetting,
      testLocation: {
        collectorIds,
        smgIds,
        all: isInternal ? (loc?.all ?? smgIds.length === 0) : false,
      },
    };
  }

  /**
   * Best-effort display name of a resource, looked up before a write so the result can show which
   * resource was hit (an alert's resourceId is a deviceDataSourceId and can match an unrelated device).
   */
  private async resolveResourceName(deviceId: number): Promise<string | undefined> {
    try {
      const device = await this.client.getDevice(deviceId, { fields: 'id,displayName' });
      return (device as any)?.displayName;
    } catch {
      return undefined;
    }
  }

  private withResourceTarget(result: any, deviceId: number, displayName: string | undefined) {
    const base = result && typeof result === 'object' && !Array.isArray(result) ? result : {};
    return { ...base, target: { deviceId, displayName } };
  }

  private combineQueryAndFilter(
    query: string | undefined,
    filter: string | undefined,
    searchFields: string[],
    toolName: string,
  ): string | undefined {
    if (!query) return filter;

    if (filter && searchFields.length > 1) {
      const escapedQuery = escapeFilterValue(query.trim());
      const perFieldFilters = searchFields.map(
        (field) => `${field}~"*${escapedQuery}*",${filter}`,
      );
      throw new MCPError(
        `Cannot combine "query" with "filter" in a single "${toolName}" call here. ` +
          `LogicMonitor's filter API only supports comma-separated AND logic (no OR+AND mixing, ` +
          `no parentheses/grouping - see LogicMonitor's REST API Developer's Guide). Searching ` +
          `"${query}" across multiple fields (${searchFields.join(', ')}) requires OR logic, which ` +
          `cannot be combined with your additional "filter" in one request.`,
        ErrorCodes.INVALID_PARAMETERS,
        { toolName, query, filter, searchFields },
        [
          `To get equivalent results, make ${searchFields.length} separate "${toolName}" calls instead (one per field), each combined with your filter via AND, then merge/dedupe the results yourself:`,
          ...perFieldFilters.map((f, i) => `${i + 1}. filter: ${f}`),
        ],
      );
    }

    const queryFilter = autoFormatFilter(query, searchFields);
    return filter ? `${queryFilter},${filter}` : queryFilter;
  }

  /**
   * Convert LogicMonitor API error to MCPError with contextual suggestions
   */
  private convertLMErrorToMCPError(error: LogicMonitorApiError, toolName: string): MCPError {
    const httpStatus = error.status;
    const lmError = error.errorMessage;

    // Determine error code and suggestions based on operation and HTTP status
    let code: string = ErrorCodes.API_REQUEST_FAILED;
    let suggestions: string[] = [];

    // Authentication errors (401, 403)
    if (httpStatus === 403 && lmError && !looksLikePermissionDenial(lmError)) {
      // LogicMonitor also answers 403 when an operation conflicts with the state of the object
      // (for example deleting a group that still contains websites); the token is not the problem.
      code = ErrorCodes.OPERATION_NOT_ALLOWED;
      suggestions = [
        `LogicMonitor refused the operation: ${lmError.trim()}`,
        'This is a condition on the object or the request, not a token or permission problem: resolve it and retry',
      ];
      if (/delete|empty|contain|remove/i.test(lmError)) {
        suggestions.push('Move or delete what the object still contains (list its contents first), then retry the delete');
      }
    }
    else if (httpStatus === 401 || httpStatus === 403) {
      code = httpStatus === 401 ? ErrorCodes.AUTHENTICATION_FAILED : ErrorCodes.INSUFFICIENT_PERMISSIONS;
      suggestions = [...ErrorSuggestions.authentication];
    }
    // Not found errors (404)
    else if (httpStatus === 404) {
      if (toolName.includes('device') || toolName.includes('resource')) {
        code = ErrorCodes.DEVICE_NOT_FOUND;
        suggestions = [
          'Verify the device ID exists',
          'Check if the device was recently deleted',
          'Use list_resources to find the correct ID',
        ];
      } else if (toolName.includes('group')) {
        code = ErrorCodes.GROUP_NOT_FOUND;
        suggestions = [...ErrorSuggestions.groupOperations];
      } else if (toolName.includes('alert')) {
        code = ErrorCodes.ALERT_NOT_FOUND;
        suggestions = [...ErrorSuggestions.alertOperations];
      } else {
        suggestions = [
          'Verify the resource ID exists',
          'Check if the resource was recently deleted',
          'Use the appropriate list command to find valid IDs',
        ];
      }
    }
    // Rate limit errors (429)
    else if (httpStatus === 429) {
      code = ErrorCodes.RATE_LIMIT_EXCEEDED;
      suggestions = [...ErrorSuggestions.rateLimit];
    }
    // Validation errors (400)
    else if (httpStatus === 400) {
      code = ErrorCodes.INVALID_PARAMETERS;
      suggestions = [...ErrorSuggestions.validation];

      // Add operation-specific suggestions
      if (toolName.includes('create')) {
        if (toolName.includes('device') || toolName.includes('resource')) {
          code = ErrorCodes.DEVICE_CREATE_FAILED;
          suggestions = [...ErrorSuggestions.deviceCreate];
        } else if (toolName.includes('group')) {
          code = ErrorCodes.GROUP_CREATE_FAILED;
          suggestions = [...ErrorSuggestions.groupOperations];
        }
      } else if (toolName.includes('update')) {
        if (toolName.includes('device') || toolName.includes('resource')) {
          code = ErrorCodes.DEVICE_UPDATE_FAILED;
          suggestions = [...ErrorSuggestions.deviceUpdate];
        } else if (toolName.includes('group')) {
          code = ErrorCodes.GROUP_UPDATE_FAILED;
          suggestions = [...ErrorSuggestions.groupOperations];
        }
      } else if (toolName.includes('delete')) {
        if (toolName.includes('device') || toolName.includes('resource')) {
          code = ErrorCodes.DEVICE_DELETE_FAILED;
          suggestions = [...ErrorSuggestions.deviceDelete];
        } else if (toolName.includes('group')) {
          code = ErrorCodes.GROUP_DELETE_FAILED;
          suggestions = [...ErrorSuggestions.groupOperations];
        }
      } else if (toolName.includes('acknowledge_alert')) {
        code = ErrorCodes.ALERT_ACK_FAILED;
        suggestions = [...ErrorSuggestions.alertOperations];
      } else if (toolName.includes('alert_note')) {
        code = ErrorCodes.ALERT_NOTE_FAILED;
        suggestions = [...ErrorSuggestions.alertOperations];
      } else if (/time range/i.test(lmError ?? '')) {
        suggestions = [
          'start/end must be epoch SECONDS (not milliseconds), e.g. Math.floor(Date.now()/1000) - 3600',
          'start must be before end and before the current time',
          'Omit start/end to get the default recent window',
        ];
      }
    }
    // Server errors (5xx)
    else if (httpStatus >= 500) {
      code = ErrorCodes.API_REQUEST_FAILED;
      suggestions = [
        'LogicMonitor API is experiencing issues',
        'Wait a few moments and retry',
        'Check LogicMonitor status page',
        'Contact LogicMonitor support if the issue persists',
      ];
    }
    // Network/timeout errors
    else if (httpStatus === 0 || httpStatus === -1) {
      code = ErrorCodes.NETWORK_ERROR;
      suggestions = [...ErrorSuggestions.networkError];
    }

    return new MCPError(
      lmError || error.message,
      code,
      {
        tool: toolName,
        httpStatus,
        apiError: error.toJSON(),
      },
      suggestions,
    );
  }

  formatResponse(data: any): string {
    return JSON.stringify(data, null, 2);
  }

  /**
   * Handles completion requests for prompt arguments
   *
   * @param ref Reference to the prompt or resource
   * @param argument The argument being completed
   * @returns Completion suggestions
   */
  async handleCompletion(
    ref: { type: string; name?: string; uri?: string },
    argument: { name: string; value: string },
  ): Promise<{ values: string[]; total?: number; hasMore?: boolean }> {
    // Only support prompt completions for now
    if (ref.type === 'ref/prompt' && ref.name === 'resource_check') {
      // Only support resourceName argument
      if (argument.name === 'resourceName') {
        const searchValue = argument.value || '';

        // Build OR filter to search across name, displayName, and IP
        // Using OR (||) to find resources matching any of these fields
        let filter = '';
        if (searchValue) {
          const filters = [
            `name~"${searchValue}"`,
            `displayName~"${searchValue}"`,
            `name:"${searchValue}"`, // Exact IP match
          ];
          filter = filters.join('||');
        }

        try {
          // Search for resources with a limit of 100 (max per MCP spec)
          const result = await this.client.listResources({
            size: 100,
            offset: 0,
            filter,
            fields: 'displayName,name', // Only need displayName and name
          });

          const items = result.items || [];
          const total = result.total || items.length;

          // Extract displayNames for completion suggestions
          const values = items
            .map((item: any) => item.displayName || item.name)
            .filter((name: string) => name); // Remove any null/undefined

          return {
            values,
            total,
            hasMore: total > values.length,
          };
        } catch (error) {
          // On error, return empty suggestions
          console.error('[LogicMonitor MCP] Completion error:', error);
          return {
            values: [],
            total: 0,
            hasMore: false,
          };
        }
      }
    }

    // Unsupported completion - return empty
    return {
      values: [],
      total: 0,
      hasMore: false,
    };
  }
}
