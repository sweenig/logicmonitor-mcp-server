/**
 * LogicMonitor MCP Server - Resources
 *
 * This module provides MCP resources for LogicMonitor API documentation
 * and related resources that can be retrieved by the AI assistant.
 */

import https from 'https';
import http from 'http';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Resource definition for LogicMonitor API Swagger documentation
 */
export interface LMResource {
  uri: string;
  name: string;
  description: string;
  mimeType?: string;
}

/**
 * Available LogicMonitor resources
 */
export const LM_RESOURCES: LMResource[] = [
  {
    uri: 'lm://api/swagger',
    name: 'LogicMonitor (LM) API Definition (Swagger/OpenAPI)',
    description: 'Complete LogicMonitor REST API v3 definition in Swagger/OpenAPI format. ' +
      'Contains all available endpoints, request/response schemas, authentication methods, ' +
      'and API documentation. Use this to understand the LogicMonitor API structure, ' +
      'available operations, and data models. Source: https://www.logicmonitor.com/swagger-ui-master/api-v3/dist/swagger.json\n\n' +
      'Before making API calls, you should authenticate yourself. ' +
      'You can make v3 requests by including a \'?v=3\' query parameter or by including a \'X-Version:3\' header. ' +
      'Properties passed in the body of an API call are case sensitive. ' +
      'When adding cloud devices, do not use NetScan to discover cloud devices as it can lead to issues. Instead, follow the new onboarding process. ' +
      'For more information, see LM Cloud Monitoring Overview, Enabling Cloud Monitoring using Local Collector, and AWS Monitoring Setup.\n\n' +
      'Offset indicates the position of a specific record in the dataset. It is the starting point of the list. ' +
      'For example, there is an array of 10 elements and in the API request you specify offset as 4. The API response will return result from the 5th element onwards. ' +
      'For fetching alerts, the offset limit is 10000 alerts.\n\n' +
      'Size indicates the number of elements to return at a time in the response. For example, if you specify size=60, then the response will return result in a batch of 60. ' +
      'LogicMonitor REST API v3 supports maximum size of 1000 records. Even if you specify a number above 1000, the response will always return 1000 records. ' +
      'Example, there are 7000 alerts and you set offset=1000 and size=500. In the response, the API will return alerts from 1001 to 1500.\n\n' +
      'In case of SDTs endpoints, the response may contain extra fields depending upon the type of SDT that you select. ' +
      'In case of Widgets endpoints, based on the widget type you select, the request and response will contain additional attributes. ' +
      'For more details about the attributes, refer models specific to the selected widget type at the end of the Swagger documentation.',
    mimeType: 'application/json',
  },
  {
    uri: 'lm://docs/debug-commands',
    name: 'LogicMonitor Collector Debug Command Reference',
    description: 'Full syntax reference for every LogicMonitor collector debug command (the ' +
      '"help <command>" output for each), organized by category (scripting & execution, ' +
      'discovery & AutoProps, SNMP, networking & diagnostics, collector management, etc). ' +
      'Read this once if you are not already familiar with debug command syntax before calling ' +
      '"execute_debug_command" with an unfamiliar command; skip it if you already know the syntax ' +
      'you need.',
    mimeType: 'text/markdown',
  },
  {
    uri: 'lm://knowledge/collector-script-cache',
    name: 'Collector Script Cache (ScriptCache) - persisting state between polls',
    description: 'How to use ScriptCache in collector Groovy scripts to carry data from one poll to the next. ' +
      'Read this before writing or changing any DataSource, ConfigSource, PropertySource or EventSource script that needs state across collection intervals: ' +
      'auth tokens/sessions, previous poll values for delta or rate calculations, rolling totals, bookmarks/cursors (last log offset, event ID, "since" timestamp), or cached lookups. ' +
      'Covers the get/set/remove API, string-only values, expiry (per-key and the agent.conf default), key namespacing, and worked examples.',
    mimeType: 'text/markdown',
  },
  {
    uri: 'lm://knowledge/script-datasource',
    name: 'Building a script DataSource (single-instance and batchscript with Active Discovery)',
    description: 'How to build a script-based DataSource with "create_datasource": output formats for the collection and Active Discovery scripts, datapoint post-processors, appliesTo, alert thresholds, graphs, scaling small values, updating without breaking datapoints and graphs (fields an update leaves out, rawDataFieldName), testing with "test_datasource", patterns for an auditing DataSource (counts in datapoints with detail in instance properties, an instance that surfaces a missing structure, enabling per resource with a property, calling the LogicMonitor REST API from a collector script), and what to do when asked to scrape a web page. ' +
      'Read this before creating or substantially changing a script or batchscript DataSource.',
    mimeType: 'text/markdown',
  },
  {
    uri: 'lm://knowledge/snmp-datasource-from-mib',
    name: 'Building an SNMP DataSource from a MIB table',
    description: 'How to turn one table (or scalar group) of an SNMP MIB into a well-made DataSource with "create_datasource": reading the MIB and resolving OIDs, multi-instance ad_snmp discovery, choosing which columns become datapoints, datapoint descriptions and units, status display names for enumerations, suggested thresholds, discovery filters, the update_datasource datapoint-reset trap, and testing with debug commands. ' +
      'Read this before creating or changing an SNMP DataSource, or when the "datasource_from_mib" prompt is used.',
    mimeType: 'text/markdown',
  },
  {
    uri: 'lm://knowledge/property-driven-discovery',
    name: 'Property-driven discovery filters (include/exclude set by resource and group properties)',
    description: 'A good practice for any multi-instance DataSource: reference properties such as <DataSourceName>.includeRegEx and .excludeRegEx in the discovery filters with ##property## tokens, and make appliesTo require them, so what is monitored is controlled by properties set on resources and resource groups (inherited down the tree, overridable per device) instead of being hard-coded. ' +
      'Covers the pattern, filter attributes and operations, placeholder values, and setting the properties. ' +
      'Read this when designing the discovery filters of any DataSource, especially when the instances that matter differ by customer, site or device.',
    mimeType: 'text/markdown',
  },
  {
    uri: 'lm://knowledge/dashboards-and-widgets',
    name: 'Dashboards and alert list widgets: folders, layout, filters, columns, property filters',
    description: 'How to build a dashboard with "create_dashboard", "create_widget" and "update_widget": public vs private dashboards and folders, the 12-column layout, dashboard-level property filters, alert list widget filters (display name, severity words, "show all" open alerts), columns and custom columns (including which columns are worth showing), the NOC widget (including limiting it to a resource group), checking a widget with get_widget_data, and what to fix after renaming a DataSource. ' +
      'Read this before building or changing a dashboard or an alert list widget.',
    mimeType: 'text/markdown',
  },
  {
    uri: 'lm://knowledge/websites',
    name: 'Websites (synthetic checks): web vs ping, internal vs external, groups',
    description: 'How LogicMonitor website monitors work: the two types (webcheck = HTTP/HTTPS, pingcheck = ICMP) and the two locations ' +
      '(external = run from LogicMonitor cloud checkpoints, internal = run from your collectors), what each combination needs, alert and timing settings, ' +
      'website groups, how websites differ from LM Uptime checks, and ready-to-use create_website recipes. ' +
      'Read this before creating or changing a website with "create_website" or "update_website", or when unsure which type or location to use.',
    mimeType: 'text/markdown',
  },
  {
    uri: 'lm://knowledge/netscans',
    name: 'NetScans (network discovery): methods, schedules, duplicates, groups',
    description: 'How LogicMonitor NetScans work: the three methods (nmap subnet scan, script/CSV, enhancedScript), what each needs, schedules (a timed schedule needs a cron expression), duplicate handling, discovered-device rules, credentials, NetScan groups, and ready-to-use create_netscan recipes. ' +
      'Read this before creating or changing a NetScan with "create_netscan" or "update_netscan", or when unsure which method to use.',
    mimeType: 'text/markdown',
  },
];

