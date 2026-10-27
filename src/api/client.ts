/**
 * LogicMonitor API Client
 *
 * HTTP client for interacting with LogicMonitor REST API v3
 * Documentation: https://www.logicmonitor.com/swagger-ui-master/api-v3/dist/
 */

import { rateLimiter } from '../utils/core/rate-limiter.js';
import { formatLogicMonitorFilter } from '../utils/helpers/filters.js';
import { LogicMonitorApiError } from '../utils/core/lm-error.js';
import { parseNextPageParams, mergeInstanceDataPages, annotateTruncation, summarizeInstanceData } from '../utils/helpers/instance-data.js';

/** Safety cap on pages followed when autoPaginate is requested for instance data. */
const DEFAULT_MAX_DATA_PAGES = 10;
// Window LogicMonitor uses for instance data when no range is given (about the last hour).
const DEFAULT_DATA_WINDOW_SECONDS = 3600;

export interface LogicMonitorConfig {
  company: string;
  bearerToken: string;
  timeout?: number; // Request timeout in milliseconds (default: 30000)
  logger?: (level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: any, requestId?: string) => void;
}

/**
 * Escape special characters in filter values according to LogicMonitor API requirements
 * Special characters that need escaping: ( ) : , ~ " \
 * Note: Asterisk (*) is NOT escaped as it's used for wildcards in search patterns
 */
