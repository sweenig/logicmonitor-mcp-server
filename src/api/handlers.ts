/**
 * LogicMonitor MCP Tool Handlers
 *
 * Implementation of tool handlers for LogicMonitor API operations
 */

import { LogicMonitorClient } from './client.js';
import { batchProcessor, smartBatchProcessor as _smartBatchProcessor } from '../utils/helpers/batch-processor.js';
import { isTrue, parseJsonArray, parseJsonObject } from '../utils/helpers/coerce.js';
import { buildNetscanCreate, buildNetscanUpdate, updateNeedsMethod } from '../utils/helpers/netscan-payload.js';
import { buildWebsiteCreate, buildWebsiteUpdate } from '../utils/helpers/website-payload.js';
import { websiteCheckpointRows } from '../utils/helpers/website-data.js';
import { alertRuleMatch, opsNoteScopes, opsNoteTags } from '../utils/helpers/write-params.js';
import { autoFormatFilter, escapeFilterValue, SEARCH_FIELDS } from '../utils/helpers/filters.js';
import { extractDataSourceScripts, extractConfigSourceScripts } from '../utils/helpers/logicmodule-scripts.js';
import { toEpochSeconds, toEpochMillis } from '../utils/helpers/epoch.js';
import { curateDataSource } from '../utils/helpers/datasource-view.js';
import { runDebugCommand, fetchDebugResult, normalizeWaitSeconds } from '../utils/helpers/debug-command.js';
import { compactWriteResult, isConciseResultTool } from '../utils/helpers/write-result.js';
import { findMissingRequired } from '../utils/helpers/validate-args.js';
import { getLogicMonitorTools } from './tools.js';
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
  'widgetsConfigVersion', 'widgetTokens',
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

    const result = await this.runToolCall(name, callArgs, progressCallback);

    // Create/update responses can be very large (a whole DataSource, a whole resource); shorten them
    // unless the caller asked for everything.
    return !returnFull && isConciseResultTool(name) ? compactWriteResult(result) : result;
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
   * LogicMonitor replaces the datapoint list on update and blanks the originId (its cross-version
   * identity for a datapoint) of any existing datapoint sent without one. Callers copy datapoints from
   * get_datasource, which does not show originId, so fill it in from the current definition for
   * datapoints that carry an id. Best effort: if the lookup fails the update goes ahead unchanged.
   */
  private async keepDatapointOriginIds(dataSourceId: number, updates: Record<string, any>): Promise<void> {
    const dataPoints = updates.dataPoints;
    if (!Array.isArray(dataPoints)) return;
    const needsOrigin = (dp: any) => dp && typeof dp === 'object' && dp.id !== undefined && dp.originId === undefined;
    if (!dataPoints.some(needsOrigin)) return;
    try {
      const current: any = await this.client.getDataSource(dataSourceId, { fields: 'dataPoints' });
      const originById = new Map<string, string>();
      for (const dp of current?.dataPoints ?? []) {
        if (dp?.id !== undefined && typeof dp.originId === 'string' && dp.originId !== '') {
          originById.set(String(dp.id), dp.originId);
        }
      }
      updates.dataPoints = dataPoints.map((dp: any) =>
        needsOrigin(dp) && originById.has(String(dp.id)) ? { ...dp, originId: originById.get(String(dp.id)) } : dp);
    } catch {
      // Keep the caller's datapoints as they are.
    }
  }

  private async runToolCall(
    name: string,
    args: any,
    progressCallback?: ProgressCallback,
  ): Promise<any> {
    try {
      // Reject calls missing required arguments before any request is built, since
      // request paths interpolate IDs (a missing one would hit /.../undefined).
      const missing = findMissingRequired(
        toolsByName().get(name),
        args,
      );
      if (missing.length) {
        throw new MCPError(
          `Missing required argument${missing.length > 1 ? 's' : ''} for ${name}: ${missing.join(', ')}`,
          ErrorCodes.MISSING_REQUIRED_FIELD,
          { toolName: name, missing },
          [
            `Provide: ${missing.join(', ')}`,
            `Check the inputSchema for ${name} for the full parameter list`,
          ],
        );
      }

      switch (name) {
        // Resource Management
        case 'list_resources': {
          // Handle query parameter - convert to filter
          const filter = this.combineQueryAndFilter(args.query, args.filter, SEARCH_FIELDS.devices, name);

          const result = await this.client.listResources({
            size: args.size,
            offset: args.offset,
            filter: filter,
            fields: args.fields,
            autoPaginate: args.autoPaginate,
          });

          // If user specified fields, return raw data
          if (args.fields) {
            return result;
          }

          // Otherwise, return curated fields
          return {
            ...result,
            items: result.items.map((device: any) =>
              filterFields(device, DEFAULT_DEVICE_FIELDS),
            ),
          };
        }

        case 'get_resource':
          return await this.client.getDevice(args.deviceId, {
            fields: args.fields,
          });

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
                await this.client.deleteDevice(deviceId, {
                  deleteFromSystem: args.deleteFromSystem,
                });
                return { id: deviceId };
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
          return await this.client.deleteDevice(args.deviceId, {
            deleteFromSystem: args.deleteFromSystem,
          });
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
          const dataSource = await this.client.getDataSource(args.dataSourceId, {
            fields: args.fields,
          });
          // An explicit fields selection is returned as asked; the full definition (every script,
          // alert template and access group) is too large to be a useful default.
          return args.fields ? dataSource : curateDataSource(dataSource);
        }

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

        case 'create_datasource':
          return await this.client.createDataSource({
            name: args.name,
            displayName: args.displayName,
            description: args.description,
            appliesTo: args.appliesTo,
            group: args.group,
            technology: args.technology,
            tags: args.tags,
            collectMethod: args.collectMethod,
            collectInterval: args.collectInterval,
            collectorAttribute: args.collectorAttribute,
            dataPoints: args.dataPoints,
            // hasMultiInstances is create-only in LM; default to true when Active Discovery is on
            hasMultiInstances: args.hasMultiInstances ?? (args.enableAutoDiscovery ? true : undefined),
            enableAutoDiscovery: args.enableAutoDiscovery,
            autoDiscoveryConfig: args.autoDiscoveryConfig,
            enableEriDiscovery: args.enableEriDiscovery,
            eriDiscoveryConfig: args.eriDiscoveryConfig,
          });

        case 'update_datasource': {
          const { dataSourceId, ...updates } = args;
          await this.keepDatapointOriginIds(dataSourceId, updates);
          return await this.client.updateDataSource(dataSourceId, updates);
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
          const result = await this.client.listDashboards({
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
          if (args.sharable !== undefined) dashboard.sharable = args.sharable;
          if (args.widgetTokens) dashboard.widgetTokens = parseJsonArray(args.widgetTokens);
          return await this.client.createDashboard(dashboard);
        }

        case 'update_dashboard': {
          const { dashboardId, ...dashboardData } = args;
          if (dashboardData.widgetTokens !== undefined) dashboardData.widgetTokens = parseJsonArray(dashboardData.widgetTokens);
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

        case 'get_widget':
          return await this.client.getWidget(args.widgetId, {
            fields: args.fields,
          });

        case 'create_widget': {
          const { config, ...widgetFields } = args;
          const widget: any = { ...widgetFields };
          if (config) Object.assign(widget, config);
          return await this.client.createWidget(widget);
        }

        case 'update_widget': {
          const { widgetId, config, ...widgetFields } = args;
          const widget: any = { ...widgetFields };
          if (config) Object.assign(widget, config);
          return await this.client.updateWidget(widgetId, widget);
        }

        case 'delete_widget':
          return await this.client.deleteWidget(args.widgetId);

        case 'get_widget_data':
          return await this.client.getWidgetData(args.widgetId, {
            start: toEpochSeconds(args.start),
            end: toEpochSeconds(args.end),
            format: args.format,
          });

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
            items: result.items.map((user: any) =>
              filterFields(user, DEFAULT_USER_FIELDS),
            ),
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
            collectorAttribute: args.collectorAttribute,
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
          const { configSourceId, ...updates } = args;
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

        case 'update_resource_property':
          return await this.client.updateDeviceProperty(
            args.deviceId,
            args.propertyName,
            args.value,
          );

        case 'delete_resource_property':
          return await this.client.deleteDeviceProperty(args.deviceId, args.propertyName);

        case 'schedule_resource_discovery':
          return await this.client.scheduleDeviceDiscovery(args.deviceId);

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

        case 'get_resource_group_datasource_thresholds':
          return await this.client.getDeviceGroupDataSourceAlertSettings(
            args.groupId,
            args.dataSourceId,
          );

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

          const dpConfig = (args.dpConfig || []).map((entry: any) => {
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

          return await this.client.updateDeviceGroupDataSourceAlertSettings(
            args.groupId,
            args.dataSourceId,
            dpConfig,
          );
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