/**
 * Resources backed by a file in the repo, keyed by URI. Paths are relative to the
 * repo root (the Dockerfile copies these into the image alongside "build/").
 */
const FILE_RESOURCES: Record<string, string> = {
  'lm://docs/debug-commands': 'LOGICMONITOR-DEBUG-COMMANDS.md',
  'lm://knowledge/collector-script-cache': 'knowledge/collector-script-cache.md',
  'lm://knowledge/script-datasource': 'knowledge/script-datasource.md',
  'lm://knowledge/snmp-datasource-from-mib': 'knowledge/snmp-datasource-from-mib.md',
  'lm://knowledge/property-driven-discovery': 'knowledge/property-driven-discovery.md',
  'lm://knowledge/dashboards-and-widgets': 'knowledge/dashboards-and-widgets.md',
  'lm://knowledge/websites': 'knowledge/websites.md',
  'lm://knowledge/netscans': 'knowledge/netscans.md',
};

/**
 * Fetches content from a URL using HTTPS or HTTP
 */
async function fetchUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https:') ? https : http;
    const urlObj = new URL(url);

    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'User-Agent': 'LogicMonitor-MCP-Server/1.0',
        'Accept': 'application/json',
      },
    };

    protocol.get(options, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        // Handle redirects
        const redirectUrl = res.headers.location;
        if (redirectUrl) {
          fetchUrl(redirectUrl).then(resolve).catch(reject);
          return;
        }
      }

      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
        return;
      }

      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        resolve(data);
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Reads the content of a LogicMonitor resource
 */
export async function readLMResource(uri: string): Promise<{ contents: Array<{ uri: string; mimeType?: string; text: string }> }> {
  const resource = LM_RESOURCES.find(r => r.uri === uri);

  if (!resource) {
    throw new Error(`Resource not found: ${uri}`);
  }

  // Handle different resource types
  if (uri === 'lm://api/swagger') {
    const swaggerUrl = 'https://www.logicmonitor.com/swagger-ui-master/api-v3/dist/swagger.json';

    try {
      const content = await fetchUrl(swaggerUrl);

      // Validate that it's valid JSON
      JSON.parse(content);

      return {
        contents: [
          {
            uri,
            mimeType: resource.mimeType,
            text: content,
          },
        ],
      };
    } catch (error) {
      throw new Error(
        `Failed to fetch LogicMonitor API definition: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const relativePath = FILE_RESOURCES[uri];
  if (relativePath) {
    const filePath = path.join(__dirname, '../..', relativePath);

    try {
      const content = await fs.readFile(filePath, 'utf-8');

      return {
        contents: [
          {
            uri,
            mimeType: resource.mimeType,
            text: content,
          },
        ],
      };
    } catch (error) {
      throw new Error(
        `Failed to read ${resource.name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  throw new Error(`Unsupported resource URI: ${uri}`);
}

/**
 * Lists all available LogicMonitor resources
 */
export function listLMResources(): LMResource[] {
  return LM_RESOURCES;
}