export function escapeFilterValue(value: string): string {
  // Escape special characters with backslash
  // These characters have special meaning in LogicMonitor filter syntax
  // We exclude * from escaping as it's commonly used for wildcard searches
  return value.replace(/([(),:~"\\])/g, '\\$1');
}

// LogicMonitor API v3 returns single resource responses directly (not wrapped)
export type LMResponse<T> = T;

// LogicMonitor API v3 returns list responses with this structure
export interface LMListResponse<T> {
    total: number;
    items: T[];
  searchId?: string;
  isMin?: boolean;
}

export class LogicMonitorClient {
  private baseUrl: string;
  private bearerToken: string;
  private timeout: number;
  private logger?: (level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: any, requestId?: string) => void;

  constructor(config: LogicMonitorConfig) {
    this.baseUrl = `https://${config.company}.logicmonitor.com/santaba/rest`;
    this.bearerToken = config.bearerToken;
    this.timeout = config.timeout || 30000; // Default 30 seconds
    this.logger = config.logger;
  }

  /**
   * Clean and format request parameters
   * - Handles fields="*" by omitting it
   * - Formats filter strings automatically
   */
  private cleanParams(params?: Record<string, any>): Record<string, any> {
    if (!params) return {};

    const { fields, filter, ...otherParams } = params;
    return {
      ...otherParams,
      ...(fields && fields !== '*' ? { fields } : {}),
      ...(filter ? { filter: formatLogicMonitorFilter(filter) } : {}),
    };
  }

  /**
   * Make an authenticated HTTP request to LogicMonitor API
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    params?: Record<string, string | number | boolean>,
  ): Promise<T> {
    // An unset ID interpolated into a path (e.g. /setting/datasources/undefined) is always a
    // caller bug; fail before it reaches the LogicMonitor API.
    if (/\/(undefined|null|NaN)(\/|$)/.test(path)) {
      throw new Error(`Refusing to send ${method} ${path}: path contains an unset ID`);
    }
    return rateLimiter.executeWithRetry(
      () => this.attemptRequest<T>(method, path, body, params),
      'api-request',
    );
  }

  /**
   * Perform a single attempt of an authenticated HTTP request to LogicMonitor API.
   * Called (and retried on 429s) by request().
   */
  private async attemptRequest<T>(
    method: string,
    path: string,
    body?: unknown,
    params?: Record<string, string | number | boolean>,
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        // fields="*" means "every field", which is what omitting it returns. Some endpoints (for
        // example /website/websites/{id}) take "*" literally and answer with an empty object.
        if (key === 'fields' && value === '*') {
          return;
        }
        if (value !== undefined && value !== null) {
          // URLSearchParams.append() automatically does URL encoding
          // No special handling needed - standard encoding works for filters
          url.searchParams.append(key, String(value));
        }
      });
    }

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.bearerToken}`,
      'Accept': 'application/json',
      'X-Version': '3',
    };

    // Only add Content-Type header if there's a body
    if (body) {
      headers['Content-Type'] = 'application/json';
    }

    // Setup timeout with AbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    const options: RequestInit = {
      method,
      headers,
      signal: controller.signal,
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    // Log API request
    const startTime = Date.now();
    this.logger?.('debug', 'LM API Request', {
      method,
      path,
      url: url.toString(),
      params,
      timeout: this.timeout,
      headers: {
        ...(headers['Content-Type'] ? { 'Content-Type': headers['Content-Type'] } : {}),
        'Accept': headers['Accept'],
        'X-Version': headers['X-Version'],
        'Authorization': headers['Authorization'] ? `${headers['Authorization'].substring(0, 20)}...` : 'none',
      },
      body: body ? (JSON.stringify(body).length > 500 ? `${JSON.stringify(body).substring(0, 500)}... (truncated)` : body) : undefined,
    });

    let response: Response;
    let data: any;

    try {
      response = await fetch(url.toString(), options);
      // Some endpoints (e.g. instance data with format=csv) return non-JSON bodies.
      // Wrap those so downstream code still receives an object.
      const contentType = response.headers.get('content-type') || '';
      if (contentType && !/json/i.test(contentType)) {
        const text = await response.text();
        data = response.ok ? { format: 'csv', data: text } : { errmsg: text };
      } else {
        data = await response.json();
      }

      const duration = Date.now() - startTime;

      // Extract and update rate limit info from headers
      const rateLimitInfo = rateLimiter.extractRateLimitInfo(response.headers);
      if (rateLimitInfo) {
        rateLimiter.updateRateLimitInfo('api-request', rateLimitInfo);
        this.logger?.('debug', 'Rate limit info', rateLimitInfo);
      }

      // Log API response
      if (response.ok) {
        this.logger?.('debug', 'LM API Response', {
          status: response.status,
          duration_ms: duration,
          path,
          dataSize: JSON.stringify(data).length,
          responseStructure: {
            hasStatus: !!data.status,
            hasErrmsg: !!data.errmsg,
            hasData: !!data.data,
            topLevelKeys: Object.keys(data),
          },
          rateLimit: rateLimitInfo,
        });
      } else {
        this.logger?.('warn', 'LM API Error Response', {
          status: response.status,
          duration_ms: duration,
          path,
          url: url.toString(),
          error: data.errmsg || response.statusText,
          errorMessage: data.errorMessage,
          errorCode: data.errorCode,
          errorDetail: data.errorDetail,
          fullResponse: data,
          rateLimit: rateLimitInfo,
        });
      }

      if (!response.ok) {
        // Special handling for rate limit errors
        if (response.status === 429) {
          this.logger?.('warn', 'Rate limit exceeded', { rateLimitInfo });
        }

        // Throw detailed error with all LM API error information
        throw new LogicMonitorApiError(
          `LogicMonitor API Error: ${response.status}`,
          {
            status: response.status,
            errorCode: data.errorCode,
            errorMessage: data.errorMessage || data.errmsg || response.statusText,
            errorDetail: data.errorDetail,
            path,
            duration,
          },
        );
      }
    } catch (error) {
      const duration = Date.now() - startTime;

      // Check if error is due to timeout
      const isTimeout = error instanceof Error && error.name === 'AbortError';

      this.logger?.('error', 'LM API Request Failed', {
        method,
        path,
        duration_ms: duration,
        timeout: isTimeout,
        error: error instanceof Error ? error.message : String(error),
      });

      if (isTimeout) {
        throw new Error(`Request timeout after ${this.timeout}ms: ${method} ${path}`);
      }

      throw error;
    } finally {
      // Always clear timeout to prevent memory leaks
      clearTimeout(timeoutId);
    }

    return data;
  }

  /**
   * Generic pagination helper that automatically fetches all pages
   * @param path - The API path to paginate
   * @param params - Request parameters including optional size/offset
   * @returns Combined results from all pages
   */
  private async paginateAll<T>(
    path: string,
    params?: Record<string, string | number | boolean>,
  ): Promise<LMListResponse<T>> {
    const size = (params?.size as number) || 1000; // Default to max size for efficiency
    let offset = (params?.offset as number) || 0;
    const initialOffset = offset;
    let allItems: T[] = [];
    let totalCount = 0;
    let hasMore = true;

    this.logger?.('debug', 'Starting pagination', {
      path,
      initialSize: size,
      initialOffset: offset,
      params,
    });

    while (hasMore) {
      try {
        // Make the request with current pagination params
        const response = await this.request<any>(
          'GET',
          path,
          undefined,
          { ...params, size, offset },
        );

        // Log the actual response structure for debugging
        this.logger?.('debug', 'Pagination response structure', {
          path,
          offset,
          responseType: typeof response,
          responseKeys: response ? Object.keys(response) : undefined,
          hasTotal: !!(response?.total),
          hasItems: !!(response?.items),
        });

        // LM API v3 returns {total, items, searchId, isMin} directly
        if (!response || typeof response !== 'object') {
          throw new Error(`Invalid API response for ${path}: response is not an object`);
        }

        if (!('total' in response) || !('items' in response)) {
          this.logger?.('error', 'Unexpected response structure', {
            path,
            offset,
            responseKeys: Object.keys(response),
            response: JSON.stringify(response).substring(0, 500),
          });
          throw new Error(`Invalid API response structure for ${path}: missing total/items properties`);
        }

        // On first iteration, capture the total count
        if (offset === initialOffset) {
          totalCount = response.total || 0;
        }

        // Add items from this page
        const items = response.items || [];
        allItems = allItems.concat(items);

        this.logger?.('debug', 'Fetched page', {
          path,
          offset,
          requestedSize: size,
          returnedSize: items.length,
          totalSoFar: allItems.length,
          total: totalCount,
        });

        // Check if we have more pages
        if (items.length === 0 || allItems.length >= totalCount) {
          hasMore = false;
        } else {
          // Calculate next offset based on actual items returned
          offset += items.length;
        }
      } catch (error) {
        this.logger?.('error', 'Pagination failed', {
          path,
          offset,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }

    this.logger?.('info', 'Pagination complete', {
      path,
      totalPages: Math.ceil(allItems.length / size),
      totalItems: allItems.length,
      expectedTotal: totalCount,
    });

    return {
      total: totalCount,
      items: allItems,
    };
  }

  // Device Management
  /**
   * List resources with optional filtering
   *
   * Filter examples:
   * - Exact match: filter: 'id:123'
   * - Contains with wildcards: filter: 'displayName~"*server*"' (quotes required for wildcards)
   * - Multiple conditions (AND): filter: 'displayName~"*prod*",hostStatus:normal' (use comma, NOT &&)
   * - Multiple conditions (OR): filter: 'displayName~"*prod*" || displayName~"*dev*"'
   * - With special characters: Use escapeFilterValue() for user input
   *
   * IMPORTANT: Use comma (,) for AND operations, NOT &&
   *
   * Note: Filter parameter is automatically URL-encoded. For special characters in filter values,
   * use escapeFilterValue() to escape them before building the filter string.
   */
  async listResources(params?: {
    size?: number;
    offset?: number;
    filter?: string;
    fields?: string;
    autoPaginate?: boolean;
  }) {
    const { autoPaginate = false, ...otherParams } = params || {};
    const cleanedParams = this.cleanParams(otherParams);

    if (autoPaginate) {
      return this.paginateAll<any>('/device/devices', cleanedParams);
    }
    return this.request<LMListResponse<any>>('GET', '/device/devices', undefined, cleanedParams);
  }

  async getDevice(deviceId: number, params?: { fields?: string }) {
    return this.request<LMResponse<any>>('GET', `/device/devices/${deviceId}`, undefined, params);
  }

  async createDevice(device: any, params?: { type?: string }) {
    return this.request<LMResponse<any>>('POST', '/device/devices', device, params);
  }

  async updateDevice(deviceId: number, device: any, params?: { opType?: string }) {
    return this.request<LMResponse<any>>('PATCH', `/device/devices/${deviceId}`, device, params);
  }

  async deleteDevice(deviceId: number, params?: { deleteFromSystem?: boolean }) {
    return this.request<LMResponse<any>>('DELETE', `/device/devices/${deviceId}`, undefined, params);
  }

  // Device Groups
  async listDeviceGroups(params?: {
    size?: number;
    offset?: number;
    filter?: string;
    fields?: string;
    autoPaginate?: boolean;
  }) {
    const { autoPaginate = false, ...otherParams } = params || {};
    const cleanedParams = this.cleanParams(otherParams);

    if (autoPaginate) {
      return this.paginateAll<any>('/device/groups', cleanedParams);
    }
    return this.request<LMListResponse<any>>('GET', '/device/groups', undefined, cleanedParams);
  }

  async getDeviceGroup(groupId: number, params?: { fields?: string }) {
    return this.request<LMResponse<any>>('GET', `/device/groups/${groupId}`, undefined, params);
  }

  async createDeviceGroup(group: any) {
    return this.request<LMResponse<any>>('POST', '/device/groups', group);
  }

  async updateDeviceGroup(groupId: number, group: any, params?: { opType?: string }) {
    return this.request<LMResponse<any>>('PATCH', `/device/groups/${groupId}`, group, params);
  }

  async deleteDeviceGroup(groupId: number, params?: { deleteChildren?: boolean }) {
    return this.request<LMResponse<any>>('DELETE', `/device/groups/${groupId}`, undefined, params);
  }

  // Alert Management
  async listAlerts(params?: {
    size?: number;
    offset?: number;
    filter?: string;
    fields?: string;
    needMessage?: boolean;
    autoPaginate?: boolean;
  }) {
    const { autoPaginate = false, ...otherParams } = params || {};
    const cleanedParams = this.cleanParams(otherParams);

    if (autoPaginate) {
      return this.paginateAll<any>('/alert/alerts', cleanedParams);
    }
    return this.request<LMListResponse<any>>('GET', '/alert/alerts', undefined, cleanedParams);
  }

  async getAlert(alertId: string, params?: { fields?: string; needMessage?: boolean }) {
    return this.request<LMResponse<any>>('GET', `/alert/alerts/${alertId}`, undefined, params);
  }

  async acknowledgeAlert(alertId: string, ackComment?: string) {
    return this.request<LMResponse<any>>('POST', `/alert/alerts/${alertId}/ack`, {
      ackComment: ackComment || 'Acknowledged via MCP',
    });
  }

  async addAlertNote(alertId: string, note: string) {
    return this.request<LMResponse<any>>('POST', `/alert/alerts/${alertId}/note`, {
      note,
    });
  }

  // Collectors
  async listCollectors(params?: {
    size?: number;
    offset?: number;
    filter?: string;
    fields?: string;
    autoPaginate?: boolean;
  }) {
    const { autoPaginate = false, ...otherParams } = params || {};
    const cleanedParams = this.cleanParams(otherParams);

    if (autoPaginate) {
      return this.paginateAll<any>('/setting/collector/collectors', cleanedParams);
    }
    return this.request<LMListResponse<any>>('GET', '/setting/collector/collectors', undefined, cleanedParams);
  }

  async getCollector(collectorId: number, params?: { fields?: string }) {
    return this.request<LMResponse<any>>('GET', `/setting/collector/collectors/${collectorId}`, undefined, params);
  }

  async listCollectorEvents(collectorId: number, params?: {
    size?: number;
    offset?: number;
    filter?: string;
    fields?: string;
    autoPaginate?: boolean;
  }) {
    const { autoPaginate = false, ...otherParams } = params || {};
    const cleanedParams = this.cleanParams(otherParams);
    const path = `/setting/collector/collectors/${encodeURIComponent(String(collectorId))}/events`;

    if (autoPaginate) {
      return this.paginateAll<any>(path, cleanedParams);
    }
    return this.request<LMListResponse<any>>('GET', path, undefined, cleanedParams);
  }

  async updateCollector(collectorId: number, collector: any, params?: {
    opType?: string;
    autoBalanceMonitoredDevices?: boolean;
    forceUpdateFailedOverDevices?: boolean;
  }) {
    return this.request<LMResponse<any>>('PATCH', `/setting/collector/collectors/${collectorId}`, collector, params);
  }

  async deleteCollector(collectorId: number) {
    return this.request<LMResponse<any>>('DELETE', `/setting/collector/collectors/${collectorId}`);
  }

  // Debug Commands
  async executeDebugCommand(cmdline: string, collectorId: number) {
    return this.request<LMResponse<any>>('POST', '/debug', { cmdline }, { collectorId });
  }

  async getDebugCommandResult(id: string, collectorId: number) {
    return this.request<LMResponse<any>>('GET', `/debug/${id}`, undefined, { collectorId });
  }

  // DataSources
  async listDataSources(params?: {
    size?: number;
    offset?: number;
    filter?: string;
    fields?: string;
    autoPaginate?: boolean;
  }) {
    const { autoPaginate = false, ...otherParams } = params || {};
    const cleanedParams = this.cleanParams(otherParams);

    if (autoPaginate) {
      return this.paginateAll<any>('/setting/datasources', cleanedParams);
    }
    return this.request<LMListResponse<any>>('GET', '/setting/datasources', undefined, cleanedParams);
  }

  async getDataSource(dataSourceId: number, params?: { fields?: string }) {
    return this.request<LMResponse<any>>('GET', `/setting/datasources/${dataSourceId}`, undefined, params);
  }

  // The DataSource-side view of device datasources: every resource the DataSource is applied to (the portal's "Associated Devices" list)
  async listDataSourceDevices(dataSourceId: number, params?: {
    size?: number;
    offset?: number;
    filter?: string;
    fields?: string;
    autoPaginate?: boolean;
  }) {
    const { autoPaginate = false, ...otherParams } = params || {};
    const cleanedParams = this.cleanParams(otherParams);

    if (autoPaginate) {
      return this.paginateAll<any>(`/setting/datasources/${dataSourceId}/devices`, cleanedParams);
    }
    return this.request<LMListResponse<any>>('GET', `/setting/datasources/${dataSourceId}/devices`, undefined, cleanedParams);
  }

  // DataSource graphs: overview graphs (ographs) show on the DataSource's overview page, instance graphs on each instance
  async listDataSourceOverviewGraphs(dataSourceId: number, params?: { size?: number; offset?: number; filter?: string; fields?: string }) {
    return this.request<LMListResponse<any>>('GET', `/setting/datasources/${dataSourceId}/ographs`, undefined, this.cleanParams(params || {}));
  }

  async getDataSourceOverviewGraph(dataSourceId: number, graphId: number, params?: { fields?: string }) {
    return this.request<LMResponse<any>>('GET', `/setting/datasources/${dataSourceId}/ographs/${graphId}`, undefined, params);
  }

  async listDataSourceGraphs(dataSourceId: number, params?: { size?: number; offset?: number; filter?: string; fields?: string }) {
    return this.request<LMListResponse<any>>('GET', `/setting/datasources/${dataSourceId}/graphs`, undefined, this.cleanParams(params || {}));
  }

  async getDataSourceGraph(dataSourceId: number, graphId: number, params?: { fields?: string }) {
    return this.request<LMResponse<any>>('GET', `/setting/datasources/${dataSourceId}/graphs/${graphId}`, undefined, params);
  }

  async createDataSourceOverviewGraph(dataSourceId: number, graph: any) {
    return this.request<LMResponse<any>>('POST', `/setting/datasources/${dataSourceId}/ographs`, graph);
  }

  async updateDataSourceOverviewGraph(dataSourceId: number, graphId: number, graph: any) {
    return this.request<LMResponse<any>>('PATCH', `/setting/datasources/${dataSourceId}/ographs/${graphId}`, graph);
  }

  async deleteDataSourceOverviewGraph(dataSourceId: number, graphId: number) {
    return this.request<LMResponse<any>>('DELETE', `/setting/datasources/${dataSourceId}/ographs/${graphId}`);
  }

  async createDataSourceGraph(dataSourceId: number, graph: any) {
    return this.request<LMResponse<any>>('POST', `/setting/datasources/${dataSourceId}/graphs`, graph);
  }

  async updateDataSourceGraph(dataSourceId: number, graphId: number, graph: any) {
    return this.request<LMResponse<any>>('PATCH', `/setting/datasources/${dataSourceId}/graphs/${graphId}`, graph);
  }

  async deleteDataSourceGraph(dataSourceId: number, graphId: number) {
    return this.request<LMResponse<any>>('DELETE', `/setting/datasources/${dataSourceId}/graphs/${graphId}`);
  }

  // LogicMonitor rejects useWildValueAsUUID:true unless the request also carries forceUniqueIdentifier=true.
  // Turning it off on a DataSource with instances is refused with a one-time key; sending that key
  // (forceRestrictedChangeKey, with forceUniqueIdentifier=true) confirms the change.
  private uniqueIdentifierParams(dataSource: any): Record<string, string | boolean> | undefined {
    const params: Record<string, string | boolean> = {};
    if (dataSource?.useWildValueAsUUID === true || dataSource?.forceRestrictedChangeKey) {
      params.forceUniqueIdentifier = true;
    }
    if (dataSource?.forceRestrictedChangeKey) {
      params.forceRestrictedChangeKey = String(dataSource.forceRestrictedChangeKey);
    }
    return Object.keys(params).length > 0 ? params : undefined;
  }

  async createDataSource(dataSource: any) {
    return this.request<LMResponse<any>>('POST', '/setting/datasources', dataSource, this.uniqueIdentifierParams(dataSource));
  }

  async updateDataSource(dataSourceId: number, dataSource: any) {
    // forceRestrictedChangeKey is a query parameter, not part of the DataSource definition
    const { forceRestrictedChangeKey: _key, ...body } = dataSource ?? {};
    const path = `/setting/datasources/${dataSourceId}`;
    const params = this.uniqueIdentifierParams(dataSource);
    if (body.useWildValueAsUUID === true) {
      // LogicMonitor ignores forceUniqueIdentifier on PATCH, so turning useWildValueAsUUID on needs a
      // PUT of the whole definition: read the current one and apply the requested changes to it.
      const current = await this.getDataSource(dataSourceId);
      return this.request<LMResponse<any>>('PUT', path, { ...current, ...body }, params);
    }
    return this.request<LMResponse<any>>('PATCH', path, body, params);
  }

  async deleteDataSource(dataSourceId: number) {
    return this.request<LMResponse<any>>('DELETE', `/setting/datasources/${dataSourceId}`);
  }

  // Device DataSource Instances
  async listDeviceDataSourceInstances(
    deviceId: number,
    deviceDataSourceId: number,
    params?: {
      size?: number;
      offset?: number;
      filter?: string;
      fields?: string;
      autoPaginate?: boolean;
    },
  ) {
    const { autoPaginate = false, ...otherParams } = params || {};
    const cleanedParams = this.cleanParams(otherParams);

    if (autoPaginate) {
      return this.paginateAll<any>(
        `/device/devices/${deviceId}/devicedatasources/${deviceDataSourceId}/instances`,
        cleanedParams,
      );
    }
    return this.request<LMListResponse<any>>(
      'GET',
      `/device/devices/${deviceId}/devicedatasources/${deviceDataSourceId}/instances`,
      undefined,
      cleanedParams,
    );
  }

  async getDeviceDataSourceInstanceData(
    deviceId: number,
    deviceDataSourceId: number,
    instanceId: number,
    params?: {
      datapoints?: string;
      start?: number;
      end?: number;
      format?: string;
      autoPaginate?: boolean;
      maxPages?: number;
      summarize?: boolean;
    },
  ) {
    const {
      autoPaginate = false,
      maxPages = DEFAULT_MAX_DATA_PAGES,
      summarize = false,
      ...apiParams
    } = params || {};
    const path = `/device/devices/${deviceId}/devicedatasources/${deviceDataSourceId}/instances/${instanceId}/data`;

    // LogicMonitor only honours a complete start+end pair. With just `start` it returns start..start+1h
    // (not start..now, and without any truncation marker), and with just `end` it ignores `end` and returns
    // the default window ending now. Fill in the missing half so the range means what the caller asked for.
    if (apiParams.start !== undefined && apiParams.end === undefined) {
      apiParams.end = Math.floor(Date.now() / 1000);
    } else if (apiParams.end !== undefined && apiParams.start === undefined) {
      apiParams.start = apiParams.end - DEFAULT_DATA_WINDOW_SECONDS;
    }

    // Paging and summarizing need structured samples, so they override format=csv.
    const needsJson = autoPaginate || summarize;
    const requestParams = needsJson ? { ...apiParams, format: undefined } : apiParams;

    let result = await this.request<any>('GET', path, undefined, requestParams);
    if (needsJson || requestParams.format !== 'csv') {
      if (autoPaginate) {
        let pages = 1;
        while (result.nextPageParams && pages < Math.max(1, maxPages)) {
          const older = await this.request<any>(
            'GET', path, undefined, { ...requestParams, ...parseNextPageParams(result.nextPageParams) },
          );
          result = mergeInstanceDataPages(result, older);
          pages++;
        }
      }
      result = annotateTruncation(result);
      if (summarize) {
        return summarizeInstanceData(result);
      }
    }
    return result;
  }

  // Dashboards
  async listDashboards(params?: {
    size?: number;
    offset?: number;
    filter?: string;
    fields?: string;
    autoPaginate?: boolean;
  }) {
    const { autoPaginate = false, ...otherParams } = params || {};
    const cleanedParams = this.cleanParams(otherParams);

    if (autoPaginate) {
      return this.paginateAll<any>('/dashboard/dashboards', cleanedParams);
    }
    return this.request<LMListResponse<any>>('GET', '/dashboard/dashboards', undefined, cleanedParams);
  }

  async getDashboard(dashboardId: number, params?: { fields?: string }) {
    return this.request<LMResponse<any>>('GET', `/dashboard/dashboards/${dashboardId}`, undefined, params);
  }

  async createDashboard(dashboard: any) {
    return this.request<LMResponse<any>>('POST', '/dashboard/dashboards', dashboard);
  }

  async updateDashboard(dashboardId: number, dashboard: any) {
    return this.request<LMResponse<any>>('PATCH', `/dashboard/dashboards/${dashboardId}`, dashboard);
  }

  async deleteDashboard(dashboardId: number) {
    return this.request<LMResponse<any>>('DELETE', `/dashboard/dashboards/${dashboardId}`);
  }

  // Widgets
  async listWidgets(params?: {
    dashboardId?: number;
    size?: number;
    offset?: number;
    filter?: string;
    fields?: string;
    autoPaginate?: boolean;
  }) {
    const { dashboardId, autoPaginate = false, ...otherParams } = params || {};
    const cleanedParams = this.cleanParams(otherParams);
    const path = dashboardId
      ? `/dashboard/dashboards/${dashboardId}/widgets`
      : '/dashboard/widgets';

    if (autoPaginate) {
      return this.paginateAll<any>(path, cleanedParams);
    }
    return this.request<LMListResponse<any>>('GET', path, undefined, cleanedParams);
  }

  async getWidget(widgetId: number, params?: { fields?: string }) {
    return this.request<LMResponse<any>>('GET', `/dashboard/widgets/${widgetId}`, undefined, params);
  }

  async createWidget(widget: any) {
    return this.request<LMResponse<any>>('POST', '/dashboard/widgets', widget);
  }

  async updateWidget(widgetId: number, widget: any) {
    return this.request<LMResponse<any>>('PATCH', `/dashboard/widgets/${widgetId}`, widget);
  }

  async deleteWidget(widgetId: number) {
    return this.request<LMResponse<any>>('DELETE', `/dashboard/widgets/${widgetId}`);
  }

  async getWidgetData(widgetId: number, params?: { start?: number; end?: number; format?: string }) {
    const { start, end, ...otherParams } = params || {};

    // LogicMonitor rejects a lone `start` ("Invalid time range") and silently ignores a lone `end`
    // (returning the widget's default window ending now). Complete a lone start with "now"; refuse a
    // lone end, because the widget's default span differs per widget and guessing one would hide it.
    if (end !== undefined && start === undefined) {
      throw new Error('get_widget_data: end needs a start (LogicMonitor ignores an end without a start); pass both start and end');
    }
    const range = start !== undefined && end === undefined
      ? { start, end: Math.floor(Date.now() / 1000) }
      : { start, end };

    return this.request<LMResponse<any>>(
      'GET',
      `/dashboard/widgets/${widgetId}/data`,
      undefined,
      this.cleanParams({ ...otherParams, ...range }),
    );
  }

  /**
   * Generate a link URL for a dashboard
   * The URL follows the pattern: https://{company}.logicmonitor.com/santaba/uiv4/dashboards/dashboardGroups-{groupId1},dashboardGroups-{groupId2},...,dashboards-{dashboardId}
   */
  async generateDashboardLink(dashboardId: number): Promise<{ url: string; dashboard: any; groupPath: any[] }> {
    // Get dashboard details to retrieve groupId
    const dashboard = await this.getDashboard(dashboardId, { fields: 'id,name,groupId,groupName' });

    if (!dashboard || !dashboard.id) {
      throw new LogicMonitorApiError(
        `Dashboard with ID ${dashboardId} not found`,
        {
          status: 404,
          path: `/dashboard/dashboards/${dashboardId}`,
          errorMessage: 'Dashboard not found',
        },
      );
    }

    // Build the group hierarchy path
    const groupPath: any[] = [];
    let currentGroupId = dashboard.groupId;

    // Traverse up the group hierarchy
    while (currentGroupId) {
      try {
        const group = await this.getDashboardGroup(currentGroupId, { fields: 'id,name,parentId' });
        groupPath.unshift(group); // Add to beginning to maintain correct order
        currentGroupId = group.parentId;
      } catch (error) {
        // If we can't fetch a parent group (e.g., root level), stop traversing
        this.logger?.('warn', `Could not fetch dashboard group ${currentGroupId}`, { error });
        break;
      }
    }

    // Build the URL path segments
    const groupSegments = groupPath.map(group => `dashboardGroups-${group.id}`).join(',');
    const dashboardSegment = `dashboards-${dashboardId}`;
    const pathSegments = groupSegments ? `${groupSegments},${dashboardSegment}` : dashboardSegment;

    // Construct the full URL
    const baseUrl = this.baseUrl.replace('/santaba/rest', '');
    const url = `${baseUrl}/santaba/uiv4/dashboards/${pathSegments}`;

    return {
      url,
      dashboard,
      groupPath,
    };
  }

  /**
   * Generate a link URL for a resource/device
   * The URL follows the pattern: https://{company}.logicmonitor.com/santaba/uiv4/resources/treeNodes?resourcePath=resourceGroups-{groupId1},resourceGroups-{groupId2},...,resources-{deviceId}
   * Note: Uses URL encoding (%2C) for commas in the actual URL
   */
  async generateResourceLink(deviceId: number): Promise<{ url: string; device: any; groupPath: any[] }> {
    // Get device details to retrieve hostGroupIds
    const device = await this.getDevice(deviceId, { fields: 'id,displayName,name,hostGroupIds' });

    if (!device || !device.id) {
      throw new LogicMonitorApiError(
        `Device with ID ${deviceId} not found`,
        {
          status: 404,
          path: `/device/devices/${deviceId}`,
          errorMessage: 'Device not found',
        },
      );
    }

    // Build the group hierarchy path
    const groupPath: any[] = [];

    // Device can have multiple hostGroupIds, use the first one (primary group)
    if (device.hostGroupIds && device.hostGroupIds.length > 0) {
      const deviceGroupIds = device.hostGroupIds.split(',').map((id: string) => parseInt(id.trim()));
      const primaryGroupId = deviceGroupIds[0];

      let currentGroupId = primaryGroupId;

      // Traverse up the group hierarchy
      while (currentGroupId) {
        try {
          const group = await this.getDeviceGroup(currentGroupId, { fields: 'id,name,parentId' });
          groupPath.unshift(group); // Add to beginning to maintain correct order
          currentGroupId = group.parentId;
        } catch (error) {
          // If we can't fetch a parent group (e.g., root level), stop traversing
          this.logger?.('warn', `Could not fetch device group ${currentGroupId}`, { error });
          break;
        }
      }
    }

    // Build the URL path segments
    const groupSegments = groupPath.map(group => `resourceGroups-${group.id}`).join(',');
    const resourceSegment = `resources-${deviceId}`;
    const pathSegments = groupSegments ? `${groupSegments},${resourceSegment}` : resourceSegment;

    // URL encode the path (commas become %2C)
    const encodedPath = encodeURIComponent(pathSegments);

    // Construct the full URL
    const baseUrl = this.baseUrl.replace('/santaba/rest', '');
    const url = `${baseUrl}/santaba/uiv4/resources/treeNodes?resourcePath=${encodedPath}`;

    return {
      url,
      device,
      groupPath,
    };
  }

  /**
   * Generate a link URL for an alert
   * The URL follows the pattern: https://{company}.logicmonitor.com/santaba/uiv4/alerts/{alertId}
   */
  async generateAlertLink(alertId: string): Promise<{ url: string; alert: any }> {
    // Get alert details to verify it exists
    const alert = await this.getAlert(alertId, { fields: 'id,internalId,type,severity,monitorObjectName' });

    if (!alert || !alert.id) {
      throw new LogicMonitorApiError(
        `Alert with ID ${alertId} not found`,
        {
          status: 404,
          path: `/alert/alerts/${alertId}`,
          errorMessage: 'Alert not found',
        },
      );
    }

    // Construct the full URL (simple, no hierarchy needed)
    const baseUrl = this.baseUrl.replace('/santaba/rest', '');
    const url = `${baseUrl}/santaba/uiv4/alerts/${alertId}`;

    return {
      url,
      alert,
    };
  }

  /**
   * Generate a link URL for a website
   * The URL follows the pattern: https://{company}.logicmonitor.com/santaba/uiv4/websites/treeNodes#websiteGroups-{groupId1},websiteGroups-{groupId2},...,websites-{websiteId}
   */
  async generateWebsiteLink(websiteId: number): Promise<{ url: string; website: any; groupPath: any[] }> {
    // Get website details to retrieve groupId
    const website = await this.getWebsite(websiteId, { fields: 'id,name,groupId' });

    if (!website || !website.id) {
      throw new LogicMonitorApiError(
        `Website with ID ${websiteId} not found`,
        {
          status: 404,
          path: `/website/websites/${websiteId}`,
          errorMessage: 'Website not found',
        },
      );
    }

    // Build the group hierarchy path
    const groupPath: any[] = [];
    let currentGroupId = website.groupId;

    // Traverse up the group hierarchy
    while (currentGroupId) {
      try {
        const group = await this.getWebsiteGroup(currentGroupId, { fields: 'id,name,parentId' });
        groupPath.unshift(group); // Add to beginning to maintain correct order
        currentGroupId = group.parentId;
      } catch (error) {
        // If we can't fetch a parent group (e.g., root level), stop traversing
        this.logger?.('warn', `Could not fetch website group ${currentGroupId}`, { error });
        break;
      }
    }

    // Build the URL path segments
    const groupSegments = groupPath.map(group => `websiteGroups-${group.id}`).join(',');
    const websiteSegment = `websites-${websiteId}`;
    const pathSegments = groupSegments ? `${groupSegments},${websiteSegment}` : websiteSegment;

    // Construct the full URL (uses hash # instead of query parameter)
    const baseUrl = this.baseUrl.replace('/santaba/rest', '');
    const url = `${baseUrl}/santaba/uiv4/websites/treeNodes#${pathSegments}`;

    return {
      url,
      website,
      groupPath,
    };
  }

  // Dashboard Groups
  async listDashboardGroups(params?: {
    size?: number;
    offset?: number;
    filter?: string;
    fields?: string;
    autoPaginate?: boolean;
  }) {
    const { autoPaginate = false, ...otherParams } = params || {};
    const cleanedParams = this.cleanParams(otherParams);

    if (autoPaginate) {
      return this.paginateAll<any>('/dashboard/groups', cleanedParams);
    }
    return this.request<LMListResponse<any>>('GET', '/dashboard/groups', undefined, cleanedParams);
  }

  async getDashboardGroup(groupId: number, params?: { fields?: string }) {
    return this.request<LMResponse<any>>('GET', `/dashboard/groups/${groupId}`, undefined, params);
  }

  // Reports
  async listReports(params?: {
    size?: number;
    offset?: number;
    filter?: string;
    fields?: string;
    autoPaginate?: boolean;
  }) {
    const { autoPaginate = false, ...otherParams } = params || {};
    const cleanedParams = this.cleanParams(otherParams);

    if (autoPaginate) {
      return this.paginateAll<any>('/report/reports', cleanedParams);
    }
    return this.request<LMListResponse<any>>('GET', '/report/reports', undefined, cleanedParams);
  }

  async getReport(reportId: number, params?: { fields?: string }) {
    return this.request<LMResponse<any>>('GET', `/report/reports/${reportId}`, undefined, params);
  }

  // Websites (Synthetic Monitoring)
  async listWebsites(params?: {
    size?: number;
    offset?: number;
    filter?: string;
    fields?: string;
    autoPaginate?: boolean;
  }) {
    const { autoPaginate = false, ...otherParams } = params || {};
    const cleanedParams = this.cleanParams(otherParams);

    if (autoPaginate) {
      return this.paginateAll<any>('/website/websites', cleanedParams);
    }
    return this.request<LMListResponse<any>>('GET', '/website/websites', undefined, cleanedParams);
  }

  async getWebsite(websiteId: number, params?: { fields?: string }) {
    return this.request<LMResponse<any>>('GET', `/website/websites/${websiteId}`, undefined, params);
  }

  async createWebsite(website: any) {
    return this.request<LMResponse<any>>('POST', '/website/websites', website);
  }

  async updateWebsite(websiteId: number, website: any, params?: { opType?: string }) {
    return this.request<LMResponse<any>>('PATCH', `/website/websites/${websiteId}`, website, params);
  }

  async deleteWebsite(websiteId: number) {
    return this.request<LMResponse<any>>('DELETE', `/website/websites/${websiteId}`);
  }

  async listWebsiteAlerts(websiteId: number, params?: {
    size?: number;
    offset?: number;
    filter?: string;
    fields?: string;
    needMessage?: boolean;
    autoPaginate?: boolean;
  }) {
    return this.listWebsiteSubresource(`/website/websites/${websiteId}/alerts`, params);
  }

  async listWebsiteProperties(websiteId: number, params?: {
    size?: number;
    offset?: number;
    filter?: string;
    fields?: string;
    autoPaginate?: boolean;
  }) {
    return this.listWebsiteSubresource(`/website/websites/${websiteId}/properties`, params);
  }

  async listWebsiteSdts(websiteId: number, params?: {
    size?: number;
    offset?: number;
    filter?: string;
    fields?: string;
    autoPaginate?: boolean;
  }) {
    return this.listWebsiteSubresource(`/website/websites/${websiteId}/sdts`, params);
  }

  async listWebsiteGroupWebsites(groupId: number, params?: {
    size?: number;
    offset?: number;
    filter?: string;
    fields?: string;
    autoPaginate?: boolean;
  }) {
    return this.listWebsiteSubresource(`/website/groups/${groupId}/websites`, params);
  }

  async listWebsiteGroupSdts(groupId: number, params?: {
    size?: number;
    offset?: number;
    filter?: string;
    fields?: string;
    autoPaginate?: boolean;
  }) {
    return this.listWebsiteSubresource(`/website/groups/${groupId}/sdts`, params);
  }

  async getWebsiteCheckpointData(websiteId: number, checkpointId: number, params?: {
    start?: number;
    end?: number;
    period?: number;
    datapoints?: string;
  }) {
    return this.request<any>(
      'GET',
      `/website/websites/${websiteId}/checkpoints/${checkpointId}/data`,
      undefined,
      this.cleanParams(params),
    );
  }

  private async listWebsiteSubresource(path: string, params?: Record<string, any>) {
    const { autoPaginate = false, ...otherParams } = params || {};
    const cleanedParams = this.cleanParams(otherParams);
    if (autoPaginate) {
      return this.paginateAll<any>(path, cleanedParams);
    }
    return this.request<LMListResponse<any>>('GET', path, undefined, cleanedParams);
  }

  // Website Groups
  async listWebsiteGroups(params?: {
    size?: number;
    offset?: number;
    filter?: string;
    fields?: string;
    autoPaginate?: boolean;
  }) {
    const { autoPaginate = false, ...otherParams } = params || {};
    const cleanedParams = this.cleanParams(otherParams);

    if (autoPaginate) {
      return this.paginateAll<any>('/website/groups', cleanedParams);
    }
    return this.request<LMListResponse<any>>('GET', '/website/groups', undefined, cleanedParams);
  }

  async getWebsiteGroup(groupId: number, params?: { fields?: string }) {
    return this.request<LMResponse<any>>('GET', `/website/groups/${groupId}`, undefined, params);
  }

  async createWebsiteGroup(group: any) {
    return this.request<LMResponse<any>>('POST', '/website/groups', group);
  }

  async updateWebsiteGroup(groupId: number, group: any, params?: { opType?: string }) {
    return this.request<LMResponse<any>>('PATCH', `/website/groups/${groupId}`, group, params);
  }

  async deleteWebsiteGroup(groupId: number) {
    // The documented deleteChildren query parameter makes the API answer 404, so it is not offered.
    return this.request<LMResponse<any>>('DELETE', `/website/groups/${groupId}`);
  }

  // Users
  async listUsers(params?: {
    size?: number;
    offset?: number;
    filter?: string;
    fields?: string;
    autoPaginate?: boolean;
  }) {
    const { autoPaginate = false, ...otherParams } = params || {};
    const cleanedParams = this.cleanParams(otherParams);

    if (autoPaginate) {
      return this.paginateAll<any>('/setting/admins', cleanedParams);
    }
    return this.request<LMListResponse<any>>('GET', '/setting/admins', undefined, cleanedParams);
  }

  async getUser(userId: number, params?: { fields?: string }) {
    return this.request<LMResponse<any>>('GET', `/setting/admins/${userId}`, undefined, params);
  }

  // Roles
  async listRoles(params?: {
    size?: number;
    offset?: number;
    filter?: string;
    fields?: string;
    autoPaginate?: boolean;
  }) {
    const { autoPaginate = false, ...otherParams } = params || {};
    const cleanedParams = this.cleanParams(otherParams);

    if (autoPaginate) {
      return this.paginateAll<any>('/setting/roles', cleanedParams);
    }
    return this.request<LMListResponse<any>>('GET', '/setting/roles', undefined, cleanedParams);
  }

  async getRole(roleId: number, params?: { fields?: string }) {
    return this.request<LMResponse<any>>('GET', `/setting/roles/${roleId}`, undefined, params);
  }

  // API Tokens
  async listApiTokens(userId: number, params?: {
    size?: number;
    offset?: number;
    filter?: string;
    fields?: string;
    autoPaginate?: boolean;
  }) {
    const { autoPaginate = false, ...otherParams } = params || {};
    const cleanedParams = this.cleanParams(otherParams);

    if (autoPaginate) {
      return this.paginateAll<any>(`/setting/admins/${userId}/apitokens`, cleanedParams);
    }
    return this.request<LMListResponse<any>>('GET', `/setting/admins/${userId}/apitokens`, undefined, cleanedParams);
  }

  // SDT (Scheduled Down Time)
  async listSDTs(params?: {
    size?: number;
    offset?: number;
    filter?: string;
    fields?: string;
    autoPaginate?: boolean;
  }) {
    const { autoPaginate = false, ...otherParams } = params || {};
    const cleanedParams = this.cleanParams(otherParams);

    if (autoPaginate) {
      return this.paginateAll<any>('/sdt/sdts', cleanedParams);
    }
    return this.request<LMListResponse<any>>('GET', '/sdt/sdts', undefined, cleanedParams);
  }

  async getSDT(sdtId: string, params?: { fields?: string }) {
    return this.request<LMResponse<any>>('GET', `/sdt/sdts/${sdtId}`, undefined, params);
  }

  async createDeviceSDT(sdt: any) {
    return this.request<LMResponse<any>>('POST', '/sdt/sdts', sdt);
  }

  async deleteSDT(sdtId: string) {
    return this.request<LMResponse<any>>('DELETE', `/sdt/sdts/${sdtId}`);
  }

  // ConfigSources
  async listConfigSources(params?: {
    size?: number;
    offset?: number;
    filter?: string;
    fields?: string;
    autoPaginate?: boolean;
  }) {
    const { autoPaginate = false, ...otherParams } = params || {};
    const cleanedParams = this.cleanParams(otherParams);

    if (autoPaginate) {
      return this.paginateAll<any>('/setting/configsources', cleanedParams);
    }
    return this.request<LMListResponse<any>>('GET', '/setting/configsources', undefined, cleanedParams);
  }

  async getConfigSource(configSourceId: number, params?: { fields?: string }) {
    return this.request<LMResponse<any>>('GET', `/setting/configsources/${configSourceId}`, undefined, params);
  }

  async createConfigSource(configSource: any) {
    return this.request<LMResponse<any>>('POST', '/setting/configsources', configSource);
  }

  async updateConfigSource(configSourceId: number, configSource: any) {
    return this.request<LMResponse<any>>('PATCH', `/setting/configsources/${configSourceId}`, configSource);
  }

  async deleteConfigSource(configSourceId: number) {
    return this.request<LMResponse<any>>('DELETE', `/setting/configsources/${configSourceId}`);
  }

  // PropertySources
  async listPropertySources(params?: {
    size?: number;
    offset?: number;
    filter?: string;
    fields?: string;
    autoPaginate?: boolean;
  }) {
    const { autoPaginate = false, ...otherParams } = params || {};
    const cleanedParams = this.cleanParams(otherParams);

    if (autoPaginate) {
      return this.paginateAll<any>('/setting/propertyrules', cleanedParams);
    }
    return this.request<LMListResponse<any>>('GET', '/setting/propertyrules', undefined, cleanedParams);
  }

  async getPropertySource(propertySourceId: number, params?: { fields?: string }) {
    return this.request<LMResponse<any>>('GET', `/setting/propertyrules/${propertySourceId}`, undefined, params);
  }

  // Device Properties
  async listDeviceProperties(deviceId: number, params?: {
    size?: number;
    offset?: number;
    filter?: string;
    fields?: string;
    autoPaginate?: boolean;
  }) {
    const { autoPaginate = false, ...otherParams } = params || {};
    const cleanedParams = this.cleanParams(otherParams);

    if (autoPaginate) {
      return this.paginateAll<any>(`/device/devices/${deviceId}/properties`, cleanedParams);
    }
    return this.request<LMListResponse<any>>('GET', `/device/devices/${deviceId}/properties`, undefined, cleanedParams);
  }

  /**
   * Set a custom property, creating it if it doesn't exist yet. LogicMonitor's PATCH on
   * `.../properties/{name}` only updates existing properties (404 "Property(name=...) is not found"),
   * and creation is a separate POST to the collection. PATCH first so the common update case is one
   * call; only a property-not-found 404 falls back to POST (other errors, including a 404 for a
   * missing device/group, propagate unchanged). Result carries `action: 'updated' | 'created'`.
   */
  private async upsertProperty(collectionPath: string, propertyName: string, value: string) {
    try {
      const updated = await this.request<LMResponse<any>>('PATCH', `${collectionPath}/${propertyName}`, { value });
      return { ...updated, action: 'updated' as const };
    } catch (error) {
      const propertyMissing = error instanceof LogicMonitorApiError
        && error.status === 404
        && /Property\(name=.*\) is not found/i.test(error.errorMessage ?? '');
      if (!propertyMissing) {
        throw error;
      }
      const created = await this.request<LMResponse<any>>('POST', collectionPath, { name: propertyName, value });
      return { ...created, action: 'created' as const };
    }
  }

  async updateDeviceProperty(deviceId: number, propertyName: string, value: string) {
    return this.upsertProperty(`/device/devices/${deviceId}/properties`, propertyName, value);
  }

  async deleteDeviceProperty(deviceId: number, propertyName: string) {
    return this.request<LMResponse<any>>('DELETE', `/device/devices/${deviceId}/properties/${propertyName}`);
  }

  async scheduleDeviceDiscovery(deviceId: number) {
    return this.request<LMResponse<any>>('POST', `/device/devices/${deviceId}/scheduleAutoDiscovery`);
  }

  // Audit Logs
  async listAuditLogs(params?: {
    size?: number;
    offset?: number;
    filter?: string;
    fields?: string;
    autoPaginate?: boolean;
  }) {
    const { autoPaginate = false, ...otherParams } = params || {};
    const cleanedParams = this.cleanParams(otherParams);

    if (autoPaginate) {
      return this.paginateAll<any>('/setting/accesslogs', cleanedParams);
    }
    return this.request<LMListResponse<any>>('GET', '/setting/accesslogs', undefined, cleanedParams);
  }

  async getAuditLog(auditLogId: string, params?: {
    fields?: string;
  }) {
    const cleanedParams = this.cleanParams(params || {});
    return this.request<LMResponse<any>>('GET', `/setting/accesslogs/${auditLogId}`, undefined, cleanedParams);
  }

  // Integration Logs
  async listIntegrationLogs(params?: {
    size?: number;
    offset?: number;
    filter?: string;
    fields?: string;
    sort?: string;
    autoPaginate?: boolean;
  }) {
    const { autoPaginate = false, ...otherParams } = params || {};
    const cleanedParams = this.cleanParams(otherParams);

    if (autoPaginate) {
      return this.paginateAll<any>('/setting/integrations/auditlogs', cleanedParams);
    }
    return this.request<LMListResponse<any>>('GET', '/setting/integrations/auditlogs', undefined, cleanedParams);
  }

  // Access Groups
  async listAccessGroups(params?: {
    size?: number;
    offset?: number;
    filter?: string;
    fields?: string;
    autoPaginate?: boolean;
  }) {
    const { autoPaginate = false, ...otherParams } = params || {};
    const cleanedParams = this.cleanParams(otherParams);

    if (autoPaginate) {
      return this.paginateAll<any>('/setting/accessgroup', cleanedParams);
    }
    return this.request<LMListResponse<any>>('GET', '/setting/accessgroup', undefined, cleanedParams);
  }

  async getAccessGroup(accessGroupId: number, params?: {
    fields?: string;
  }) {
    const cleanedParams = this.cleanParams(params || {});
    return this.request<LMResponse<any>>('GET', `/setting/accessgroup/${accessGroupId}`, undefined, cleanedParams);
  }

  async createAccessGroup(data: {
    name: string;
    description: string;
    tenantId?: number;
  }) {
    return this.request<LMResponse<any>>('POST', '/setting/accessgroup', data);
  }

  async updateAccessGroup(accessGroupId: number, data: {
    name?: string;
    description?: string;
    tenantId?: number;
  }) {
    return this.request<LMResponse<any>>('PATCH', `/setting/accessgroup/${accessGroupId}`, data);
  }

  async deleteAccessGroup(accessGroupId: number) {
    return this.request<LMResponse<any>>('DELETE', `/setting/accessgroup/${accessGroupId}`);
  }

  // Device DataSources
  async listDeviceDataSources(deviceId: number, params?: {
    size?: number;
    offset?: number;
    filter?: string;
    fields?: string;
    autoPaginate?: boolean;
  }) {
    const { autoPaginate = false, ...otherParams } = params || {};
    const cleanedParams = this.cleanParams(otherParams);

    if (autoPaginate) {
      return this.paginateAll<any>(`/device/devices/${deviceId}/devicedatasources`, cleanedParams);
    }
    return this.request<LMListResponse<any>>('GET', `/device/devices/${deviceId}/devicedatasources`, undefined, cleanedParams);
  }

  async getDeviceDataSource(deviceId: number, deviceDataSourceId: number, params?: { fields?: string }) {
    return this.request<LMResponse<any>>('GET', `/device/devices/${deviceId}/devicedatasources/${deviceDataSourceId}`, undefined, params);
  }

  async updateDeviceDataSource(deviceId: number, deviceDataSourceId: number, data: any) {
    return this.request<LMResponse<any>>('PATCH', `/device/devices/${deviceId}/devicedatasources/${deviceDataSourceId}`, data);
  }

  // EventSources
  async listEventSources(params?: {
    size?: number;
    offset?: number;
    filter?: string;
    fields?: string;
    autoPaginate?: boolean;
  }) {
    const { autoPaginate = false, ...otherParams } = params || {};
    const cleanedParams = this.cleanParams(otherParams);

    if (autoPaginate) {
      return this.paginateAll<any>('/setting/eventsources', cleanedParams);
    }
    return this.request<LMListResponse<any>>('GET', '/setting/eventsources', undefined, cleanedParams);
  }

  async getEventSource(eventSourceId: number, params?: { fields?: string }) {
    return this.request<LMResponse<any>>('GET', `/setting/eventsources/${eventSourceId}`, undefined, params);
  }

  // Escalation Chains
  async listEscalationChains(params?: {
    size?: number;
    offset?: number;
    filter?: string;
    fields?: string;
    autoPaginate?: boolean;
  }) {
    const { autoPaginate = false, ...otherParams } = params || {};
    const cleanedParams = this.cleanParams(otherParams);

    if (autoPaginate) {
      return this.paginateAll<any>('/setting/alert/chains', cleanedParams);
    }
    return this.request<LMListResponse<any>>('GET', '/setting/alert/chains', undefined, cleanedParams);
  }

  async getEscalationChain(chainId: number, params?: { fields?: string }) {
    return this.request<LMResponse<any>>('GET', `/setting/alert/chains/${chainId}`, undefined, params);
  }

  async createEscalationChain(chain: any) {
    return this.request<LMResponse<any>>('POST', '/setting/alert/chains', chain);
  }

  async updateEscalationChain(chainId: number, chain: any) {
    return this.request<LMResponse<any>>('PATCH', `/setting/alert/chains/${chainId}`, chain);
  }

  async deleteEscalationChain(chainId: number) {
    return this.request<LMResponse<any>>('DELETE', `/setting/alert/chains/${chainId}`);
  }

  // Recipients
  async listRecipients(params?: {
    size?: number;
    offset?: number;
    filter?: string;
    fields?: string;
    autoPaginate?: boolean;
  }) {
    const { autoPaginate = false, ...otherParams } = params || {};
    const cleanedParams = this.cleanParams(otherParams);

    if (autoPaginate) {
      return this.paginateAll<any>('/setting/recipients', cleanedParams);
    }
    return this.request<LMListResponse<any>>('GET', '/setting/recipients', undefined, cleanedParams);
  }

  async getRecipient(recipientId: number, params?: { fields?: string }) {
    return this.request<LMResponse<any>>('GET', `/setting/recipients/${recipientId}`, undefined, params);
  }

  async createRecipient(recipient: any) {
    return this.request<LMResponse<any>>('POST', '/setting/recipients', recipient);
  }

  async updateRecipient(recipientId: number, recipient: any) {
    return this.request<LMResponse<any>>('PATCH', `/setting/recipients/${recipientId}`, recipient);
  }

  async deleteRecipient(recipientId: number) {
    return this.request<LMResponse<any>>('DELETE', `/setting/recipients/${recipientId}`);
  }

  // Recipient Groups
  async listRecipientGroups(params?: {
    size?: number;
    offset?: number;
    filter?: string;
    fields?: string;
    autoPaginate?: boolean;
  }) {
    const { autoPaginate = false, ...otherParams } = params || {};
    const cleanedParams = this.cleanParams(otherParams);

    if (autoPaginate) {
      return this.paginateAll<any>('/setting/recipientgroups', cleanedParams);
    }
    return this.request<LMListResponse<any>>('GET', '/setting/recipientgroups', undefined, cleanedParams);
  }

  async getRecipientGroup(groupId: number, params?: { fields?: string }) {
    return this.request<LMResponse<any>>('GET', `/setting/recipientgroups/${groupId}`, undefined, params);
  }

  async createRecipientGroup(group: any) {
    return this.request<LMResponse<any>>('POST', '/setting/recipientgroups', group);
  }

  async updateRecipientGroup(groupId: number, group: any) {
    return this.request<LMResponse<any>>('PATCH', `/setting/recipientgroups/${groupId}`, group);
  }

  async deleteRecipientGroup(groupId: number) {
    return this.request<LMResponse<any>>('DELETE', `/setting/recipientgroups/${groupId}`);
  }

  // Alert Rules
  async listAlertRules(params?: {
    size?: number;
    offset?: number;
    filter?: string;
    fields?: string;
    autoPaginate?: boolean;
  }) {
    const { autoPaginate = false, ...otherParams } = params || {};
    const cleanedParams = this.cleanParams(otherParams);

    if (autoPaginate) {
      return this.paginateAll<any>('/setting/alert/rules', cleanedParams);
    }
    return this.request<LMListResponse<any>>('GET', '/setting/alert/rules', undefined, cleanedParams);
  }

  async getAlertRule(ruleId: number, params?: { fields?: string }) {
    return this.request<LMResponse<any>>('GET', `/setting/alert/rules/${ruleId}`, undefined, params);
  }

  async createAlertRule(rule: any) {
    return this.request<LMResponse<any>>('POST', '/setting/alert/rules', rule);
  }

  async updateAlertRule(ruleId: number, rule: any) {
    return this.request<LMResponse<any>>('PATCH', `/setting/alert/rules/${ruleId}`, rule);
  }

  async deleteAlertRule(ruleId: number) {
    return this.request<LMResponse<any>>('DELETE', `/setting/alert/rules/${ruleId}`);
  }

  // OpsNotes
  async listOpsNotes(params?: {
    size?: number;
    offset?: number;
    filter?: string;
    fields?: string;
    autoPaginate?: boolean;
  }) {
    const { autoPaginate = false, ...otherParams } = params || {};
    const cleanedParams = this.cleanParams(otherParams);

    if (autoPaginate) {
      return this.paginateAll<any>('/setting/opsnotes', cleanedParams);
    }
    return this.request<LMListResponse<any>>('GET', '/setting/opsnotes', undefined, cleanedParams);
  }

  async getOpsNote(opsNoteId: string, params?: { fields?: string }) {
    return this.request<LMResponse<any>>('GET', `/setting/opsnotes/${opsNoteId}`, undefined, params);
  }

  async createOpsNote(opsNote: any) {
    return this.request<LMResponse<any>>('POST', '/setting/opsnotes', opsNote);
  }

  async updateOpsNote(opsNoteId: string, opsNote: any) {
    return this.request<LMResponse<any>>('PATCH', `/setting/opsnotes/${opsNoteId}`, opsNote);
  }

  async deleteOpsNote(opsNoteId: string) {
    return this.request<LMResponse<any>>('DELETE', `/setting/opsnotes/${opsNoteId}`);
  }

  // Report Groups
  async listReportGroups(params?: {
    size?: number;
    offset?: number;
    filter?: string;
    fields?: string;
    autoPaginate?: boolean;
  }) {
    const { autoPaginate = false, ...otherParams } = params || {};
    const cleanedParams = this.cleanParams(otherParams);

    if (autoPaginate) {
      return this.paginateAll<any>('/report/groups', cleanedParams);
    }
    return this.request<LMListResponse<any>>('GET', '/report/groups', undefined, cleanedParams);
  }

  async getReportGroup(groupId: number, params?: { fields?: string }) {
    return this.request<LMResponse<any>>('GET', `/report/groups/${groupId}`, undefined, params);
  }

  async createReportGroup(group: any) {
    return this.request<LMResponse<any>>('POST', '/report/groups', group);
  }

  async updateReportGroup(groupId: number, group: any) {
    return this.request<LMResponse<any>>('PATCH', `/report/groups/${groupId}`, group);
  }

  async deleteReportGroup(groupId: number) {
    return this.request<LMResponse<any>>('DELETE', `/report/groups/${groupId}`);
  }

  // Collector Groups
  async listCollectorGroups(params?: {
    size?: number;
    offset?: number;
    filter?: string;
    fields?: string;
    autoPaginate?: boolean;
  }) {
    const { autoPaginate = false, ...otherParams } = params || {};
    const cleanedParams = this.cleanParams(otherParams);

    if (autoPaginate) {
      return this.paginateAll<any>('/setting/collector/groups', cleanedParams);
    }
    return this.request<LMListResponse<any>>('GET', '/setting/collector/groups', undefined, cleanedParams);
  }

  async getCollectorGroup(groupId: number, params?: { fields?: string }) {
    return this.request<LMResponse<any>>('GET', `/setting/collector/groups/${groupId}`, undefined, params);
  }

  async deleteCollectorGroup(groupId: number) {
    return this.request<LMResponse<any>>('DELETE', `/setting/collector/groups/${groupId}`);
  }

  async updateCollectorGroup(groupId: number, group: any, params?: { opType?: string }) {
    return this.request<LMResponse<any>>('PATCH', `/setting/collector/groups/${groupId}`, group, params);
  }

  // Device Group Properties
  async listDeviceGroupProperties(groupId: number, params?: {
    size?: number;
    offset?: number;
    filter?: string;
    fields?: string;
    autoPaginate?: boolean;
  }) {
    const { autoPaginate = false, ...otherParams } = params || {};
    const cleanedParams = this.cleanParams(otherParams);

    if (autoPaginate) {
      return this.paginateAll<any>(`/device/groups/${groupId}/properties`, cleanedParams);
    }
    return this.request<LMListResponse<any>>('GET', `/device/groups/${groupId}/properties`, undefined, cleanedParams);
  }

  async updateDeviceGroupProperty(groupId: number, propertyName: string, value: string) {
    return this.upsertProperty(`/device/groups/${groupId}/properties`, propertyName, value);
  }

  async deleteDeviceGroupProperty(groupId: number, propertyName: string) {
    return this.request<LMResponse<any>>('DELETE', `/device/groups/${groupId}/properties/${propertyName}`);
  }

  // Device Group DataSources (group-level datasource associations & threshold overrides)
  async listDeviceGroupDataSources(groupId: number, params?: {
    size?: number;
    offset?: number;
    filter?: string;
    fields?: string;
    autoPaginate?: boolean;
  }) {
    const { autoPaginate = false, ...otherParams } = params || {};
    const cleanedParams = this.cleanParams(otherParams);

    if (autoPaginate) {
      return this.paginateAll<any>(`/device/groups/${groupId}/datasources`, cleanedParams);
    }
    return this.request<LMListResponse<any>>('GET', `/device/groups/${groupId}/datasources`, undefined, cleanedParams);
  }

  async getDeviceGroupDataSourceAlertSettings(groupId: number, dataSourceId: number) {
    return this.request<LMResponse<any>>('GET', `/device/groups/${groupId}/datasources/${dataSourceId}/alertsettings`);
  }

  async updateDeviceGroupDataSourceAlertSettings(
    groupId: number,
    dataSourceId: number,
    dpConfig: Array<{
      dataPointId?: number;
      dataPointName?: string;
      alertExpr?: string;
      disableAlerting?: boolean;
      // Required by the API with a valid (non -1) value even when unrelated to the change being
      // made - see the backfill logic in handlers.ts for why callers don't need to supply these.
      alertTransitionInterval?: number;
      alertClearTransitionInterval?: number;
      alertForNoData?: number;
    }>,
  ) {
    return this.request<LMResponse<any>>(
      'PUT',
      `/device/groups/${groupId}/datasources/${dataSourceId}/alertsettings`,
      { dpConfig },
    );
  }

  // Netscans
  async listNetscans(params?: {
    size?: number;
    offset?: number;
    filter?: string;
    fields?: string;
    autoPaginate?: boolean;
  }) {
    const { autoPaginate = false, ...otherParams } = params || {};
    const cleanedParams = this.cleanParams(otherParams);

    if (autoPaginate) {
      return this.paginateAll<any>('/setting/netscans', cleanedParams);
    }
    return this.request<LMListResponse<any>>('GET', '/setting/netscans', undefined, cleanedParams);
  }

  async getNetscan(netscanId: number, params?: { fields?: string }) {
    return this.request<LMResponse<any>>('GET', `/setting/netscans/${netscanId}`, undefined, params);
  }

  async createNetscan(netscan: any) {
    return this.request<LMResponse<any>>('POST', '/setting/netscans', netscan);
  }

  async updateNetscan(netscanId: number, netscan: any, params?: { reason?: string }) {
    return this.request<LMResponse<any>>('PATCH', `/setting/netscans/${netscanId}`, netscan, params);
  }

  // Netscan groups (an endpoint that exists but is not in the swagger file)
  async listNetscanGroups(params?: { size?: number; offset?: number; filter?: string; fields?: string; autoPaginate?: boolean }) {
    const { autoPaginate = false, ...otherParams } = params || {};
    const cleanedParams = this.cleanParams(otherParams);
    if (autoPaginate) {
      return this.paginateAll<any>('/setting/netscans/groups', cleanedParams);
    }
    return this.request<LMListResponse<any>>('GET', '/setting/netscans/groups', undefined, cleanedParams);
  }

  async createNetscanGroup(group: any) {
    return this.request<LMResponse<any>>('POST', '/setting/netscans/groups', group);
  }

  async updateNetscanGroup(groupId: number, group: any) {
    return this.request<LMResponse<any>>('PATCH', `/setting/netscans/groups/${groupId}`, group);
  }

  async deleteNetscanGroup(groupId: number) {
    return this.request<LMResponse<any>>('DELETE', `/setting/netscans/groups/${groupId}`);
  }

  async deleteNetscan(netscanId: number) {
    return this.request<LMResponse<any>>('DELETE', `/setting/netscans/${netscanId}`);
  }

  // Integrations
  async listIntegrations(params?: {
    size?: number;
    offset?: number;
    filter?: string;
    fields?: string;
    autoPaginate?: boolean;
  }) {
    const { autoPaginate = false, ...otherParams } = params || {};
    const cleanedParams = this.cleanParams(otherParams);

    if (autoPaginate) {
      return this.paginateAll<any>('/setting/integrations', cleanedParams);
    }
    return this.request<LMListResponse<any>>('GET', '/setting/integrations', undefined, cleanedParams);
  }

  async getIntegration(integrationId: number, params?: { fields?: string }) {
    return this.request<LMResponse<any>>('GET', `/setting/integrations/${integrationId}`, undefined, params);
  }

  async createIntegration(integration: any) {
    return this.request<LMResponse<any>>('POST', '/setting/integrations', integration);
  }

  async updateIntegration(integrationId: number, integration: any) {
    return this.request<LMResponse<any>>('PATCH', `/setting/integrations/${integrationId}`, integration);
  }

  async deleteIntegration(integrationId: number) {
    return this.request<LMResponse<any>>('DELETE', `/setting/integrations/${integrationId}`);
  }

  // Website Checkpoints
  async listWebsiteCheckpoints(params?: { fields?: string }) {
    return this.request<LMListResponse<any>>('GET', '/website/smcheckpoints', undefined, params);
  }

  // Topology
  async getTopology(params?: { fields?: string }) {
    return this.request<LMResponse<any>>('GET', '/topology', undefined, params);
  }

  // Collector Versions
  async listCollectorVersions(params?: {
    size?: number;
    offset?: number;
    fields?: string;
  }) {
    return this.request<LMListResponse<any>>('GET', '/setting/collector/collectors/versions', undefined, params);
  }
}
