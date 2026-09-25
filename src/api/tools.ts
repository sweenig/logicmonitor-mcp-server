/**
 * LogicMonitor (LM) monitoring MCP Tools
 *
 * Tool definitions and handlers for LogicMonitor API integration.
 * Use "LM" as shorthand for "LogicMonitor" throughout this server.
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

// Common parameter schemas
const paginationSchema = {
  size: {
    type: 'number',
    description: 'Number of results per page (default: 50, max: 1000).',
  },
  offset: {
    type: 'number',
    description: 'Starting offset for pagination (default: 0). ' +
      'Use this to skip a specific number of results.',
  },
  autoPaginate: {
    type: 'boolean',
    description: 'Automatically fetch all pages (default: false). ' +
      'When true, fetches all results across multiple pages. ' +
      'When false, returns only the requested page. ' +
      'Use false for large result sets to avoid long response times.',
  },
};

const filterSchema = {
  filter: {
    type: 'string',
    description: 'Filter expression using LogicMonitor query syntax. ' +
      'Examples: name:*prod*, displayName~*server*, id>100, hostStatus:normal. ' +
      'Available operators: : (equals), ~ (includes), !: (not equals), !~ (not includes), ' +
      '>: (greater than or equals), <: (less than or equals), > (greater than), < (less than). ' +
      'Multiple conditions: Use comma (,) for AND, use || for OR. Do NOT use &&.',
  },
};

const fieldsSchema = {
  fields: {
    type: 'string',
    description: 'Comma-separated list of fields to include in response. ' +
      'Examples: "id,displayName,hostStatus" or use "*" for all fields. ' +
      'Omit this parameter to receive a curated set of commonly used fields.',
  },
};

const ALL_LOGICMONITOR_TOOLS: Tool[] = [
  // Device Management Tools
  {
    name: 'list_resources',
    description: 'List all monitored resources/devices in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Array of resource/device with: id, displayName, name (IP/hostname), hostStatus (normal/dead/dead-collector - NOT "alive"), preferredCollectorId, deviceType (0=regular, 2=AWS, 4=Azure), custom properties, group memberships, hostGroupIds, sdtStatus (see below), alertStatus, alertDisableStatus (see below). ' +
      '\n\n**When to use:** ' +
      '\n- Get inventory of all monitored resources/devices' +
      '\n- Find specific resource/device by name/IP/property' +
      '\n- Check resource/device health status' +
      '\n- Get resource/device IDs for other operations' +
      '\n\n**Two search modes:** ' +
      '\n- **Simple search:** Use query parameter with free text (e.g., query:"production", query:"web-server") - automatically searches displayName, description, and name fields' +
      '\n- **Advanced filtering:** Use filter parameter with LM filter syntax (e.g., filter:"hostStatus:normal,displayName~\\*web\\*") for precise control' +
      '\n\n**Common filter patterns:** ' +
      '\n- By name: filter:"displayName\\~\\*prod\\*" (wildcard search) ' +
      '\n- By status: filter:"hostStatus:normal" or filter:"hostStatus:dead" or filter:"hostStatus:dead-collector" (these three are the only valid values - "alive" is NOT a valid hostStatus value, despite appearing in some older examples/docs) ' +
      '\n- By type: filter:"systemProperties.name:system.devicetype,value:server" ' +
      '\n- By custom property: filter:"customProperties.name:company.team,customProperties.value:teamA" ' +
      '\n- By collector: filter:"preferredCollectorId:123" ' +
      '\n- Multiple conditions: filter:"hostStatus:normal,displayName\\~\\*web\\*" (comma = AND) ' +
      '\n\n**Query vs Filter:** ' +
      '\n- query: Simplified search across displayName, description, name (OR logic). Use for quick lookups: query:"prod-web-01"' +
      '\n- filter: Precise LM filter syntax with any field. Use for complex conditions: filter:"hostStatus:normal,displayName~\\*prod\\*"' +
      '\n- **query and filter cannot be combined in one call:** LogicMonitor\'s filter API only supports comma-separated AND logic (no OR+AND mixing, no parentheses/grouping), so a multi-field "query" search (OR across displayName/description/name) cannot be AND-combined with an additional "filter". Passing both together throws an error with the exact per-field filter strings to use instead - make one call per field (e.g. displayName~"*value*",<filter>), then merge/dedupe the results yourself.' +
      '\n\n**Important:** LogicMonitor may return a negative "total" value due to a known upstream API limitation - this does not mean the request failed. Never use "total" to count or check for results; check the length of the "items" array instead, and use pagination (size/offset) or autoPaginate: true to retrieve all items across pages. ' +
      '\n\n**SDT status (sdtStatus field):** Format is three dash-separated terms, "group-device-instance" (e.g. "none-SDT-none"), each either "SDT" or "none". First term = an SDT set on a group this resource belongs to (covers the whole resource). Second term = an SDT set directly on this resource (covers the whole resource). Third term = an SDT set on a specific datasource/instance only - it does NOT cover the whole resource. A resource is entirely in SDT if the first OR second term is "SDT"; "none-none-SDT" alone means only part of the resource is suppressed. ' +
      '\n\n**Alerting-disabled status (alertDisableStatus field):** Same three-part "group-device-instance" format and meaning as sdtStatus above, but for whether alerting is disabled rather than whether SDT is active. Do not confuse this with the separate disableAlerting field, which is a plain boolean for the resource itself only and does not reflect group- or instance-level disabling. ' +
      '\n\n**Alert status (alertStatus field):** Encodes both severity and acknowledgement in one string, e.g. "critical-unconfirmed" or "warn-confirmed"; "none" means no active alert. Severity is one of warn/error/critical; acknowledgement is confirmed/unconfirmed. ' +
      '\n\n**hostGroupIds gotcha:** This is a single comma-separated string of group IDs (e.g. "14,26,116"), not a list field, so filter:"hostGroupIds~27" will also match "127", "270", etc. (substring match, not exact membership). To find resources in a specific group reliably, prefer filtering on systemProperties (e.g. filter:"systemProperties.name:system.groups,systemProperties.value~*Exact/Group/Path*" using the group\'s distinctive full path) or cross-check candidate matches against "list\\_resource\\_groups"/"get\\_resource\\_group" rather than trusting a bare hostGroupIds substring match. ' +
      '\n\n**Known reliability caveat:** Filtering on computed/rollup fields such as sdtStatus or alertDisableStatus (e.g. filter:"sdtStatus:none-SDT-none" or filter:"sdtStatus~SDT-none-") has been observed to return stale results - both missing resources that do match and including ones that do not - likely due to search-index lag on these fields rather than a filter-syntax problem (plain attribute filters like hostStatus or displayName are not known to have this issue). For an accurate audit of SDT or alerting-disabled state, prefer fetching the field unfiltered (fields:"id,displayName,sdtStatus", autoPaginate:true) and evaluating it client-side rather than trusting filter= on it. ' +
      '\n\n**Performance tips:** Use autoPaginate:false for large environments (>1000 resources/devices) and paginate manually to avoid timeouts. ' +
      '\n\n**Related tools:** "get\\_resource" (details), "generate\\_resource\\_link" (get UI link), "list\\_sdts" (SDT records), "get\\_sdt" (SDT details).',
    annotations: {
      title: 'List monitored resources/devices',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Simple search query. Free text (e.g., "production", "web-server", "192.168.1.100") automatically searches across displayName, description, and name fields. Can also use filter syntax (e.g., "hostStatus:normal") which gets formatted automatically.',
        },
        ...paginationSchema,
        ...filterSchema,
        ...fieldsSchema,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_resource',
    description: 'Get detailed information about a specific resource/device in LogicMonitor (LM) monitoring by its ID. ' +
      '\n\n**Returns:** Complete resource/device details including: displayName, IP/hostname, hostStatus, alertStatus, collector assignment, resource/device type, custom properties, applied datasources, group memberships, last data time, creation date, sdtStatus. ' +
      '\n\n**When to use:** ' +
      '\n- Get full details after finding resource/device ID via "list\\_resources"' +
      '\n- Check resource/device configuration' +
      '\n- Verify collector assignment' +
      '\n- Review custom properties before updating' +
      '\n- Confirm the live/authoritative sdtStatus for one resource (see "list\\_resources" description for the sdtStatus format and a caveat about that field being unreliable when filtered on in bulk queries)' +
      '\n\n**Workflow:** Use "list\\_resources" or "search\\_resources" first to find the deviceId, then use this tool for complete details. ' +
      '\n\n**Related tools:** "list\\_resource\\_datasources" (see what\'s monitored), "list\\_resource\\_properties" (view all properties), "generate\\_resource\\_link" (get UI link).',
    annotations: {
      title: 'Get resource/device details',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        deviceId: {
          type: 'number',
          description: 'The ID of the resource/device to retrieve',
        },
        ...fieldsSchema,
      },
      additionalProperties: false,
      required: ['deviceId'],
    },
  },
  {
    name: 'create_resource',
    description: 'Add a new resource/device or multiple resources/devices to LogicMonitor (LM) monitoring. ' +
      '\n\n**Two modes: Single resource/device OR Batch creation** ' +
      '\n\n**Single resource/device mode (most common):** ' +
      '\n- Required: displayName (friendly name), name (IP/hostname), preferredCollectorId (from "list\\_collectors")' +
      '\n- Optional: hostGroupIds (folder location), description, disableAlerting, customProperties' +
      '\n- Example: Add "prod-web-01" at 192.168.1.100 to Production folder monitored by collector 5' +
      '\n\n**Batch mode (for multiple resources/devices):** ' +
      '\n- Provide resource/device array, each with displayName, name, preferredCollectorId' +
      '\n- Use batchOptions: {maxConcurrent: 5, continueOnError: true}' +
      '\n- Processes up to 5 resource/device simultaneously' +
      '\n- If one fails, others continue (when continueOnError:true)' +
      '\n\n**When to use:** ' +
      '\n- Add new servers/resources/devices to monitoring' +
      '\n- Onboard cloud instances' +
      '\n- Bulk import from CMDB/inventory' +
      '\n- Auto-discovery integration' +
      '\n\n**Before creating:** ' +
      '\n- Use "list\\_collectors" to find available collectorId (must be alive/healthy)' +
      '\n- Use "list\\_resource\\_groups" to find hostGroupIds for folder placement' +
      '\n- Verify IP/hostname is reachable from collector' +
      '\n\n**Custom properties examples:** ' +
      '\n- Environment: {name: "env", value: "production"}' +
      '\n- Owner: {name: "owner", value: "platform-team"}' +
      '\n- Credentials: {name: "ssh.user", value: "monitoring"} (for authentication)' +
      '\n\n**Performance tip:** For >50 resources/devices, use batch mode to avoid rate limits. ' +
      '\n\n**After creation:** Use "list\\_resources" to verify resource/device was added, check hostStatus. ' +
      '\n\n**Related tools:** "list\\_collectors" (find collector), "list\\_resource\\_groups" (find folder), "update\\_resource" (modify), "generate\\_resource\\_link" (get URL).',
    annotations: {
      title: 'Add resource/device(s)',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        // Single resource/device properties
        displayName: {
          type: 'string',
          description: 'Display name for the resource/device (for single creation)',
        },
        name: {
          type: 'string',
          description: 'IP address or hostname of the resource/device (for single creation)',
        },
        preferredCollectorId: {
          type: 'number',
          description: 'ID of the collector to monitor this resource/device (for single creation)',
        },
        hostGroupIds: {
          type: 'string',
          description: 'Comma-separated list of resource/device group IDs (for single creation)',
        },
        description: {
          type: 'string',
          description: 'Description of the resource/device (for single creation)',
        },
        disableAlerting: {
          type: 'boolean',
          description: 'Whether to disable alerting for this resource/device (for single creation)',
        },
        customProperties: {
          type: 'array',
          description: 'Array of custom properties with name and value (for single creation)',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              value: { type: 'string' },
            },
          },
        },
        // Batch properties
        devices: {
          type: 'array',
          description: 'Array of resource/device to create (for batch creation)',
          items: {
            type: 'object',
            properties: {
              displayName: { type: 'string' },
              name: { type: 'string' },
              preferredCollectorId: { type: 'number' },
              hostGroupIds: { type: 'string' },
              description: { type: 'string' },
              disableAlerting: { type: 'boolean' },
              customProperties: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    value: { type: 'string' },
                  },
                },
              },
            },
            required: ['displayName', 'name', 'preferredCollectorId'],
          },
        },
        batchOptions: {
          type: 'object',
          description: 'Options for batch processing',
          properties: {
            maxConcurrent: {
              type: 'number',
              description: 'Maximum concurrent requests (default: 5)',
            },
            continueOnError: {
              type: 'boolean',
              description: 'Continue processing if some items fail (default: true)',
            },
          },
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'update_resource',
    description: 'Modify an existing resource/device or multiple resources/devices in LogicMonitor (LM) monitoring. ' +
      '\n\n**Two modes: Single resource/device OR Batch update** ' +
      '\n\n**Single resource/device mode:** ' +
      '\n- Required: deviceId (from "list\\_resources" or "search\\_resources")' +
      '\n- Optional: displayName, description, disableAlerting, preferredCollectorId, customProperties' +
      '\n- opType: "replace" (default) overwrites all, "add" merges with existing' +
      '\n\n**Batch mode:** ' +
      '\n- Provide resource/device array, each must include deviceId' +
      '\n- Use batchOptions for concurrent processing' +
      '\n\n**When to use:** ' +
      '\n- Change resource/device name/description' +
      '\n- Move to different collector' +
      '\n- Enable/disable alerting' +
      '\n- Update custom properties' +
      '\n- Bulk modifications' +
      '\n\n**Common update scenarios:** ' +
      '\n- Rename device: {deviceId: 123, displayName: "new-prod-web-01"}' +
      '\n- Disable alerts during migration: {deviceId: 123, disableAlerting: true}' +
      '\n- Move to new collector: {deviceId: 123, preferredCollectorId: 5}' +
      '\n- Update property: {deviceId: 123, customProperties: [{name: "env", value: "staging"}]}' +
      '\n\n**opType explained:** ' +
      '\n- "replace": Overwrites entire field (careful with customProperties!)' +
      '\n- "add": Merges/appends to existing values (safer for properties)' +
      '\n\n**Workflow:** First find deviceId using "list\\_resources" or "search\\_resources", then update. ' +
      '\n\n**Related tools:** "list\\_resources" (find device), "get\\_resource" (verify before update), "update\\_resource\\_property" (simpler property updates).',
    annotations: {
      title: 'Update resource/device(s)',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        // Single resource/device properties
        deviceId: {
          type: 'number',
          description: 'The ID of the resource/device to update (for single update)',
        },
        displayName: {
          type: 'string',
          description: 'New display name for the resource/device (for single update)',
        },
        description: {
          type: 'string',
          description: 'New description for the resource/device (for single update)',
        },
        disableAlerting: {
          type: 'boolean',
          description: 'Whether to disable alerting (for single update)',
        },
        preferredCollectorId: {
          type: 'number',
          description: 'New collector ID (for single update)',
        },
        customProperties: {
          type: 'array',
          description: 'Array of custom properties to update (for single update)',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              value: { type: 'string' },
            },
          },
        },
        opType: {
          type: 'string',
          description: 'Operation type: "replace" or "add" (default: replace, for single update)',
        },
        // Batch properties
        devices: {
          type: 'array',
          description: 'Array of resource/device to update (for batch update). Each must include deviceId.',
          items: {
            type: 'object',
            properties: {
              deviceId: { type: 'number' },
              displayName: { type: 'string' },
              description: { type: 'string' },
              disableAlerting: { type: 'boolean' },
              preferredCollectorId: { type: 'number' },
              customProperties: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    value: { type: 'string' },
                  },
                },
              },
              opType: { type: 'string' },
            },
            required: ['deviceId'],
          },
        },
        batchOptions: {
          type: 'object',
          description: 'Options for batch processing',
          properties: {
            maxConcurrent: {
              type: 'number',
              description: 'Maximum concurrent requests (default: 5)',
            },
            continueOnError: {
              type: 'boolean',
              description: 'Continue processing if some items fail (default: true)',
            },
          },
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'delete_resource',
    description: 'Remove a resource/device or multiple resources/devices from LogicMonitor (LM) monitoring. ' +
      '\n\n**⚠️ WARNING: DESTRUCTIVE OPERATION** ' +
      '\n- This permanently removes the resource/device from monitoring' +
      '\n- All historical data will be deleted' +
      '\n- All alerts for this resource/device will be cleared' +
      '\n- This action CANNOT be undone' +
      '\n\n**Two modes: Single resource/device OR Batch deletion** ' +
      '\n\n**Single resource/device mode:** ' +
      '\n- Required: deviceId (from "list\\_resources")' +
      '\n- Optional: deleteFromSystem (true = complete removal including history)' +
      '\n\n**Batch mode:** ' +
      '\n- Provide deviceIds array [123, 456, 789]' +
      '\n- Use batchOptions for concurrent processing' +
      '\n\n**When to use:** ' +
      '\n- Decommissioned servers' +
      '\n- Deleted cloud instances' +
      '\n- Cleanup after migrations' +
      '\n- Remove duplicate entries' +
      '\n- Bulk decommissioning' +
      '\n\n**⚠️ CONSIDER ALTERNATIVES FIRST:** ' +
      '\n- Need temporary suppression? Use "create\\_resource\\_sdt" instead (reversible!)' +
      '\n- Need to stop monitoring but keep history? Use "update\\_resource" with disableAlerting:true' +
      '\n- Moving to different collector? Use "update\\_resource" to change collector' +
      '\n\n**Best practice workflow:** ' +
      '\n- Use "get\\_resource" to verify you have correct resource/device' +
      '\n- Consider if SDT or disableAlerting is better option' +
      '\n- If deletion necessary, delete resource/device' +
      '\n- No verification step possible (irreversible)' +
      '\n\n**Batch deletion tip:** For >50 resources/devices, use batch mode with continueOnError:true to handle any failures gracefully. ' +
      '\n\n**Related tools:** "create\\_resource\\_sdt" (temporary alternative), "update\\_resource" (disable without deleting), "list\\_resources" (find resource/device to delete).',
    annotations: {
      title: 'Delete resource/device(s)',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        // Single resource/device properties
        deviceId: {
          type: 'number',
          description: 'The ID of the resource/device to delete (for single deletion)',
        },
        deleteFromSystem: {
          type: 'boolean',
          description: 'Whether to delete the resource/device from the system completely',
        },
        // Batch properties
        deviceIds: {
          type: 'array',
          description: 'Array of resource/device IDs to delete (for batch deletion)',
          items: {
            type: 'number',
          },
        },
        batchOptions: {
          type: 'object',
          description: 'Options for batch processing',
          properties: {
            maxConcurrent: {
              type: 'number',
              description: 'Maximum concurrent requests (default: 5)',
            },
            continueOnError: {
              type: 'boolean',
              description: 'Continue processing if some items fail (default: true)',
            },
          },
        },
      },
      additionalProperties: false,
    },
  },

  // Device Group Tools
  {
    name: 'list_resource_groups',
    description: 'List all resource/device groups (folders) in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Array of groups with: id, name, parentId, full path, description, number of resources/devices, number of subgroups, custom properties. ' +
      '\n\n**What are groups:** Organizational folders for resources/devices, like directories in a file system. Used to organize by location, environment, customer, or any logical structure. ' +
      '\n\n**When to use:** ' +
      '\n- Browse resource/device organization' +
      '\n- Find group IDs for resource/device creation/assignment' +
      '\n- Understand resource/device hierarchy' +
      '\n- Get group IDs for group-level operations (properties, SDT)' +
      '\n\n**Common use cases:** ' +
      '\n- Geographic: "US-West", "EU-Central", "APAC"' +
      '\n- Environment: "Production", "Staging", "Development"' +
      '\n- Customer: "Customer-A", "Customer-B" (for MSPs)' +
      '\n- Function: "Web Servers", "Database Servers", "Network resources/Devices"' +
      '\n\n**Common filter patterns:** ' +
      '\n- By name: filter:"name\\~\\*Production\\*"' +
      '\n- Root groups: filter:parentId:"1"' +
      '\n- Non-empty: filter:"numOfDirectDevices>0"' +
      '\n\n**Groups inherit properties:** Custom properties set on group are inherited by all resource/device in that group (useful for credentials, location tags). ' +
      '\n\n**Important:** LogicMonitor may return a negative "total" value due to a known upstream API limitation - this does not mean the request failed. Never use "total" to count or check for results; check the length of the "items" array instead, and use pagination (size/offset) or autoPaginate: true to retrieve all items across pages. ' +
      '\n\n**Related tools:** "get\\_resource\\_group" (details), "create\\_resource\\_group" (create new), "list\\_resource\\_group\\_properties" (group properties).',
    annotations: {
      title: 'List resource/device groups',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        ...paginationSchema,
        ...filterSchema,
        ...fieldsSchema,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_resource_group',
    description: 'Get detailed information about a specific resource/device group by its ID in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Complete group details: name, full path, parentId, description, custom properties, number of resource/device (direct and total), number of subgroups, alert status, SDT status. ' +
      '\n\n**When to use:** ' +
      '\n- Get group path for documentation' +
      '\n- Review inherited properties' +
      '\n- Check group membership counts' +
      '\n- Verify group hierarchy' +
      '\n- Get group details before creating resource/device in it' +
      '\n\n**Key information:** ' +
      '\n- fullPath: Complete hierarchy (e.g., "/Production/Web Servers/US-East")' +
      '\n- customProperties: Properties inherited by all resource/device in group' +
      '\n- numOfDirectDevices: resources/Devices directly in this group' +
      '\n- numOfHosts: Total resource/device including subgroups' +
      '\n- alertStatus: Rollup alert status for entire group' +
      '\n\n**Custom properties inheritance:** ' +
      'Properties set on group are inherited by ALL resource/device in group. Common uses: ' +
      '\n- Credentials: {name: "ssh.user", value: "monitoring"}' +
      '\n- Environment tags: {name: "env", value: "production"}' +
      '\n- Owner: {name: "team", value: "platform-engineering"}' +
      '\n\n**Workflow:** Use "list\\_resource\\_groups" to find groupId, then use this tool for complete details including inherited properties. ' +
      '\n\n**Related tools:** "list\\_resource\\_groups" (find groups), "create\\_resource\\_group" (create new), "list\\_resources" (devices in group).',
    annotations: {
      title: 'Get resource/device group details',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        groupId: {
          type: 'number',
          description: 'The ID of the resource/device group to retrieve',
        },
        ...fieldsSchema,
      },
      additionalProperties: false,
      required: ['groupId'],
    },
  },
  {
    name: 'create_resource_group',
    description: 'Create a new resource/device group (folder) in LogicMonitor (LM) monitoring. ' +
      '\n\n**What this does:** Creates organizational folder for grouping resources/devices. Groups organize resource/device by location, function, customer, environment, etc. ' +
      '\n\n**When to use:** ' +
      '\n- Set up organizational structure before adding resources/devices' +
      '\n- Create folders for different teams/applications' +
      '\n- Establish hierarchy for multi-tenant environments' +
      '\n- Organize resource/device by location/datacenter' +
      '\n\n**Required parameters:** ' +
      '\n- name: Group name (e.g., "Production", "US-East", "Customer-A")' +
      '\n\n**Optional parameters:** ' +
      '\n- parentId: Parent group ID (0 = root, or use existing group ID for nesting)' +
      '\n- description: Group purpose/notes' +
      '\n- customProperties: Properties inherited by all resource/device in group (credentials, tags)' +
      '\n- appliesTo: Dynamic membership query (auto-add resource/device matching criteria)' +
      '\n\n**Common organizational patterns:** ' +
      '\n\n**By environment:** ' +
      '\n- /Production (parentId: 0)' +
      '\n- /Staging (parentId: 0)' +
      '\n- /Development (parentId: 0)' +
      '\n\n**By location:** ' +
      '\n- /Datacenters (parentId: 0)' +
      '\n  - /Datacenters/US-East (parentId: Datacenters ID)' +
      '\n  - /Datacenters/EU-West (parentId: Datacenters ID)' +
      '\n\n**By function:** ' +
      '\n- /Infrastructure (parentId: 0)' +
      '\n  - /Infrastructure/Web Servers' +
      '\n  - /Infrastructure/Database Servers' +
      '\n  - /Infrastructure/Network resources/Devices' +
      '\n\n**By customer (MSP):** ' +
      '\n- /Customer-A (parentId: 0)' +
      '\n- /Customer-B (parentId: 0)' +
      '\n\n**Custom properties for groups:** ' +
      'Properties set on group are automatically inherited by all resources/devices: ' +
      '\n- Credentials: {name: "ssh.user", value: "monitoring"}' +
      '\n- Environment tag: {name: "env", value: "production"}' +
      '\n- Owner: {name: "team", value: "platform"}' +
      '\n\n**Dynamic groups (appliesTo):** ' +
      'Auto-add resource/device matching criteria: ' +
      '\n- appliesTo: "isWindows()" - All Windows resource/device' +
      '\n- appliesTo: "system.hostname =\\~ \\"\\*prod\\*\\"" - Hostnames containing "prod"' +
      '\n- appliesTo: "hasCategory(\\"AWS/EC2\\")" - All AWS EC2 instances' +
      '\n\n**Workflow:** Create group hierarchy first, then add resource/device to groups via "create\\_resource" or move existing resource/device via "update\\_resource". ' +
      '\n\n**Related tools:** "list\\_resource\\_groups" (browse hierarchy), "update\\_resource\\_group" (modify), "delete\\_resource\\_group" (remove empty groups).',
    annotations: {
      title: 'Create resource/device group',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the resource/device group',
        },
        parentId: {
          type: 'number',
          description: 'Parent group ID (use 1 for root)',
        },
        description: {
          type: 'string',
          description: 'Description of the resource/device group',
        },
        disableAlerting: {
          type: 'boolean',
          description: 'Whether to disable alerting for this group',
        },
        customProperties: {
          type: 'array',
          description: 'Array of custom properties',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              value: { type: 'string' },
            },
          },
        },
        appliesTo: {
          type: 'string',
          description: 'Dynamic membership query (auto-add resource/device matching criteria)',
        },
      },
      additionalProperties: false,
      required: ['name'],
    },
  },
  {
    name: 'update_resource_group',
    description: 'Update an existing resource/device group in LogicMonitor (LM) monitoring. ' +
      '\n\n**What this does:** Modify group properties, custom properties, or dynamic membership rules. Changes to custom properties affect all resource/device in the group. ' +
      '\n\n**When to use:** ' +
      '\n- Rename group' +
      '\n- Update description' +
      '\n- Change/add custom properties (affects all resources/devices)' +
      '\n- Modify dynamic membership (appliesTo)' +
      '\n- Move group to different parent' +
      '\n\n**Required parameters:** ' +
      '\n- groupId: Group ID to update (from "list\\_resource\\_groups")' +
      '\n\n**Optional parameters (what to change):** ' +
      '\n- name: New group name' +
      '\n- description: New description' +
      '\n- parentId: Move to different parent group' +
      '\n- customProperties: Update inherited properties (affects all resources/devices!)' +
      '\n- appliesTo: Change dynamic membership query' +
      '\n\n**Common update scenarios:** ' +
      '\n\n**Rename group:** ' +
      '{groupId: 123, name: "Production-US-East"}' +
      '\n\n**Add credentials to all resource/device in group:** ' +
      '{groupId: 123, customProperties: [{name: "ssh.user", value: "monitoring"}]}' +
      '\n\n**Update environment tag:** ' +
      '{groupId: 123, customProperties: [{name: "env", value: "production"}]}' +
      '\n\n**Move group to different parent:** ' +
      '{groupId: 123, parentId: 456} // Moves group under new parent' +
      '\n\n**Update dynamic membership:** ' +
      '{groupId: 123, appliesTo: "system.hostname =\\~ \\"\\*prod\\*\\""}' +
      '\n\n**⚠️ Important notes:** ' +
      '\n- Updating customProperties affects ALL resource/device in group (including subgroups)' +
      '\n- Devices inherit properties - changes propagate immediately' +
      '\n- Moving group (changing parentId) moves all resource/device and subgroups with it' +
      '\n- Changing appliesTo can cause resource/device to auto-add or auto-remove' +
      '\n\n**Best practice:** Use "get\\_resource\\_group" first to review current configuration and see which resource/device will be affected. ' +
      '\n\n**Workflow:** Use "list\\_resource\\_groups" to find groupId, review with "get\\_resource\\_group", then update. ' +
      '\n\n**Related tools:** "get\\_resource\\_group" (review before update), "list\\_resources" (see affected resources/devices), "list\\_resource\\_groups" (find group).',
    annotations: {
      title: 'Update resource/device group',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        groupId: {
          type: 'number',
          description: 'The ID of the resource/device group to update',
        },
        name: {
          type: 'string',
          description: 'New name for the resource/device group',
        },
        description: {
          type: 'string',
          description: 'New description',
        },
        disableAlerting: {
          type: 'boolean',
          description: 'Whether to disable alerting',
        },
        parentId: {
          type: 'number',
          description: 'Move to different parent group',
        },
        customProperties: {
          type: 'array',
          description: 'Array of custom properties (affects all resources/devices in group)',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              value: { type: 'string' },
            },
          },
        },
        appliesTo: {
          type: 'string',
          description: 'Dynamic membership query (change auto-add criteria)',
        },
        opType: {
          type: 'string',
          description: 'Operation type: "replace" or "add"',
        },
      },
      additionalProperties: false,
      required: ['groupId'],
    },
  },
  {
    name: 'delete_resource_group',
    description: 'Delete a resource/device group from LogicMonitor (LM) monitoring. ' +
      '\n\n**⚠️ WARNING: IMPACT ON DEVICES** ' +
      '\n- Deleting group does NOT delete resource/device - resource/device are moved to parent group or root' +
      '\n- Subgroups are also deleted (recursive)' +
      '\n- resources/Devices lose inherited custom properties from this group' +
      '\n- Cannot delete groups with subgroups or resource/device (must be empty)' +
      '\n\n**What this does:** Removes organizational folder from hierarchy. resources/Devices and subgroups must be moved/deleted first before deleting group. ' +
      '\n\n**When to use:** ' +
      '\n- Clean up unused organizational folders' +
      '\n- Restructure group hierarchy' +
      '\n- Remove temporary groupings' +
      '\n- Consolidate duplicate groups' +
      '\n\n**Required parameters:** ' +
      '\n- groupId: Group ID to delete (from "list\\_resource\\_groups")' +
      '\n\n**Optional parameters:** ' +
      '\n- deleteHardFlag: true = delete even if has resource/device (moves resource/device to root), false = fail if not empty (safer, default)' +
      '\n\n**Before deleting - check:** ' +
      '\n- Use "get\\_resource\\_group" to see how many resource/device and subgroups' +
      '\n- Use "list\\_resources" with filter to see which resource/device are in group' +
      '\n- Move resource/device to another group via "update\\_resource" if needed' +
      '\n- Delete or move subgroups first' +
      '\n\n**Common workflow for cleanup:** ' +
      '\n\n**Safe deletion (empty group only):** ' +
      '\n- Check group: get_resource_group(groupId: 123)' +
      '\n- If numOfHosts = 0 and no subgroups: delete_resource_group(groupId: 123)' +
      '\n- If has resources/devices: Move resource/device first, then delete group' +
      '\n\n**Force deletion (moves resources/devices):** ' +
      '\n- delete_resource_group(groupId: 123, deleteHardFlag: true)' +
      '\n- resources/Devices move to parent group (or root if no parent)' +
      '\n- resources/Devices lose inherited custom properties from deleted group' +
      '\n\n**⚠️ Impact of deletion:** ' +
      '\n- resources/Devices lose custom properties inherited from this group (credentials, tags)' +
      '\n- Alert rules filtering by group path may break' +
      '\n- Dashboards filtering by group may show no data' +
      '\n- Reports scoped to this group need updating' +
      '\n\n**Best practice:** Move resource/device to new group before deleting old group to avoid losing custom properties. ' +
      '\n\n**Workflow:** Use "get\\_resource\\_group" to verify empty, then delete. Or move resource/device first via "update\\_resource". ' +
      '\n\n**Related tools:** "get\\_resource\\_group" (check before delete), "list\\_resources" (find resource/device in group), "update\\_resource" (move resource/device first).',
    annotations: {
      title: 'Delete resource/device group',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        groupId: {
          type: 'number',
          description: 'The ID of the resource/device group to delete',
        },
        deleteChildren: {
          type: 'boolean',
          description: 'Whether to delete child resource/device groups as well',
        },
      },
      additionalProperties: false,
      required: ['groupId'],
    },
  },

  // Alert Management Tools
  {
    name: 'list_alerts',
    description: 'List active alerts in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Array of alerts with: id (alertId), severity (critical/error/warning), resource name, datasource, datapoint, alert message, start time (startEpoch), acknowledgement status (acked), alert rule. ' +
      '\n\n**When to use:** ' +
      '\n- Get all critical production alerts' +
      '\n- Find unacknowledged alerts needing attention' +
      '\n- Monitor specific service health' +
      '\n- Check CPU/memory alerts' +
      '\n- Generate alert reports' +
      '\n\n**Two search modes:** ' +
      '\n- **Simple search:** Use query parameter with free text (e.g., query:"prod-web-01") - searches by resource/device name (monitorObjectName field)' +
      '\n- **Advanced filtering:** Use filter parameter with LM filter syntax (e.g., filter:"severity:critical,acked:false") for precise control' +
      '\n\n**Common filter patterns:** ' +
      '\n- Critical alerts: filter:"severity:critical"' +
      '\n- Unacknowledged: filter:"acked:false"' +
      '\n- Specific device: filter:"monitorObjectName\\~\\*prod-web-01\\*"' +
      '\n- CPU alerts: filter:"resourceTemplateName\\~\\*CPU\\*"' +
      '\n- Recent alerts: filter:"startEpoch>1730851200" (epoch seconds)' +
      '\n- Combined: filter:"severity:critical,acked:false" (AND logic)' +
      '\n\n**Query vs Filter:** ' +
      '\n- query: Simple text search by resource/device name only (e.g., query:"production", query:"k8s-cluster")' +
      '\n- filter: Precise LM filter syntax with any alert field. Use for severity, acked status, etc.' +
      '\n- If both provided, query is converted to filter and combined with provided filter using AND logic' +
      '\n\n**Important:** Alert API does NOT support OR operator (||). Use comma for AND only. For complex queries, make multiple calls. ' +
      '\n\n**Important:** LogicMonitor may return a negative "total" value due to a known upstream API limitation - this does not mean the request failed. Never use "total" to count or check for results; check the length of the "items" array instead, and use pagination (size/offset) or autoPaginate: true to retrieve all items across pages. ' +
      '\n\n**Important - resourceId is NOT the device ID:** Each alert includes a "resourceId" field that looks like a device ID but is not - it is the deviceDataSourceId (the ID of the specific device+DataSource/logicmodule pairing that generated the alert, same ID used by "get\\_resource\\_datasource"). The actual device ID is the "monitorObjectId" field - use it with "get\\_resource" to look up the device. Additionally, filtering by "resourceId" or "monitorObjectId" on this endpoint does not appear to work (confirmed against the raw LogicMonitor API, independent of this tool) - to scope alerts to a specific device, filter or search by "monitorObjectName" instead, or filter by "monitorObjectGroups" to scope to a device group. ' +
      '\n\n**Related tools:** "get\\_alert" (full details), "acknowledge\\_alert" (acknowledge), "add\\_alert\\_note" (add notes), "generate\\_alert\\_link" (get URL).',
    annotations: {
      title: 'List alerts',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Simple search query. Free text (e.g., "prod-web-01", "k8s-cluster") searches by resource/device name (monitorObjectName). Can also use filter syntax (e.g., "severity:critical") which gets formatted automatically.',
        },
        ...paginationSchema,
        ...filterSchema,
        ...fieldsSchema,
        needMessage: {
          type: 'boolean',
          description: 'Whether to include alert message details',
          default: true,
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_alert',
    description: 'Get detailed information about a specific alert in LogicMonitor (LM) monitoring by its ID. ' +
      '\n\n**Returns:** Complete alert details: alert message, severity, threshold crossed, current value, alert history, escalation chain triggered, acknowledgement details, resource details, datasource/datapoint info, alert rule applied. ' +
      '\n\n**When to use:** ' +
      '\n- Investigate specific alert after getting ID from "list\\_alerts"' +
      '\n- Check threshold and current values' +
      '\n- Review alert history and escalation' +
      '\n- Get context before acknowledging' +
      '\n\n**Workflow:** First use "list\\_alerts" to find the alertId, then use this tool for complete investigation details. ' +
      '\n\n**Important - resourceId is NOT the device ID:** The "resourceId" field returned on the alert looks like a device ID but is not - it is the deviceDataSourceId (the ID of the specific device+DataSource/logicmodule pairing, same ID used by "get\\_resource\\_datasource"). The actual device ID is the "monitorObjectId" field - use it with "get\\_resource" to look up the device. ' +
      '\n\n**Related tools:** "acknowledge\\_alert" (acknowledge alert), "add\\_alert\\_note" (document findings), "generate\\_alert\\_link" (share with team).',
    annotations: {
      title: 'Get alert details',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        alertId: {
          type: 'string',
          description: 'The ID of the alert to retrieve',
        },
        needMessage: {
          type: 'boolean',
          description: 'Whether to include alert message details',
          default: true,
        },
        ...fieldsSchema,
      },
      additionalProperties: false,
      required: ['alertId'],
    },
  },
  {
    name: 'acknowledge_alert',
    description: 'Acknowledge an alert in LogicMonitor (LM) monitoring to indicate someone is working on it. ' +
      '\n\n**What this does:** ' +
      '\n- Marks alert as "acknowledged" (someone is handling it)' +
      '\n- STOPS alert escalation (no more notifications for this alert)' +
      '\n- Records who acknowledged and when' +
      '\n- Shows team the issue is being investigated' +
      '\n\n**When to use:** ' +
      '\n- When you start investigating an alert' +
      '\n- To stop repeat notifications' +
      '\n- To show team ownership' +
      '\n- Before scheduling maintenance' +
      '\n- During incident response' +
      '\n\n**Required parameters:** ' +
      '\n- alertId: Alert ID from "list\\_alerts" or "search\\_alerts"' +
      '\n- comment: REQUIRED - Explain what you\'re doing (e.g., "Investigating high CPU. Checking processes.")' +
      '\n\n**Best practices:** ' +
      '\n- Acknowledge immediately when starting investigation' +
      '\n- Add meaningful comment for team communication' +
      '\n- Use "add\\_alert\\_note" to document findings as you investigate' +
      '\n- If false alarm, acknowledge with explanation' +
      '\n\n**Comment examples:** ' +
      '\n- "Investigating. Appears to be batch job. Monitoring."' +
      '\n- "False alarm - planned maintenance. Creating SDT."' +
      '\n- "Working on fix. ETA 30 minutes. - John"' +
      '\n- "Escalated to network team. Ticket INC-12345."' +
      '\n\n**Workflow for alert handling:** ' +
      '\n- Use "list\\_alerts" with filter:"acked:false" to find unacked alerts' +
      '\n- Use this tool to acknowledge (stops notifications)' +
      '\n- Investigate issue' +
      '\n- Use "add\\_alert\\_note" to document findings and actions' +
      '\n- Resolve underlying issue (alert auto-clears when metrics normalize)' +
      '\n\n**Note:** If alert continues (still above threshold), it stays acknowledged until cleared. New instances = new alerts. ' +
      '\n\n**Related tools:** "list\\_alerts" (find alerts), "get\\_alert" (investigate), "add\\_alert\\_note" (document), "generate\\_alert\\_link" (share).',
    annotations: {
      title: 'Acknowledge alert',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        alertId: {
          type: 'string',
          description: 'The ID of the alert to acknowledge',
        },
        comment: {
          type: 'string',
          description: 'Acknowledgment comment',
        },
      },
      additionalProperties: false,
      required: ['alertId'],
    },
  },
  {
    name: 'add_alert_note',
    description: 'Add a note to an alert for documentation, collaboration, and incident tracking. ' +
      '\n\n**What this does:** ' +
      '\n- Adds timestamped note visible to entire team' +
      '\n- Documents investigation steps and findings' +
      '\n- Creates audit trail for postmortem analysis' +
      '\n- Enables team collaboration on active incidents' +
      '\n\n**When to use:** ' +
      '\n- Document investigation steps' +
      '\n- Share findings with team' +
      '\n- Track actions taken' +
      '\n- Explain resolution' +
      '\n- Note false positives' +
      '\n- Link to tickets/incidents' +
      '\n\n**Required parameters:** ' +
      '\n- alertId: Alert ID from "list\\_alerts"' +
      '\n- note: Your documentation/findings' +
      '\n\n**Use cases and examples:** ' +
      '\n\n**During investigation:** ' +
      '\n- "Checked logs - found memory leak in app. Restarting service."' +
      '\n- "CPU spike correlates with backup job. Expected behavior."' +
      '\n- "Disk full on /var/log. Rotating logs now."' +
      '\n\n**Team collaboration:** ' +
      '\n- "Paging database team - appears to be query performance issue"' +
      '\n- "Confirmed network issue. Created ticket NET-5678 with network team"' +
      '\n- "Waiting on cloud provider - incident status: https://status.aws.com"' +
      '\n\n**Resolution documentation:** ' +
      '\n- "RESOLVED: Cleared temp files. Disk usage now 45%. Will schedule cleanup job."' +
      '\n- "FALSE ALARM: Threshold too sensitive. Updated datasource threshold to 90%."' +
      '\n- "FIXED: Restarted stuck process. Root cause analysis in JIRA-1234"' +
      '\n\n**Best practices:** ' +
      '\n- Add notes as you investigate (breadcrumb trail)' +
      '\n- Include timestamps for long investigations' +
      '\n- Link to related tickets (JIRA, ServiceNow, etc.)' +
      '\n- Document "why false alarm" for future reference' +
      '\n- Use clear, actionable language' +
      '\n\n**Workflow:** ' +
      '\n- Acknowledge alert with "acknowledge\\_alert" (stops notifications)' +
      '\n- Add initial note: "Starting investigation"' +
      '\n- Add notes as you discover findings' +
      '\n- Add final note with resolution or next steps' +
      '\n\n**Related tools:** "acknowledge\\_alert" (first step), "get\\_alert" (view existing notes), "list\\_alerts" (find alerts).',
    annotations: {
      title: 'Add alert note',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        alertId: {
          type: 'string',
          description: 'The ID of the alert',
        },
        note: {
          type: 'string',
          description: 'The note to add',
        },
      },
      additionalProperties: false,
      required: ['alertId', 'note'],
    },
  },

  // Collector Tools
  {
    name: 'list_collectors',
    description: 'List all LogicMonitor (LM) monitoring collectors (monitoring agents). ' +
      '\n\n**Returns:** Array of collectors with: id, description (collector name), hostname, platform (Windows/Linux), status (alive/dead), build version, number of monitored resources/devices, last heartbeat time. ' +
      '\n\n**When to use:** ' +
      '\n- Check collector health status before adding resources/devices' +
      '\n- Find available collectors for new resource/device assignments' +
      '\n- Monitor collector capacity and load' +
      '\n- Identify offline/dead collectors' +
      '\n\n**What are collectors:** Lightweight agents installed on-premise or in cloud that collect metrics from resources/devices. Each resource/device must be assigned to one collector. ' +
      '\n\n**Common filter patterns:** ' +
      '\n- Alive collectors: filter:"status:alive"' +
      '\n- By platform: filter:"platform:Linux" or filter:"platform:Windows"' +
      '\n- By name: filter:"description\\~\\*prod\\*"' +
      '\n- Low capacity: filter:"numberOfHosts<100"' +
      '\n\n**Before creating resources/devices:** Use this tool to find collectorId for the "preferredCollectorId" parameter in "create\\_resource". ' +
      '\n\n**Important:** LogicMonitor may return a negative "total" value due to a known upstream API limitation - this does not mean the request failed. Never use "total" to count or check for results; check the length of the "items" array instead, and use pagination (size/offset) or autoPaginate: true to retrieve all items across pages. ' +
      '\n\n**Related tools:** "get\\_collector" (details), "list\\_collector\\_groups" (browse groups), "list\\_collector\\_versions" (check updates).',
    annotations: {
      title: 'List collectors',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        ...paginationSchema,
        ...filterSchema,
        ...fieldsSchema,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_collector',
    description: 'Get detailed information about a specific collector by its ID in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Complete collector details: description (name), hostname, platform, status, build version, number of resource/device monitored, free disk space, CPU/memory usage, last heartbeat, configuration. ' +
      '\n\n**When to use:** ' +
      '\n- Check collector health before assigning resources/devices' +
      '\n- Verify collector capacity' +
      '\n- Troubleshoot connectivity issues' +
      '\n- Check version for updates' +
      '\n- Monitor collector performance' +
      '\n\n**Health indicators to check:** ' +
      '\n- status: "alive" (healthy) vs "dead" (offline/problem)' +
      '\n- numberOfHosts: How many resource/device this collector monitors (capacity planning)' +
      '\n- freeDiskSpace: Disk space available (needs GB for data buffering)' +
      '\n- build: Version number (compare with "list\\_collector\\_versions" for updates)' +
      '\n- lastHeartbeatTime: Recent = healthy, old = potential issue' +
      '\n\n**Workflow:** Use "list\\_collectors" to find collectorId, then use this tool for detailed health check. ' +
      '\n\n**Related tools:** "list\\_collectors" (find collector), "list\\_collector\\_versions" (check updates), "list\\_resources" (see assigned resources/devices).',
    annotations: {
      title: 'Get collector details',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        collectorId: {
          type: 'number',
          description: 'The ID of the collector to retrieve',
        },
        ...fieldsSchema,
      },
      additionalProperties: false,
      required: ['collectorId'],
    },
  },

  // Debug Command Tools
  {
    name: 'execute_debug_command',
    description: 'Execute a debug command on a LogicMonitor (LM) collector for advanced troubleshooting and scripting. ' +
      '\n\n**⚠️ Safety warning:** This executes arbitrary code/commands directly on the target collector\'s host operating system, with the same privileges as the collector process. Commands can read, modify, or delete data, invoke scripts (e.g. "!groovy"), and affect monitoring behavior for that collector and any resources/devices it services. Only run commands you understand, double-check the collectorId, and avoid destructive commands unless intentional. ' +
      '\n\n**Returns:** Debug object with: cmdline (echo of the command sent), output (command output, if it returned synchronously), cmdContext and sessionId (present for long-running/session-based commands - pass either to "get\\_debug\\_command\\_result" to poll for further output). ' +
      '\n\n**When to use:** ' +
      '\n- Discover available debug commands and their syntax: use cmdline "help" for the full list, or "help <command>" for usage of a specific command' +
      '\n- Test a Groovy/PowerShell script against a resource/device before deploying it in a DataSource, EventSource, or PropertySource' +
      '\n- Interactively debug a discovery or collection script' +
      '\n- Inspect low-level collector state not exposed by other API endpoints' +
      '\n\n**Command syntax:** Debug commands are free-form strings typed exactly as they would be in the collector\'s built-in debug console. Multi-line commands (e.g. Groovy scripts) use "\\n" line separators within the cmdline string. Any device/instance targeting (e.g. "hostId=6412") is embedded directly inside the cmdline string - do NOT pass it as a separate parameter. ' +
      '\n\n**Synchronous vs session-based:** Quick commands (e.g. "help", simple lookups) return their full output immediately in this call\'s "output" field. Long-running or interactive commands instead return a "sessionId"/"cmdContext" - pass that value as "id" to "get\\_debug\\_command\\_result" (with the same collectorId) to retrieve additional output. ' +
      '\n\n**Full command reference:** MCP resource "lm://docs/debug-commands" has the complete syntax reference for every debug command. Read it once if unfamiliar with debug command syntax; skip it if you already know the syntax you need. ' +
      '\n\n**Related tools:** "get\\_debug\\_command\\_result" (poll for more output on long-running commands), "execute\\_groovy\\_script" / "execute\\_powershell\\_script" (typed wrappers for the two most common scripting commands), "list\\_collectors" / "get\\_collector" (find a valid collectorId), "get\\_resource" (find a hostId to embed in cmdline).',
    annotations: {
      title: 'Execute collector debug command',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        collectorId: {
          type: 'number',
          description: 'ID of the collector to run the debug command on (from "list_collectors" or "get_collector"). Required to route the command, even though LogicMonitor\'s API marks it optional.',
        },
        cmdline: {
          type: 'string',
          description: 'The debug command string to execute, exactly as typed in LogicMonitor\'s collector debug console (e.g. "!groovy hostId=6412\\nprintln(\\"hello world!\\")\\nreturn 0", or "help" / "help <command>" to discover syntax). Any target device/instance association (e.g. hostId=) must be embedded inside this string itself, not passed as a separate parameter.',
        },
      },
      additionalProperties: false,
      required: ['collectorId', 'cmdline'],
    },
  },
  {
    name: 'get_debug_command_result',
    description: 'Retrieve additional output from a previously started LogicMonitor (LM) collector debug command session, by polling with the sessionId/cmdContext returned from "execute\\_debug\\_command". ' +
      '\n\n**⚠️ Safety note:** Classified as a write/execute operation (not read-only) because it continues to drive an active debug command session on the collector, even though the HTTP verb is GET. ' +
      '\n\n**Returns:** Debug object with: output (additional output accumulated since the last poll), cmdline (echo of the original command), cmdContext, sessionId. ' +
      '\n\n**When to use:** ' +
      '\n- After "execute\\_debug\\_command" returns a sessionId/cmdContext instead of (or in addition to) final output, indicating the command is long-running or session-based' +
      '\n- Repeatedly poll this tool with the same id/collectorId until output stabilizes or the session ends' +
      '\n\n**Workflow:** Call "execute\\_debug\\_command" first; if the response includes a sessionId/cmdContext, pass that value as "id" (with the same collectorId) to this tool to fetch further output. ' +
      '\n\n**Related tools:** "execute\\_debug\\_command" (start a debug command session).',
    annotations: {
      title: 'Get collector debug command result',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The sessionId/cmdContext returned from a prior "execute_debug_command" (or "get_debug_command_result") call, used to poll for additional output.',
        },
        collectorId: {
          type: 'number',
          description: 'ID of the collector the original debug command was run on (must match the collectorId used in "execute_debug_command").',
        },
      },
      additionalProperties: false,
      required: ['id', 'collectorId'],
    },
  },
  {
    name: 'execute_groovy_script',
    description: 'Execute a Groovy script on a LogicMonitor (LM) collector - a typed wrapper around "execute\\_debug\\_command"\'s "!groovy" command that builds the cmdline string for you. ' +
      '\n\n**⚠️ Safety warning:** Same as "execute\\_debug\\_command" - this runs arbitrary code on the collector host with the collector process\'s privileges. ' +
      '\n\n**Returns:** Debug object with: cmdline, output (if synchronous), cmdContext and sessionId (present for long-running scripts - pass either to "get\\_debug\\_command\\_result" to poll for further output). ' +
      '\n\n**When to use:** ' +
      '\n- Test a Groovy script (a DataSource/EventSource/PropertySource collection or discovery script, or a standalone script) against a device before deploying it as a LogicModule' +
      '\n- Run a script already present on the collector filesystem ("scriptPath"), or an inline script body ("scriptBody") ' +
      '\n\n**Required:** exactly one of "scriptPath" or "scriptBody" - providing both or neither is rejected. ' +
      '\n\n**Related tools:** "get\\_debug\\_command\\_result" (poll for output on long-running scripts), "execute\\_debug\\_command" (generic form, any command), "execute\\_powershell\\_script" (Windows PowerShell equivalent), "get\\_datasource\\_scripts" (extract an existing DataSource\'s embedded scripts to test here).',
    annotations: {
      title: 'Execute Groovy script on collector',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        collectorId: {
          type: 'number',
          description: 'ID of the collector to run the script on (from "list_collectors" or "get_collector").',
        },
        scriptPath: {
          type: 'string',
          description: 'Absolute path, or path relative to <agentRoot>/bin, of a script file already on the collector. Mutually exclusive with scriptBody.',
        },
        scriptBody: {
          type: 'string',
          description: 'Inline Groovy script text to execute. Mutually exclusive with scriptPath.',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in seconds (default 180).',
        },
        runner: {
          type: 'string',
          enum: ['agent', 'sse'],
          description: 'Where to run the script. Defaults to "agent".',
        },
        hostId: {
          type: 'number',
          description: 'ID of the resource/device (in the portal) whose properties should be bound to the script.',
        },
        collectorHostId: {
          type: 'string',
          description: 'Advanced/rare: the "h=" option - which host on the collector the host properties will be bound to. Usually not needed.',
        },
      },
      additionalProperties: false,
      required: ['collectorId'],
    },
  },
  {
    name: 'execute_powershell_script',
    description: 'Execute a PowerShell script on a LogicMonitor (LM) collector - a typed wrapper around "execute\\_debug\\_command"\'s "!posh" command that builds the cmdline string for you. Windows collectors only - fails with "!posh is not supported on linux" on Linux/Unix collectors. ' +
      '\n\n**⚠️ Safety warning:** Same as "execute\\_debug\\_command" - this runs arbitrary code on the collector host with the collector process\'s privileges. ' +
      '\n\n**Returns:** Debug object with: cmdline, output (if synchronous), cmdContext and sessionId (present for long-running scripts - pass either to "get\\_debug\\_command\\_result" to poll for further output). ' +
      '\n\n**When to use:** ' +
      '\n- Test a PowerShell script (a DataSource/EventSource/PropertySource collection or discovery script, or a standalone script) against a device before deploying it as a LogicModule, on a Windows collector' +
      '\n\n**Note:** unlike "execute\\_groovy\\_script", "!posh" only supports a script file already on the collector filesystem - there is no inline script body option. ' +
      '\n\n**Related tools:** "get\\_debug\\_command\\_result" (poll for output on long-running scripts), "execute\\_debug\\_command" (generic form, any command), "execute\\_groovy\\_script" (cross-platform Groovy equivalent), "get\\_datasource\\_scripts" (extract an existing DataSource\'s embedded scripts to test here).',
    annotations: {
      title: 'Execute PowerShell script on collector',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        collectorId: {
          type: 'number',
          description: 'ID of the collector to run the script on (from "list_collectors" or "get_collector"). Must be a Windows collector.',
        },
        scriptPath: {
          type: 'string',
          description: 'Absolute path, or path relative to <agentRoot>/bin, of the PowerShell script file on the collector.',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in seconds.',
        },
        hostId: {
          type: 'number',
          description: 'ID of the resource/device (in the portal) whose properties should be bound to the script.',
        },
      },
      additionalProperties: false,
      required: ['collectorId', 'scriptPath'],
    },
  },

  // DataSource Tools
  {
    name: 'list_datasources',
    description: 'List all available datasources in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Array of datasources with: id, name, displayName, description, appliesTo (which resource/device it monitors), collection method, datapoints/metrics collected. ' +
      '\n\n**What are datasources:** Templates that define WHAT to monitor (e.g., CPU, memory, disk), HOW to collect it (SNMP, WMI, API), and WHEN to alert. LogicMonitor has 2000+ pre-built datasources for common technologies. ' +
      '\n\n**When to use:** ' +
      '\n- Find datasource for specific technology (e.g., "AWS\\_EC2", "VMware\\_vCenter")' +
      '\n- Discover what can be monitored' +
      '\n- Get datasource IDs for API operations' +
      '\n- Browse monitoring capabilities' +
      '\n\n**Common filter patterns:** ' +
      '\n- By name: filter:"name\\~\\*CPU\\*" or filter:"displayName\\~\\*Memory\\*"' +
      '\n- Cloud providers: filter:"name\\~\\*AWS\\*" or filter:"name\\~\\*Azure\\*"' +
      '\n- Database: filter:"name\\~\\*MySQL\\*" or filter:"name\\~\\*SQL\\_Server\\*"' +
      '\n- Network: filter:"name\\~\\*Cisco\\*" or filter:"name\\~\\*SNMP\\*"' +
      '\n\n**Examples:** AWS\\_EC2 (monitors EC2 instances), SNMP\\_Network\\_Interfaces (network stats), WinCPU (Windows CPU), Linux\\_SSH (Linux via SSH). ' +
      '\n\n**Important:** LogicMonitor may return a negative "total" value due to a known upstream API limitation - this does not mean the request failed. Never use "total" to count or check for results; check the length of the "items" array instead, and use pagination (size/offset) or autoPaginate: true to retrieve all items across pages. ' +
      '\n\n**Related tools:** "get\\_datasource" (details), "list\\_resource\\_datasources" (see what\'s applied to specific resource/device).',
    annotations: {
      title: 'List datasources',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        ...paginationSchema,
        ...filterSchema,
        ...fieldsSchema,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_datasource',
    description: 'Get detailed information about a specific datasource by its ID in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Complete datasource details: name, displayName, description, appliesTo logic, collection method, datapoints (metrics), thresholds, alert rules, polling interval. ' +
      '\n\n**When to use:** ' +
      '\n- Understand what datasource monitors' +
      '\n- Review alert thresholds' +
      '\n- See collection method (SNMP/WMI/API/script)' +
      '\n- Check datapoint definitions' +
      '\n- Troubleshoot why datasource applies/doesn\'t apply to device' +
      '\n\n**Key information returned:** ' +
      '\n- appliesTo: Logic determining which resource/device get this datasource (e.g., "system.hostname =\\~\\"\\*prod\\*\\"")' +
      '\n- dataSourceType: Collection method (SNMP, WMI, JDBC, API, script)' +
      '\n- dataPoints: List of metrics collected (e.g., CPUBusyPercent, MemoryUsedPercent)' +
      '\n- alertExpr: Threshold formulas (when to alert)' +
      '\n- collectInterval: How often data is collected (seconds)' +
      '\n\n**Understanding appliesTo logic:** Shows why datasource does/doesn\'t monitor certain resources/devices. Common patterns: ' +
      '\n- isWindows() - Only Windows resource/device' +
      '\n- system.devicetype == "server" - Only servers' +
      '\n- hasCategory("AWS/EC2") - Only AWS EC2 instances' +
      '\n\n**Workflow:** Use "list\\_datasources" to find dataSourceId, then use this tool to understand how it works. ' +
      '\n\n**Related tools:** "list\\_datasources" (find datasource), "list\\_resource\\_datasources" (see which resource/device use it).',
    annotations: {
      title: 'Get datasource details',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        dataSourceId: {
          type: 'number',
          description: 'The ID of the datasource to retrieve',
        },
        ...fieldsSchema,
      },
      additionalProperties: false,
      required: ['dataSourceId'],
    },
  },
  {
    name: 'get_datasource_scripts',
    description: 'Extract every embedded script from a LogicMonitor (LM) DataSource definition, across all the places a script can live in that definition (collection method, discovery method, ERI discovery, per-datapoint post-processors), instead of hunting through the full nested object returned by "get\\_datasource". ' +
      '\n\n**Returns:** `{dataSourceId, scripts: [{location, field, language, scriptType?, cmdline?, content}]}` - one entry per non-empty script found. "language" is one of groovy/windows/linux/expression. Empty array if the DataSource has no script-based collection/discovery method and no groovy/complex post-processors. ' +
      '\n\n**When to use:** ' +
      '\n- Before debugging or modifying a DataSource\'s script, to see exactly what script(s) it contains without manually parsing collectorAttribute/autoDiscoveryConfig/dataPoints' +
      '\n- To pull a script out for testing via "execute\\_groovy\\_script" / "execute\\_powershell\\_script"' +
      '\n\n**Workflow:** Use "list\\_datasources" to find dataSourceId, this tool to extract its scripts, then "execute\\_groovy\\_script"/"execute\\_powershell\\_script" to test one against a device. ' +
      '\n\n**Related tools:** "get\\_datasource" (full raw definition), "update\\_datasource" (write a modified script back), "execute\\_groovy\\_script" / "execute\\_powershell\\_script" (test extracted scripts).',
    annotations: {
      title: 'Extract DataSource embedded scripts',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        dataSourceId: {
          type: 'number',
          description: 'The ID of the datasource to extract scripts from',
        },
      },
      additionalProperties: false,
      required: ['dataSourceId'],
    },
  },
  {
    name: 'create_datasource',
    description: 'Create a new DataSource LogicModule in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** The created DataSource object, including its new "id". ' +
      '\n\n**When to use:** ' +
      '\n- Define a new monitoring template programmatically (e.g. generated from a discovered API, or migrated from another system) ' +
      '\n\n**Note on collectorAttribute/autoDiscoveryConfig shape:** these are polymorphic - their exact fields depend on "collectMethod"/the discovery method name (e.g. a script-based DataSource sets collectMethod:"script" and collectorAttribute.groovyScript/windowsScript/linuxScript; an SNMP one sets collectMethod:"snmp" and different fields). This tool passes them through as-is; consult an existing similar DataSource (via "get\\_datasource") for the exact shape to replicate. ' +
      '\n\n**Related tools:** "get\\_datasource" (see the shape of an existing DataSource to model a new one on), "update\\_datasource", "delete\\_datasource", "get\\_datasource\\_scripts" (extract scripts from an existing one to reuse).',
    annotations: {
      title: 'Create DataSource',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Internal name of the DataSource (no spaces, e.g. "MyApp_Health")',
        },
        displayName: {
          type: 'string',
          description: 'Human-readable display name',
        },
        description: {
          type: 'string',
          description: 'Description of what this DataSource monitors',
        },
        appliesTo: {
          type: 'string',
          description: 'AppliesTo expression determining which resources/devices this DataSource applies to (e.g. "isWindows()")',
        },
        group: {
          type: 'string',
          description: 'DataSource group/category name',
        },
        technology: {
          type: 'string',
          description: 'Free-text notes on the monitored technology/setup requirements',
        },
        tags: {
          type: 'string',
          description: 'Comma-separated tags',
        },
        collectMethod: {
          type: 'string',
          description: 'Collection method: snmp|ping|wmi|cim|datadump|dns|ipmi|jdbc|script|batchscript|sdkscript|udp|tcp|xen|esx (etc)',
        },
        collectInterval: {
          type: 'number',
          description: 'Collection interval in seconds',
        },
        collectorAttribute: {
          type: 'object',
          description: 'Collector attribute object - shape depends on collectMethod. For collectMethod:"script"/"batchscript", include groovyScript and/or windowsScript+windowsCmdline and/or linuxScript+linuxCmdline, and scriptType ("embed"|"file"|"powershell"). See "get_datasource" on an existing DataSource with the same collectMethod for the exact shape.',
        },
        dataPoints: {
          type: 'array',
          description: 'Array of datapoint definitions (metrics collected). See an existing DataSource via "get_datasource" for the shape.',
        },
        enableAutoDiscovery: {
          type: 'boolean',
          description: 'Whether this DataSource uses Active Discovery to find instances',
        },
        autoDiscoveryConfig: {
          type: 'object',
          description: 'Auto-discovery configuration, including "method" (shape depends on the discovery method name, e.g. ad_script uses groovyScript/winScript+winCmdline/linuxScript+linuxCmdline).',
        },
        enableEriDiscovery: {
          type: 'boolean',
          description: 'Whether this DataSource uses External Resource Inventory (ERI) discovery',
        },
        eriDiscoveryConfig: {
          type: 'object',
          description: 'ERI discovery configuration (same script field shape as autoDiscoveryConfig.method).',
        },
      },
      additionalProperties: false,
      required: ['name', 'collectMethod', 'collectInterval', 'collectorAttribute'],
    },
  },
  {
    name: 'update_datasource',
    description: 'Update an existing DataSource LogicModule in LogicMonitor (LM) monitoring. Partial update - only include fields you want to change. ' +
      '\n\n**Returns:** The updated DataSource object. ' +
      '\n\n**When to use:** ' +
      '\n- Modify an existing DataSource\'s script, appliesTo logic, datapoints, or metadata ' +
      '\n\n**Workflow:** Use "get\\_datasource" or "get\\_datasource\\_scripts" first to see the current definition/scripts, test any script changes via "execute\\_groovy\\_script"/"execute\\_powershell\\_script", then write the change back with this tool. ' +
      '\n\n**Related tools:** "get\\_datasource" (current definition), "get\\_datasource\\_scripts" (current scripts), "create\\_datasource", "delete\\_datasource".',
    annotations: {
      title: 'Update DataSource',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        dataSourceId: {
          type: 'number',
          description: 'The ID of the datasource to update',
        },
        name: { type: 'string', description: 'Internal name of the DataSource' },
        displayName: { type: 'string', description: 'Human-readable display name' },
        description: { type: 'string', description: 'Description of what this DataSource monitors' },
        appliesTo: { type: 'string', description: 'AppliesTo expression' },
        group: { type: 'string', description: 'DataSource group/category name' },
        technology: { type: 'string', description: 'Free-text notes on the monitored technology/setup requirements' },
        tags: { type: 'string', description: 'Comma-separated tags' },
        collectMethod: { type: 'string', description: 'Collection method: snmp|ping|wmi|cim|datadump|dns|ipmi|jdbc|script|batchscript|sdkscript|udp|tcp|xen|esx (etc)' },
        collectInterval: { type: 'number', description: 'Collection interval in seconds' },
        collectorAttribute: {
          type: 'object',
          description: 'Collector attribute object - shape depends on collectMethod. See "get_datasource" for the current shape before modifying.',
        },
        dataPoints: {
          type: 'array',
          description: 'Array of datapoint definitions. See "get_datasource" for the current shape before modifying.',
        },
        enableAutoDiscovery: { type: 'boolean', description: 'Whether this DataSource uses Active Discovery' },
        autoDiscoveryConfig: {
          type: 'object',
          description: 'Auto-discovery configuration. See "get_datasource" for the current shape before modifying.',
        },
        enableEriDiscovery: { type: 'boolean', description: 'Whether this DataSource uses ERI discovery' },
        eriDiscoveryConfig: {
          type: 'object',
          description: 'ERI discovery configuration. See "get_datasource" for the current shape before modifying.',
        },
      },
      additionalProperties: false,
      required: ['dataSourceId'],
    },
  },
  {
    name: 'delete_datasource',
    description: 'Delete a DataSource LogicModule from LogicMonitor (LM) monitoring. ' +
      '\n\n**⚠️ Warning:** This removes the monitoring template entirely for all resources/devices it applies to - any historical data collected under it becomes orphaned. Consider whether disabling/scoping "appliesTo" instead (via "update\\_datasource") meets the need before deleting. ' +
      '\n\n**Related tools:** "get\\_datasource" (verify what you\'re about to delete), "update\\_datasource" (alternative: narrow appliesTo instead of deleting).',
    annotations: {
      title: 'Delete DataSource',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        dataSourceId: {
          type: 'number',
          description: 'The ID of the datasource to delete',
        },
      },
      additionalProperties: false,
      required: ['dataSourceId'],
    },
  },

  // Device DataSource Instance Tools
  {
    name: 'list_resource_instances',
    description: 'List instances of a datasource on a specific resource/device in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Array of instances with: id, name, displayName, description, status, alert status, last collection time. ' +
      '\n\n**What are instances:** Individual components monitored by a datasource. Examples: individual disks (C:, D:, E:), network interfaces (eth0, eth1), database tables, processes. ' +
      '\n\n**When to use:** ' +
      '\n- List all disks on a server before getting disk metrics' +
      '\n- Find specific network interface for bandwidth data' +
      '\n- Discover what instances are being monitored' +
      '\n- Get instance IDs for metric retrieval' +
      '\n\n**Example workflow:** ' +
      'Device "web-server-01" has datasource "WinVolumeUsage-" → instances: C:, D:, E: (each disk is an instance) ' +
      'Device "router-01" has datasource "SNMP\\_Network\\_Interfaces" → instances: GigabitEthernet0/1, GigabitEthernet0/2 (each interface is an instance) ' +
      '\n\n**Complete workflow to get metrics:** ' +
      '\n- Use "list\\_resource\\_datasources" to get deviceDataSourceId' +
      '\n- Use this tool to list instances and get instanceId' +
      '\n- Use "get\\_resource\\_instance\\_data" with instanceId to get actual metrics' +
      '\n\n**Important:** LogicMonitor may return a negative "total" value due to a known upstream API limitation - this does not mean the request failed. Never use "total" to count or check for results; check the length of the "items" array instead, and use pagination (size/offset) or autoPaginate: true to retrieve all items across pages. ' +
      '\n\n**Related tools:** "list\\_resource\\_datasources" (first step), "get\\_resource\\_instance\\_data" (get metrics).',
    annotations: {
      title: 'List datasource instances',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        deviceId: {
          type: 'number',
          description: 'The resource/device ID',
        },
        deviceDataSourceId: {
          type: 'number',
          description: 'The resource/device datasource ID',
        },
        ...paginationSchema,
        ...filterSchema,
        ...fieldsSchema,
      },
      additionalProperties: false,
      required: ['deviceId', 'deviceDataSourceId'],
    },
  },
  {
    name: 'get_resource_instance_data',
    description: 'Get time-series metrics/datapoints data (e.g., CPU/memory/network utilization) for a specific resource/device datasource instance in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Time-series data with timestamps and values for requested datapoints. Format: {timestamps: [epoch1, epoch2], values: {datapoint1: [val1, val2], datapoint2: [val1, val2]}}. ' +
      '\n\n**When to use:** ' +
      '\n- Get CPU utilization for last 24 hours' +
      '\n- Fetch disk usage trends' +
      '\n- Retrieve network bandwidth data' +
      '\n- Export metrics for analysis' +
      '\n- Build custom dashboards/reports' +
      '\n\n**Required workflow (3 steps):** ' +
      '\n- Use "list\\_resource\\_datasources" → get deviceDataSourceId for datasource (e.g., WinCPU)' +
      '\n- Use "list\\_resource\\_instances" → get instanceId for specific instance (e.g., CPU Core 0)' +
      '\n- Use this tool → get actual metric values for that instance' +
      '\n\n**Parameters:** ' +
      '\n- deviceId: Device ID from "get\\_resource" or "list\\_resources"' +
      '\n- deviceDataSourceId: From "get\\_resource\\_datasource" or "list\\_resource\\_datasources"' +
      '\n- instanceId: From "list\\_resource\\_instances"' +
      '\n- datapoints: Comma-separated metric names (e.g., "CPUBusyPercent,MemoryUsedPercent")' +
      '\n- start/end: Time range in epoch milliseconds (not seconds!), start time must be before current time' +
      '\n\n**Example:** Get last hour CPU data: start=Date.now()-3600000, end=Date.now() ' +
      '\n\n**Time range tips:** If omitted, returns last 2 hours. Max range: 1 year. Use shorter ranges for better performance. ' +
      '\n\n**Related tools:** "list\\_resource\\_datasources", "list\\_resource\\_instances".',
    annotations: {
      title: 'Get time-series metric data',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        deviceId: {
          type: 'number',
          description: 'The resource/device ID',
        },
        deviceDataSourceId: {
          type: 'number',
          description: 'The resource/device datasource ID',
        },
        instanceId: {
          type: 'number',
          description: 'The instance ID',
        },
        datapoints: {
          type: 'string',
          description: 'Comma-separated list of metric/datapoint names',
        },
        start: {
          type: 'number',
          description: 'Start time (epoch milliseconds), start time must be before current time',
        },
        end: {
          type: 'number',
          description: 'End time (epoch milliseconds)',
        },
        format: {
          type: 'string',
          description: 'Response format: "json" or "csv"',
        },
      },
      additionalProperties: false,
      required: ['deviceId', 'deviceDataSourceId', 'instanceId'],
    },
  },

  // Dashboard Tools
  {
    name: 'list_dashboards',
    description: 'List all dashboards in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Array of dashboards with: id, name, description, groupId, groupName, widget count, owner. ' +
      '\n\n**When to use:** ' +
      '\n- Find AWS/Azure/infrastructure dashboards' +
      '\n- Discover available pre-built dashboards' +
      '\n- Get dashboard IDs for generating links' +
      '\n- List dashboards in specific group' +
      '\n\n**Common filter patterns:** ' +
      '\n- By name: filter:"name\\~\\*AWS\\*" (find all AWS dashboards)' +
      '\n- By group: filter:"groupId:5" or filter:"groupName\\~\\*Cloud\\*"' +
      '\n- By owner: filter:"owner:john.doe"' +
      '\n\n**Next step:** Use "generate\\_dashboard\\_link" with the dashboard ID to get the full clickable URL for sharing. ' +
      '\n\n**Tip:** Dashboards are organized in groups. Use "list\\_dashboard\\_groups" to browse the hierarchy. ' +
      '\n\n**Important:** LogicMonitor may return a negative "total" value due to a known upstream API limitation - this does not mean the request failed. Never use "total" to count or check for results; check the length of the "items" array instead, and use pagination (size/offset) or autoPaginate: true to retrieve all items across pages. ' +
      '\n\n**Related tools:** "get\\_dashboard" (details), "generate\\_dashboard\\_link" (get URL), "list\\_dashboard\\_groups" (browse hierarchy).',
    annotations: {
      title: 'List dashboards',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        ...paginationSchema,
        ...filterSchema,
        ...fieldsSchema,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_dashboard',
    description: 'Get detailed information about a specific dashboard by its ID in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Complete dashboard details: name, description, groupId, owner, widgets configuration, widget count, sharing settings, template variables, last modified. ' +
      '\n\n**When to use:** ' +
      '\n- Review dashboard configuration' +
      '\n- See widget definitions before cloning' +
      '\n- Check dashboard owner' +
      '\n- Verify template variables' +
      '\n- Get dashboard metadata' +
      '\n\n**What you get:** ' +
      '\n- widgetsConfig: JSON configuration of all widgets (chart types, metrics, thresholds)' +
      '\n- widgetTokens: Template variables (e.g., defaultDeviceGroup for dynamic filtering)' +
      '\n- groupId/groupName: Which folder dashboard is in' +
      '\n- sharable: Whether dashboard is public/private' +
      '\n\n**Use cases:** ' +
      '\n- Clone dashboard to create similar one' +
      '\n- Export dashboard configuration for backup' +
      '\n- Audit which resources/devices/metrics are being visualized' +
      '\n- Document dashboard purpose and widgets' +
      '\n\n**Workflow:** Use "list\\_dashboards" to find dashboardId, then get details, then "generate\\_dashboard\\_link" to get shareable URL. ' +
      '\n\n**Related tools:** "list\\_dashboards" (find dashboard), "generate\\_dashboard\\_link" (get URL), "update\\_dashboard" (modify), "list\\_dashboard\\_groups" (browse folders).',
    annotations: {
      title: 'Get dashboard details',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        dashboardId: {
          type: 'number',
          description: 'The ID of the dashboard to retrieve',
        },
        ...fieldsSchema,
      },
      additionalProperties: false,
      required: ['dashboardId'],
    },
  },
  {
    name: 'create_dashboard',
    description: 'Create a new dashboard in LogicMonitor (LM) monitoring. ' +
      '\n\n**What this does:** Creates a new visual monitoring dashboard with widgets for metrics, alerts, maps, and more. Dashboards provide at-a-glance views of infrastructure health. ' +
      '\n\n**When to use:** ' +
      '\n- Build custom monitoring views for teams' +
      '\n- Create executive summary dashboards' +
      '\n- Visualize specific applications/services' +
      '\n- Set up NOC/SOC displays' +
      '\n- Share monitoring data with stakeholders' +
      '\n\n**Required parameters:** ' +
      '\n- name: Dashboard name (e.g., "Production Infrastructure", "Executive Summary")' +
      '\n\n**Optional parameters:** ' +
      '\n- groupId: Dashboard folder ID (from "list\\_dashboard\\_groups", use 1 for root)' +
      '\n- description: Dashboard purpose/audience' +
      '\n- widgetsConfig: JSON array of widget configurations (graphs, alerts, gauges, maps)' +
      '\n- sharable: true (public link) or false (private, login required)' +
      '\n- widgetTokens: Template variables for dynamic filtering' +
      '\n\n**Dashboard workflow:** ' +
      '\n- Create empty dashboard with name and folder' +
      '\n- Use LogicMonitor UI to add widgets visually (easier than JSON)' +
      '\n- Use "get\\_dashboard" to export widgetsConfig for cloning' +
      '\n- Use "generate\\_dashboard\\_link" to get shareable URL' +
      '\n\n**Common dashboard types:** ' +
      '\n\n**NOC/SOC Dashboard:** ' +
      '\n- Alert widgets showing critical alerts' +
      '\n- Gauge widgets for key metrics (CPU, memory, bandwidth)' +
      '\n- Maps showing geographic resource/device status' +
      '\n- SLA widgets showing availability percentages' +
      '\n\n**Executive Dashboard:** ' +
      '\n- High-level availability metrics' +
      '\n- Alert counts by severity' +
      '\n- Service health status' +
      '\n- Trend graphs (week/month comparisons)' +
      '\n\n**Application Dashboard:** ' +
      '\n- App server metrics (response time, throughput)' +
      '\n- Database performance (queries/sec, connection pools)' +
      '\n- Load balancer health' +
      '\n- Error rate trends' +
      '\n\n**Best practices:** ' +
      '\n- Start simple - create dashboard, add widgets in UI' +
      '\n- Use groups to organize dashboards by team/function' +
      '\n- Make critical dashboards "sharable" for NOC displays' +
      '\n- Use widgetTokens for dynamic filtering (##defaultDeviceGroup##)' +
      '\n- Clone existing dashboards using "get\\_dashboard" widgetsConfig' +
      '\n\n**After creation:** Use "generate\\_dashboard\\_link" to get the full URL for sharing or embedding. ' +
      '\n\n**Related tools:** "generate\\_dashboard\\_link" (get URL), "list\\_dashboards" (browse existing), "get\\_dashboard" (export for cloning), "update\\_dashboard" (modify).',
    annotations: {
      title: 'Create dashboard',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the dashboard',
        },
        description: {
          type: 'string',
          description: 'Description of the dashboard',
        },
        groupId: {
          type: 'number',
          description: 'Dashboard group ID',
        },
        widgetsConfig: {
          type: 'string',
          description: 'JSON string of widget configuration',
        },
      },
      additionalProperties: false,
      required: ['name'],
    },
  },
  {
    name: 'update_dashboard',
    description: 'Update an existing dashboard in LogicMonitor (LM) monitoring. ' +
      '\n\n**What this does:** Modify dashboard name, description, widgets, sharing settings, or move to different folder. ' +
      '\n\n**When to use:** ' +
      '\n- Rename dashboard' +
      '\n- Update dashboard description' +
      '\n- Move to different folder' +
      '\n- Change sharing settings' +
      '\n- Bulk update widgets (advanced)' +
      '\n\n**Required parameters:** ' +
      '\n- id: Dashboard ID (from "list\\_dashboards")' +
      '\n\n**Optional parameters (what to change):** ' +
      '\n- name: New dashboard name' +
      '\n- description: Updated description' +
      '\n- groupId: Move to different dashboard folder' +
      '\n- sharable: true (make public) or false (require login)' +
      '\n- widgetsConfig: JSON widget configuration (advanced - usually modify in UI)' +
      '\n- widgetTokens: Update template variables' +
      '\n\n**Common update scenarios:** ' +
      '\n\n**Rename dashboard:** ' +
      '{id: 123, name: "Production - Updated"}' +
      '\n\n**Move to different folder:** ' +
      '{id: 123, groupId: 456}' +
      '\n\n**Make dashboard public (shareable):** ' +
      '{id: 123, sharable: true}' +
      '\n\n**Update description:** ' +
      '{id: 123, description: "Executive view - updated quarterly"}' +
      '\n\n**⚠️ Widget updates:** ' +
      'Updating widgetsConfig directly is complex (large JSON). Easier to: ' +
      '\n- Modify widgets in LogicMonitor UI' +
      '\n- Use API only for name/description/folder changes' +
      '\n- Or use "get\\_dashboard" to export, modify JSON, then update' +
      '\n\n**Best practice:** Use "get\\_dashboard" first to see current configuration, then update specific fields. ' +
      '\n\n**After update:** Use "generate\\_dashboard\\_link" to get updated URL if needed. ' +
      '\n\n**Related tools:** "get\\_dashboard" (review before update), "list\\_dashboards" (find dashboard), "generate\\_dashboard\\_link" (get new URL).',
    annotations: {
      title: 'Update dashboard',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        dashboardId: {
          type: 'number',
          description: 'The ID of the dashboard to update',
        },
        name: {
          type: 'string',
          description: 'New name for the dashboard',
        },
        description: {
          type: 'string',
          description: 'New description',
        },
      },
      additionalProperties: false,
      required: ['dashboardId'],
    },
  },
  {
    name: 'delete_dashboard',
    description: 'Delete a dashboard from LogicMonitor (LM) monitoring. ' +
      '\n\n**⚠️ WARNING: PERMANENT DELETION** ' +
      '\n- Dashboard and all widgets are permanently removed' +
      '\n- Shared dashboard links will stop working' +
      '\n- Users with bookmarks will get 404 errors' +
      '\n- Cannot be undone - no recovery possible' +
      '\n\n**What this does:** Permanently removes dashboard from LogicMonitor. All widgets, configuration, and sharing links are deleted. ' +
      '\n\n**When to use:** ' +
      '\n- Remove outdated dashboards' +
      '\n- Clean up duplicates' +
      '\n- Delete test/temporary dashboards' +
      '\n- Consolidate similar dashboards' +
      '\n\n**Required parameters:** ' +
      '\n- id: Dashboard ID to delete (from "list\\_dashboards")' +
      '\n\n**Before deleting - check:** ' +
      '\n- Use "get\\_dashboard" to verify it\'s the correct dashboard' +
      '\n- Check if dashboard is widely shared/used' +
      '\n- Consider exporting configuration for backup (via "get\\_dashboard")' +
      '\n- Notify users if it\'s a team dashboard' +
      '\n\n**Impact of deletion:** ' +
      '\n- NOC/SOC displays showing this dashboard will break' +
      '\n- Embedded dashboard iframes will show errors' +
      '\n- Users\' custom home dashboards may need reconfiguration' +
      '\n- Shared public links become invalid' +
      '\n\n**Alternatives to deletion:** ' +
      '\n- Rename to "ARCHIVED - [name]" instead of deleting' +
      '\n- Move to "Archived" folder' +
      '\n- Make private (sharable: false) instead of deleting' +
      '\n- Export configuration via "get\\_dashboard" before deleting' +
      '\n\n**Best practice:** Export dashboard configuration before deletion in case you need to recreate it. ' +
      '\n\n**Workflow:** Use "get\\_dashboard" to backup/verify, then delete. ' +
      '\n\n**Related tools:** "get\\_dashboard" (backup before delete), "list\\_dashboards" (find dashboard), "update\\_dashboard" (archive instead of delete).',
    annotations: {
      title: 'Delete dashboard',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        dashboardId: {
          type: 'number',
          description: 'The ID of the dashboard to delete',
        },
      },
      additionalProperties: false,
      required: ['dashboardId'],
    },
  },

  // Widget Tools
  {
    name: 'list_widgets',
    description: 'List widgets in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Array of widgets with: id, name, description, type, dashboardId, theme, interval, timescale, lastUpdatedOn, lastUpdatedBy. ' +
      '\n\n**When to use:** ' +
      '\n- See all widgets on a specific dashboard (pass dashboardId)' +
      '\n- Find a specific widget by name/type across the whole account (omit dashboardId)' +
      '\n- Get widget IDs before calling "get\\_widget", "update\\_widget", or "delete\\_widget"' +
      '\n\n**Widget types you will see:** alert, batchjob, flash, gmap, ngraph, ograph, cgraph, sgraph, ' +
      'netflowgraph, groupNetflowGraph, netflow, groupNetflow, html, bigNumber, gauge, pieChart, table, ' +
      'dynamicTable, deviceSLA, text, statsd, deviceStatus, serviceAlert, noc, websiteOverview, ' +
      'websiteOverallStatus, websiteIndividualStatus, websiteSLA, savedMap. ' +
      '\n\n**Common filter patterns:** ' +
      '\n- By name: filter:"name\\~\\*CPU\\*"' +
      '\n- By type: filter:"type:html"' +
      '\n\n**Important:** LogicMonitor may return a negative "total" value due to a known upstream API limitation - this does not mean the request failed. Never use "total" to count or check for results; check the length of the "items" array instead, and use pagination (size/offset) or autoPaginate: true to retrieve all items across pages. ' +
      '\n\n**Related tools:** "get\\_widget" (full definition including type-specific config), "list\\_dashboards" (find dashboardId).',
    annotations: {
      title: 'List widgets',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        dashboardId: {
          type: 'number',
          description: 'Restrict results to widgets on this dashboard only. Omit to list widgets across the entire account.',
        },
        ...paginationSchema,
        ...filterSchema,
        ...fieldsSchema,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_widget',
    description: 'Get the complete definition of a specific widget by its ID in LogicMonitor (LM) monitoring, including its type-specific configuration (e.g., the HTML/script body of an "html" widget, the datapoints of a "bigNumber" widget, the map settings of a "gmap" widget, etc). ' +
      '\n\n**Returns:** Full widget object: id, name, description, type, dashboardId, theme, interval, timescale, plus every field specific to that widget\'s type. ' +
      '\n\n**When to use:** ' +
      '\n- Inspect exactly what a widget renders and how (e.g., security-reviewing an "html" widget\'s embedded script)' +
      '\n- Export a widget\'s config before cloning it to another dashboard' +
      '\n- Debug why a widget shows unexpected data' +
      '\n\n**Note on schema:** LogicMonitor widgets are polymorphic - the response shape varies by "type". This tool returns the raw object as LM sends it; consult LM\'s API docs for the field list of a specific type if needed. ' +
      '\n\n**Workflow:** Use "list\\_widgets" (optionally with a dashboardId) to find the widgetId, then use this tool for the full definition. ' +
      '\n\n**Related tools:** "list\\_widgets" (find widgetId), "get\\_widget\\_data" (live rendered values), "update\\_widget" (modify).',
    annotations: {
      title: 'Get widget details',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        widgetId: {
          type: 'number',
          description: 'The ID of the widget to retrieve',
        },
        ...fieldsSchema,
      },
      additionalProperties: false,
      required: ['widgetId'],
    },
  },
  {
    name: 'create_widget',
    description: 'Create a new widget on a dashboard in LogicMonitor (LM) monitoring. ' +
      '\n\n**Required parameters:** ' +
      '\n- dashboardId: The dashboard this widget belongs to (from "list\\_dashboards")' +
      '\n- name: Widget name' +
      '\n- type: One of alert, batchjob, flash, gmap, ngraph, ograph, cgraph, sgraph, netflowgraph, ' +
      'groupNetflowGraph, netflow, groupNetflow, html, bigNumber, gauge, pieChart, table, dynamicTable, ' +
      'deviceSLA, text, statsd, deviceStatus, serviceAlert, noc, websiteOverview, websiteOverallStatus, ' +
      'websiteIndividualStatus, websiteSLA, savedMap' +
      '\n\n**Optional parameters:** ' +
      '\n- description, theme, interval (minutes), timescale' +
      '\n- config: Object holding every field specific to the chosen "type" (e.g., for an "html" widget this ' +
      'is where the HTML/script body goes; for a "bigNumber" widget this is where the datapoint/graphInfo ' +
      'goes). LogicMonitor\'s widget schema is polymorphic per type - build this the same shape LM\'s UI/API ' +
      'would produce for that type, or clone it from an existing widget via "get\\_widget". ' +
      '\n\n**Workflow:** Use "get\\_widget" on a similar existing widget to see the exact shape expected for that type, then adapt it here. ' +
      '\n\n**Related tools:** "get\\_widget" (see an example of the target type), "update\\_widget" (modify after creation), "list\\_dashboards" (find dashboardId).',
    annotations: {
      title: 'Create widget',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        dashboardId: {
          type: 'number',
          description: 'The ID of the dashboard this widget belongs to',
        },
        name: {
          type: 'string',
          description: 'Name of the widget',
        },
        type: {
          type: 'string',
          description: 'Widget type. One of: alert, batchjob, flash, gmap, ngraph, ograph, cgraph, sgraph, ' +
            'netflowgraph, groupNetflowGraph, netflow, groupNetflow, html, bigNumber, gauge, pieChart, table, ' +
            'dynamicTable, deviceSLA, text, statsd, deviceStatus, serviceAlert, noc, websiteOverview, ' +
            'websiteOverallStatus, websiteIndividualStatus, websiteSLA, savedMap',
        },
        description: {
          type: 'string',
          description: 'Description of the widget',
        },
        theme: {
          type: 'string',
          description: 'Color scheme, e.g. newBorderBlue, newSolidGray, simplePurple, etc.',
        },
        interval: {
          type: 'number',
          description: 'Refresh interval of the widget, in minutes',
        },
        timescale: {
          type: 'string',
          description: 'Default timescale of the widget',
        },
        config: {
          type: 'object',
          description: 'Type-specific configuration fields for the chosen widget "type" (e.g., HTML/script ' +
            'body for an "html" widget, datapoint/graph config for a "bigNumber"/"gauge"/"*graph" widget, map ' +
            'settings for "gmap", etc). Merged directly onto the widget alongside the common fields above.',
        },
      },
      additionalProperties: false,
      required: ['dashboardId', 'name', 'type'],
    },
  },
  {
    name: 'update_widget',
    description: 'Modify an existing widget in LogicMonitor (LM) monitoring. ' +
      '\n\n**What this does:** Partially updates a widget - only the fields you provide are changed; everything else is left as-is. ' +
      '\n\n**Common uses:** ' +
      '\n- Rename a widget or change its description' +
      '\n- Change theme/interval/timescale' +
      '\n- Update type-specific config (e.g., edit an "html" widget\'s script, change a graph widget\'s datapoints) via the "config" field' +
      '\n\n**Workflow:** Use "get\\_widget" first to see current values, then send only the fields you want changed. ' +
      '\n\n**Related tools:** "get\\_widget" (see current definition), "list\\_widgets" (find widgetId), "delete\\_widget" (remove instead).',
    annotations: {
      title: 'Update widget',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        widgetId: {
          type: 'number',
          description: 'The ID of the widget to update',
        },
        name: {
          type: 'string',
          description: 'New name for the widget',
        },
        description: {
          type: 'string',
          description: 'New description',
        },
        theme: {
          type: 'string',
          description: 'New color scheme',
        },
        interval: {
          type: 'number',
          description: 'New refresh interval, in minutes',
        },
        timescale: {
          type: 'string',
          description: 'New default timescale',
        },
        config: {
          type: 'object',
          description: 'Type-specific fields to change (e.g., updated HTML/script body for an "html" widget). Merged directly onto the widget alongside any other fields provided.',
        },
      },
      additionalProperties: false,
      required: ['widgetId'],
    },
  },
  {
    name: 'delete_widget',
    description: 'Delete a widget from LogicMonitor (LM) monitoring. ' +
      '\n\n**⚠️ WARNING: PERMANENT DELETION** - cannot be undone. ' +
      '\n\n**Before deleting - check:** Use "get\\_widget" to verify it\'s the correct widget, and consider exporting its config first in case you need to recreate it. ' +
      '\n\n**Related tools:** "get\\_widget" (backup before delete), "list\\_widgets" (find widgetId).',
    annotations: {
      title: 'Delete widget',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        widgetId: {
          type: 'number',
          description: 'The ID of the widget to delete',
        },
      },
      additionalProperties: false,
      required: ['widgetId'],
    },
  },
  {
    name: 'get_widget_data',
    description: 'Get the live rendered data for a specific widget in LogicMonitor (LM) monitoring - i.e., the actual values it is currently displaying (graph series, table rows, big number value, etc), not its configuration. ' +
      '\n\n**When to use:** ' +
      '\n- Pull the same data a dashboard widget is showing, for use outside the UI' +
      '\n- Verify a widget is rendering the data you expect' +
      '\n\n**Parameters:** ' +
      '\n- widgetId: from "list\\_widgets"' +
      '\n- start/end: optional time range (epoch). If omitted, uses the widget\'s own default timescale' +
      '\n- format: optional response format' +
      '\n\n**Related tools:** "get\\_widget" (configuration/definition instead of data), "list\\_widgets" (find widgetId).',
    annotations: {
      title: 'Get widget data',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        widgetId: {
          type: 'number',
          description: 'The ID of the widget to retrieve data for',
        },
        start: {
          type: 'number',
          description: 'Start time (epoch)',
        },
        end: {
          type: 'number',
          description: 'End time (epoch)',
        },
        format: {
          type: 'string',
          description: 'Response format, e.g. "json" or "csv"',
        },
      },
      additionalProperties: false,
      required: ['widgetId'],
    },
  },

  // Dashboard Link Tools
  {
    name: 'generate_dashboard_link',
    description: 'Generate a direct URL/link/weburl for a LogicMonitor (LM) dashboard. ' +
      `\n\n**Returns:** Complete dashboard URL with full group hierarchy path, dashboard details (id, name, groupName), and group path array. URL pattern: https://${process.env.LM_COMPANY}.logicmonitor.com/santaba/uiv4/dashboards/dashboardGroups-{path},dashboards-{id}` +
      '\n\n**When to use:** ' +
      '\n- Share dashboard links in Slack/email/tickets' +
      '\n- Create documentation with direct dashboard links' +
      '\n- Embed dashboard URLs in runbooks' +
      '\n- Build custom reports with clickable links' +
      '\n\n**Why use this:** Provides the complete navigable URL including all parent group IDs, so the link opens the dashboard in correct context within the UI navigation tree. ' +
      '\n\n**Workflow:** First use "list\\_dashboards" to find dashboard ID, then use this tool to generate the shareable link. ' +
      '\n\n**Related tools:** "list\\_dashboards" (find dashboard), "get\\_dashboard" (get details).',
    annotations: {
      title: 'Generate dashboard link',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        dashboardId: {
          type: 'number',
          description: 'The ID of the dashboard to generate a link for',
        },
      },
      additionalProperties: false,
      required: ['dashboardId'],
    },
  },
  {
    name: 'generate_resource_link',
    description: 'Generate a direct URL/link/weburl for a LogicMonitor (LM) resource/device. ' +
      `\n\n**Returns:** Complete resource URL with full group hierarchy, resource/device details (id, name, displayName), and group path array. URL pattern: https://${process.env.LM_COMPANY}.logicmonitor.com/santaba/uiv4/resources/treeNodes?resourcePath=resourceGroups-{path},resources-{id}` +
      '\n\n**When to use:** ' +
      '\n- Share resource/device links in incident tickets' +
      '\n- Create alert notifications with resource/device links' +
      '\n- Build reports with clickable resource/device references' +
      '\n- Document infrastructure with direct LM links' +
      '\n\n**Why use this:** Provides the complete URL including all parent group IDs, so clicking the link navigates directly to the resource/device in the correct folder context. ' +
      '\n\n**Workflow:** First find resource/device using "list\\_resources" or "search\\_resources", then use this tool with deviceId to generate shareable link. ' +
      '\n\n**Related tools:** "list\\_resources" (find device), "get\\_resource" (get details), "generate\\_alert\\_link" (link to resource/device alerts).',
    annotations: {
      title: 'Generate resource/device link',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        deviceId: {
          type: 'number',
          description: 'The ID of the resource/device to generate a link for',
        },
      },
      additionalProperties: false,
      required: ['deviceId'],
    },
  },
  {
    name: 'generate_alert_link',
    description: 'Generate a direct URL/link/weburl for a LogicMonitor (LM) alert. ' +
      `\n\n**Returns:** Direct URL to alert details page. URL pattern: https://${process.env.LM_COMPANY}.logicmonitor.com/santaba/uiv4/alerts/{alertId}` +
      '\n\n**When to use:** ' +
      '\n- Include alert links in Slack/PagerDuty notifications' +
      '\n- Share alert context with team members' +
      '\n- Create incident tickets with direct alert references' +
      '\n- Build alert reports with clickable links' +
      '\n\n**Why use this:** Simplifies alert investigation by providing direct navigation to the alert details page with full context, history, and acknowledgement options. ' +
      '\n\n**Workflow:** Get alertId from "list\\_alerts", then use this tool to generate the shareable link for team collaboration. ' +
      '\n\n**Related tools:** "list\\_alerts" (find alerts), "get\\_alert" (get details), "acknowledge\\_alert" (acknowledge).',
    annotations: {
      title: 'Generate alert link',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        alertId: {
          type: 'string',
          description: 'The ID of the alert to generate a link for',
        },
      },
      additionalProperties: false,
      required: ['alertId'],
    },
  },

  // Generate Link Group Tools
  {
    name: 'generate_website_link',
    description: 'Generate a direct direct URL/link/weburl for a LogicMonitor (LM) website monitor with full hierarchy path for easy sharing and navigation. ' +
      '\n\n**What this does:** Creates shareable URL that opens specific website monitor in LogicMonitor UI, preserving the full folder hierarchy path. Link works for anyone with access to the LogicMonitor portal. ' +
      `\n\n**Returns:** Complete URL in format: https://${process.env.LM_COMPANY}.logicmonitor.com/santaba/uiv4/websites/treeNodes#websiteGroups-{groupId1},websiteGroups-{groupId2},...,websites-{websiteId} ` +
      '\n\n**When to use:** ' +
      '\n- Share website monitor with team (Slack/email/tickets)' +
      '\n- Create documentation with direct links' +
      '\n- Build custom dashboards/reports with LM links' +
      '\n- Reference in incident tickets' +
      '\n- Bookmark frequently accessed monitors' +
      '\n\n**Required parameters:** ' +
      '\n- websiteId: Website monitor ID (from "list\\_websites" or "search\\_websites")' +
      '\n\n**Common use cases:** ' +
      '\n\n**Share in Slack/Teams:** ' +
      '"Production API health check is failing: [View Monitor](generated-url-here)" ' +
      '\n\n**Incident ticket documentation:** ' +
      '"INC-12345: Website monitor showing SSL certificate expiring in 7 days. See: {generated-url}" ' +
      '\n\n**Runbook links:** ' +
      '"If homepage monitoring alerts, check: {generated-url-for-homepage-monitor}" ' +
      '\n\n**Custom reporting:** ' +
      'Build report that includes clickable links to each website monitor for quick access. ' +
      '\n\n**Link structure explained:** ' +
      'The URL includes complete folder path (websiteGroups) so when clicked, the UI shows: ' +
      '\n- Full breadcrumb navigation (e.g., "All Website Monitors > Production > External APIs > Homepage Check")' +
      '\n- Website monitor details page' +
      '\n- Recent check history and availability' +
      '\n- Current status and response times' +
      '\n\n**Why use generated links:** ' +
      '\n- **Shareable:** Send exact monitor to teammates' +
      '\n- **Bookmarkable:** Save frequent monitors for quick access' +
      '\n- **Integration-friendly:** Use in external tools, tickets, wikis' +
      '\n- **Context-preserving:** Shows full folder hierarchy when opened' +
      '\n\n**Workflow example:** ' +
      '\n- Find website monitor: list_websites() → websiteId: 789' +
      '\n- Generate link: generate_website_link(websiteId: 789)' +
      '\n- Share link: "Check this monitor: https://company.logicmonitor.com/santaba/uiv4/websites/..."' +
      '\n\n**Access requirements:** ' +
      'Link recipients must: ' +
      '\n- Have LogicMonitor user account' +
      '\n- Have permissions to view website monitors' +
      '\n- Have access to specific website monitor (based on access groups)' +
      '\n\n**Best practices:** ' +
      '\n- Use in incident documentation for traceability' +
      '\n- Include in runbooks for quick troubleshooting access' +
      '\n- Add to monitoring dashboards for drill-down capability' +
      '\n- Share with stakeholders who have LM access' +
      '\n\n**Related tools:** "list\\_websites" (find website), "get\\_website" (verify details), "generate\\_dashboard\\_link" (for dashboards), "generate\\_resource\\_link" (for resources/devices), "generate\\_alert\\_link" (for alerts).',
    annotations: {
      title: 'Generate website monitor link',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        websiteId: {
          type: 'number',
          description: 'The ID of the website monitor to generate a link for',
        },
      },
      additionalProperties: false,
      required: ['websiteId'],
    },
  },
  {
    name: 'list_dashboard_groups',
    description: 'List all dashboard groups (folders) in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Array of dashboard groups with: id, name, parentId, full path, description, number of dashboards, number of subgroups, owner. ' +
      '\n\n**What are dashboard groups:** Organizational folders for dashboards, like directories in a file system. Used to organize dashboards by team, function, or application. ' +
      '\n\n**When to use:** ' +
      '\n- Browse dashboard organization before creating/moving dashboards' +
      '\n- Find group IDs for dashboard operations' +
      '\n- Understand dashboard hierarchy' +
      '\n- Navigate to specific dashboard folders' +
      '\n\n**Common organization patterns:** ' +
      '\n- By team: "Platform Team", "Database Team", "Network Team"' +
      '\n- By environment: "Production", "Staging", "Development"' +
      '\n- By application: "Web App", "API Services", "Background Jobs"' +
      '\n- By cloud provider: "AWS Dashboards", "Azure Dashboards"' +
      '\n\n**Workflow:** Use this tool to browse hierarchy, then "list\\_dashboards" filtered by groupId to see dashboards in specific folder. ' +
      '\n\n**Important:** LogicMonitor may return a negative "total" value due to a known upstream API limitation - this does not mean the request failed. Never use "total" to count or check for results; check the length of the "items" array instead, and use pagination (size/offset) or autoPaginate: true to retrieve all items across pages. ' +
      '\n\n**Related tools:** "get\\_dashboard\\_group" (details), "list\\_dashboards" (dashboards in group), "create\\_dashboard\\_group" (create folder).',
    annotations: {
      title: 'List dashboard groups',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        ...paginationSchema,
        ...filterSchema,
        ...fieldsSchema,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_dashboard_group',
    description: 'Get detailed information about a specific dashboard group by its ID in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Complete dashboard group details: name, full path, parentId, description, number of dashboards (direct and total), number of subgroups, owner, permissions. ' +
      '\n\n**When to use:** ' +
      '\n- Get group path for documentation' +
      '\n- Check group membership counts' +
      '\n- Verify group hierarchy' +
      '\n- Review permissions before creating dashboards in it' +
      '\n\n**Workflow:** Use "list\\_dashboard\\_groups" to find groupId, then use this tool for complete details. ' +
      '\n\n**Related tools:** "list\\_dashboard\\_groups" (find groups), "list\\_dashboards" (dashboards in group), "create\\_dashboard\\_group" (create new).',
    annotations: {
      title: 'Get dashboard group details',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        groupId: {
          type: 'number',
          description: 'The ID of the dashboard group to retrieve',
        },
        ...fieldsSchema,
      },
      additionalProperties: false,
      required: ['groupId'],
    },
  },

  // Report Tools
  {
    name: 'list_reports',
    description: 'List all reports (scheduled and on-demand) in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Array of reports with: id, name, type (alert/availability/capacity/performance), description, schedule, recipients, format (PDF/HTML/CSV), last run time. ' +
      '\n\n**What are reports:** Scheduled or on-demand documents summarizing monitoring data. Generate PDFs, HTML, or CSV files with metrics, alerts, availability statistics, capacity planning data. Automatically email to stakeholders. ' +
      '\n\n**When to use:** ' +
      '\n- Find existing reports before creating duplicates' +
      '\n- Review report schedules' +
      '\n- Check who receives reports' +
      '\n- Audit reporting configuration' +
      '\n\n**Report types:** ' +
      '\n- **Alert Reports:** Summary of alerts over time period (count by severity, MTTR, top alerting resources/devices)' +
      '\n- **Availability Reports:** Uptime statistics, SLA compliance, outage summaries' +
      '\n- **Capacity Planning:** Disk growth trends, CPU/memory usage over time, forecasting' +
      '\n- **Performance Reports:** Metric trends, top consumers, performance baselines' +
      '\n- **Custom Reports:** User-defined queries and visualizations' +
      '\n\n**Common use cases:** ' +
      '\n- **Executive summaries:** Monthly availability report to leadership' +
      '\n- **SLA reporting:** Prove 99.9% uptime to customers' +
      '\n- **Capacity planning:** Forecast when to add storage/servers' +
      '\n- **Compliance:** Document monitoring coverage and alert response' +
      '\n- **Billing:** Usage reports for chargebacks' +
      '\n\n**Report schedules:** ' +
      '\n- Daily: 8am delivery for NOC shift handoff' +
      '\n- Weekly: Monday morning management briefing' +
      '\n- Monthly: End-of-month SLA reports' +
      '\n- Quarterly: Capacity planning reviews' +
      '\n- On-demand: Generate for specific incidents/audits' +
      '\n\n**Workflow:** Use this tool to find reports, then "get\\_report" for details, or "generate\\_report" to run on-demand. ' +
      '\n\n**Important:** LogicMonitor may return a negative "total" value due to a known upstream API limitation - this does not mean the request failed. Never use "total" to count or check for results; check the length of the "items" array instead, and use pagination (size/offset) or autoPaginate: true to retrieve all items across pages. ' +
      '\n\n**Related tools:** "get\\_report" (details), "list\\_report\\_groups" (organization), "generate\\_report" (run now).',
    annotations: {
      title: 'List reports',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        ...paginationSchema,
        ...filterSchema,
        ...fieldsSchema,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_report',
    description: 'Get detailed information about a specific report by its ID in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Complete report details: name, type, description, schedule (daily/weekly/monthly), recipients, format, data sources (which resources/devices/groups), date range, customization settings, last run timestamp, delivery status. ' +
      '\n\n**When to use:** ' +
      '\n- Review report configuration before modification' +
      '\n- Check recipients and schedule' +
      '\n- Verify data sources (which resource/device included)' +
      '\n- Troubleshoot why report not received' +
      '\n- Clone report settings for similar report' +
      '\n\n**Configuration details:** ' +
      '\n- Schedule: When report runs (e.g., "Every Monday at 8am")' +
      '\n- Recipients: Who receives report via email' +
      '\n- Format: PDF (management), HTML (web), CSV (data analysis)' +
      '\n- Scope: Which resources/devices/groups are included' +
      '\n- Date range: Last 7 days, last month, custom period' +
      '\n\n**Workflow:** Use "list\\_reports" to find reportId, then use this tool for complete configuration. ' +
      '\n\n**Related tools:** "list\\_reports" (find reports), "update\\_report" (modify), "generate\\_report" (run now).',
    annotations: {
      title: 'Get report details',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        reportId: {
          type: 'number',
          description: 'The ID of the report to retrieve',
        },
        ...fieldsSchema,
      },
      additionalProperties: false,
      required: ['reportId'],
    },
  },

  // Website (Synthetic Monitoring) Tools
  {
    name: 'list_websites',
    description: 'List all website monitors (synthetic checks) in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Array of website monitors with: id, name, type (webcheck/pingcheck), domain/URL, status, checkpoint locations, response time, availability percentage. ' +
      '\n\n**What are website monitors:** Synthetic checks that test URL/service availability from multiple global locations. Like "ping from the internet" to verify your services are accessible. ' +
      '\n\n**When to use:** ' +
      '\n- List all monitored URLs/services' +
      '\n- Check website availability status' +
      '\n- Find website IDs for other operations' +
      '\n- Audit monitored endpoints' +
      '\n\n**Monitor types:** ' +
      '\n- webcheck: Full HTTP/HTTPS check (status code, response time, content validation, SSL cert)' +
      '\n- pingcheck: Simple ICMP ping test (faster, simpler)' +
      '\n\n**Common filter patterns:** ' +
      '\n- By domain: filter:"domain\\~\\*example.com\\*"' +
      '\n- By type: filter:"type:webcheck" or filter:"type:pingcheck"' +
      '\n- By status: filter:"overallAlertStatus:critical" (find down sites)' +
      '\n- By name: filter:"name\\~\\*production\\*"' +
      '\n\n**Use cases:** Monitor public websites, API endpoints, login pages, load balancer health checks, SaaS service availability. ' +
      '\n\n**Important:** LogicMonitor may return a negative "total" value due to a known upstream API limitation - this does not mean the request failed. Never use "total" to count or check for results; check the length of the "items" array instead, and use pagination (size/offset) or autoPaginate: true to retrieve all items across pages. ' +
      '\n\n**Related tools:** "get\\_website" (details), "create\\_website" (add new), "generate\\_website\\_link" (get URL).',
    annotations: {
      title: 'List website monitors',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        ...paginationSchema,
        ...filterSchema,
        ...fieldsSchema,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_website',
    description: 'Get detailed information about a specific website monitor by its ID in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Complete website monitor details: name, type (webcheck/pingcheck), domain/URL, monitoring configuration, checkpoint locations, response time thresholds, SSL settings, authentication, custom headers, alert status. ' +
      '\n\n**When to use:** ' +
      '\n- Review monitoring configuration' +
      '\n- Check checkpoint locations' +
      '\n- Verify URL and settings' +
      '\n- Troubleshoot failed checks' +
      '\n- Audit SSL certificate monitoring' +
      '\n\n**Configuration details returned:** ' +
      '\n- steps: Multi-step transaction monitoring (for complex workflows)' +
      '\n- checkpoints: Which global locations perform checks (e.g., US-East, EU-West, Asia-Pacific)' +
      '\n- schema: HTTP vs HTTPS' +
      '\n- testLocation: Internal (from collector) vs External (from cloud)' +
      '\n- responseTimeThreshold: Alert if slower than X ms' +
      '\n- sslCertExpirationDays: Alert X days before cert expires' +
      '\n\n**Use cases:** ' +
      '\n- Verify website is monitored from correct geographic locations' +
      '\n- Check if SSL certificate expiration monitoring is enabled' +
      '\n- Review response time thresholds (too strict? too lenient?)' +
      '\n- Troubleshoot why website checks are failing' +
      '\n- Document what endpoints are monitored' +
      '\n\n**Workflow:** Use "list\\_websites" to find websiteId, then use this tool for complete monitoring configuration. ' +
      '\n\n**Related tools:** "list\\_websites" (find website), "update\\_website" (modify), "generate\\_website\\_link" (get URL), "list\\_website\\_checkpoints" (available locations).',
    annotations: {
      title: 'Get website monitor details',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        websiteId: {
          type: 'number',
          description: 'The ID of the website to retrieve',
        },
        ...fieldsSchema,
      },
      additionalProperties: false,
      required: ['websiteId'],
    },
  },
  {
    name: 'create_website',
    description: 'Create a new website monitor (synthetic check) in LogicMonitor (LM) monitoring. ' +
      '\n\n**What this does:** Creates synthetic monitoring for websites, APIs, or services. Tests from global checkpoint locations to verify availability, performance, and SSL certificate health. ' +
      '\n\n**When to use:** ' +
      '\n- Monitor customer-facing websites' +
      '\n- Check API endpoint availability' +
      '\n- Track response times from multiple regions' +
      '\n- Monitor SSL certificate expiration' +
      '\n- Verify multi-step transactions' +
      '\n- Monitor third-party services' +
      '\n\n**Required parameters:** ' +
      '\n- name: Monitor name (e.g., "Production Website", "API Health Check")' +
      '\n- domain: URL or hostname (e.g., "example.com", "https://api.example.com")' +
      '\n- type: "webcheck" (HTTP/HTTPS) or "pingcheck" (ICMP ping")' +
      '\n\n**Optional parameters:** ' +
      '\n- groupId: Website folder ID (from "list\\_website\\_groups", default: root)' +
      '\n- description: Monitor purpose/notes' +
      '\n- checkpoints: Array of checkpoint IDs (from "list\\_website\\_checkpoints") for multi-region testing' +
      '\n- steps: Array of HTTP steps for multi-step transactions (login, add to cart, checkout)' +
      '\n- testLocation: "external" (from cloud) or "internal" (from collector)' +
      '\n- schema: "https" or "http"' +
      '\n- responseTimeThreshold: Alert if response time > X milliseconds' +
      '\n- sslCertExpirationDays: Alert X days before SSL expires' +
      '\n- failedCount: Alert after X consecutive failures (default: 2)' +
      '\n\n**Monitor types explained:** ' +
      '\n\n**webcheck (HTTP/HTTPS):** ' +
      '\n- Full HTTP/HTTPS request with response validation' +
      '\n- Check status codes, response time, content matching' +
      '\n- Monitor SSL certificate expiration' +
      '\n- Support for multi-step transactions' +
      '\n- Custom headers, authentication, POST data' +
      '\n\n**pingcheck (ICMP Ping):** ' +
      '\n- Simple reachability test' +
      '\n- Faster, lower overhead than webcheck' +
      '\n- Good for network resources/devices, non-HTTP services' +
      '\n- Only tests if host is reachable' +
      '\n\n**Common monitoring scenarios:** ' +
      '\n\n**Simple website availability:** ' +
      '{name: "Company Website", domain: "example.com", type: "webcheck", checkpoints: [1,2,3], responseTimeThreshold: 3000} ' +
      '\n\n**API health check:** ' +
      '{name: "API /health", domain: "https://api.example.com/health", type: "webcheck", responseTimeThreshold: 500} ' +
      '\n\n**SSL monitoring:** ' +
      '{name: "SSL Cert Check", domain: "example.com", type: "webcheck", sslCertExpirationDays: 30} ' +
      '\n\n**Multi-step transaction (e-commerce):** ' +
      '{name: "Checkout Flow", domain: "shop.example.com", type: "webcheck", steps: [{url: "/login", method: "POST"}, {url: "/cart/add"}, {url: "/checkout"}]} ' +
      '\n\n**Regional performance monitoring:** ' +
      '{name: "Global Website Performance", domain: "example.com", type: "webcheck", checkpoints: [1,2,3,4,5,6]} // Test from US, EU, Asia ' +
      '\n\n**Best practices:** ' +
      '\n- Use multiple checkpoints for production sites (avoid false positives)' +
      '\n- Set realistic responseTimeThreshold (not too sensitive)' +
      '\n- Monitor SSL expiration 30+ days in advance' +
      '\n- Use internal testLocation for private/VPN applications' +
      '\n- Test multi-step transactions for critical user flows' +
      '\n- Set failedCount >=2 to reduce false alarms' +
      '\n\n**After creation:** Use "generate\\_website\\_link" to get direct URL to view monitor results. ' +
      '\n\n**Related tools:** "list\\_website\\_checkpoints" (find locations), "generate\\_website\\_link" (get URL), "update\\_website" (modify), "list\\_websites" (browse existing).',
    annotations: {
      title: 'Create website monitor',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the website monitor',
        },
        domain: {
          type: 'string',
          description: 'Domain or URL to monitor',
        },
        type: {
          type: 'string',
          description: 'Monitor type: "webcheck" or "pingcheck"',
        },
        description: {
          type: 'string',
          description: 'Description of the monitor',
        },
        checkpointId: {
          type: 'number',
          description: 'Checkpoint location ID',
        },
      },
      additionalProperties: false,
      required: ['name', 'domain', 'type'],
    },
  },
  {
    name: 'update_website',
    description: 'Update an existing website monitor in LogicMonitor (LM) monitoring. ' +
      '\n\n**What this does:** Modify website monitor settings including URL, checkpoints, thresholds, SSL settings, or multi-step transaction flows. ' +
      '\n\n**When to use:** ' +
      '\n- Change monitored URL' +
      '\n- Add/remove checkpoint locations' +
      '\n- Update response time thresholds' +
      '\n- Modify SSL expiration alerts' +
      '\n- Update multi-step transaction steps' +
      '\n- Enable/disable monitoring' +
      '\n\n**Required parameters:** ' +
      '\n- websiteId: Website monitor ID (from "list\\_websites")' +
      '\n\n**Optional parameters (what to change):** ' +
      '\n- name: New monitor name' +
      '\n- domain: New URL/hostname' +
      '\n- description: Updated description' +
      '\n- groupId: Move to different folder' +
      '\n- checkpoints: Update checkpoint locations' +
      '\n- responseTimeThreshold: New response time alert threshold' +
      '\n- sslCertExpirationDays: Update SSL warning days' +
      '\n- failedCount: Change consecutive failure threshold' +
      '\n- steps: Update multi-step transaction flow' +
      '\n- stopMonitoring: true (pause) or false (resume monitoring)' +
      '\n\n**Common update scenarios:** ' +
      '\n\n**Update URL after migration:** ' +
      '{websiteId: 123, domain: "https://new-domain.com"} ' +
      '\n\n**Add more checkpoint locations:** ' +
      '{websiteId: 123, checkpoints: [1,2,3,4,5,6]} // Add Asia-Pacific checkpoints ' +
      '\n\n**Adjust response time threshold:** ' +
      '{websiteId: 123, responseTimeThreshold: 5000} // Increase to 5 seconds ' +
      '\n\n**Update SSL certificate warning:** ' +
      '{websiteId: 123, sslCertExpirationDays: 60} // Alert 60 days before expiry ' +
      '\n\n**Temporarily pause monitoring:** ' +
      '{websiteId: 123, stopMonitoring: true} // During maintenance ' +
      '\n\n**Update multi-step transaction:** ' +
      '{websiteId: 123, steps: [{url: "/api/v2/health"}, {url: "/api/v2/status"}]} // New API version ' +
      '\n\n**Best practice:** Use "get\\_website" first to review current configuration, then update specific fields. ' +
      '\n\n**After update:** Monitor may take 1-2 minutes to reflect changes in next check cycle. ' +
      '\n\n**Related tools:** "get\\_website" (review before update), "list\\_websites" (find website), "generate\\_website\\_link" (get updated URL).',
    annotations: {
      title: 'Update website monitor',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        websiteId: {
          type: 'number',
          description: 'The ID of the website to update',
        },
        name: {
          type: 'string',
          description: 'New name',
        },
        description: {
          type: 'string',
          description: 'New description',
        },
      },
      additionalProperties: false,
      required: ['websiteId'],
    },
  },
  {
    name: 'create_uptime_check',
    description: 'Create a new LM Uptime resource (synthetic HTTP check) in LogicMonitor (LM) monitoring. ' +
      '\n\n**What this does:** Adds a monitored resource of type "uptimewebcheck" (LM\'s newer Uptime feature, distinct from the legacy Website/checkpoint monitors created by "create\\_website"). Runs one or more HTTP steps against a domain from global checkpoint locations or internal collectors, and can assert on status code and/or response body content (e.g. verifying a specific keyword, HTML element, or attribute appears on the page). ' +
      '\n\n**Required parameters:** ' +
      '\n- displayName: Friendly name shown in LM' +
      '\n- name: Internal/unique name (often same as displayName or the domain)' +
      '\n- domain: Base domain or URL of the service (e.g. "example.com" or "example.com/app")' +
      '\n\n**Optional parameters:** ' +
      '\n- schema: "http" or "https" (default: "https")' +
      '\n- testLocation: {all: true} to test from all global checkpoints (default), {smgIds: [2,3,4,5,6]} for specific checkpoint locations, or {collectorIds: [id]} to test from an internal collector instead' +
      '\n- isInternal: false (default) for an external check run from LM\'s global SaaS checkpoints (no collector involved); true only for a private/internal check run from your own collector(s)' +
      '\n- useDefaultAlertSetting: true (default) to inherit alert thresholds and SSL alert behavior from LM\'s default alert settings — what you want almost always. Set to false only when you need per-check overrides (e.g. a custom SSL expiration alert), since false without explicit overrides will disable SSL error/expiration alerting entirely.' +
      '\n- pollingInterval: Minutes between checks, 1-10 (default: 5)' +
      '\n- hostGroupIds: Comma-separated resource/website folder IDs' +
      '\n- description: Notes about what this check verifies' +
      '\n- preferredCollectorId: Only for internal checks (isInternal: true) — do not set this for external checkpoint-based checks' +
      '\n- steps: Array of HTTP steps (at least one is required). Each step: ' +
      '\n  - name: Step label' +
      '\n  - url: Path or full URL for this step (e.g. "/" or "/login")' +
      '\n  - HTTPMethod: "GET" | "HEAD" | "POST" (default: "GET")' +
      '\n  - matchType: "plain" (substring match) or "regex" (default: "plain")' +
      '\n  - keyword: Text or regex that must appear in the response body for the step to pass (e.g. \'id="username"\' to confirm a login field rendered)' +
      '\n  - invertMatch: true to instead fail when the keyword IS found (default: false)' +
      '\n  - statusCode: Expected HTTP status code, as a string (e.g. "200")' +
      '\n  - timeout: Request timeout in seconds' +
      '\n  - HTTPHeaders / HTTPBody: Custom request headers/body' +
      '\n  - followRedirection: Whether to follow redirects (default: true)' +
      '\n\n**Example — verify a login page renders its username field:** ' +
      '{displayName: "Portal Login Page", name: "Portal Login Page", domain: "example.com/login", steps: [{name: "Check login form", url: "/", matchType: "plain", keyword: "id=\\"username\\"", statusCode: "200"}]} ' +
      '\n\n**After creation:** Use "get\\_resource" or "generate\\_resource\\_link" to view the new check. ' +
      '\n\n**Related tools:** "list\\_website\\_checkpoints" (find checkpoint location IDs for testLocation.smgIds), "list\\_collectors" (find preferredCollectorId for internal checks), "create\\_website" (legacy Website/checkpoint monitor, different object model).',
    annotations: {
      title: 'Create LM Uptime check',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        displayName: {
          type: 'string',
          description: 'Friendly name shown in LM',
        },
        name: {
          type: 'string',
          description: 'Internal/unique name for the resource',
        },
        domain: {
          type: 'string',
          description: 'Base domain or URL of the service to check',
        },
        schema: {
          type: 'string',
          description: '"http" or "https" (default: "https")',
        },
        testLocation: {
          type: 'object',
          description: 'Where checks run from: {all: true}, {smgIds: [...]}, or {collectorIds: [...]}',
          properties: {
            all: { type: 'boolean' },
            smgIds: { type: 'array', items: { type: 'number' } },
            collectorIds: { type: 'array', items: { type: 'number' } },
          },
        },
        pollingInterval: {
          type: 'number',
          description: 'Minutes between checks, 1-10 (default: 5)',
        },
        hostGroupIds: {
          type: 'string',
          description: 'Comma-separated resource/website folder IDs',
        },
        description: {
          type: 'string',
          description: 'Notes about what this check verifies',
        },
        preferredCollectorId: {
          type: 'number',
          description: 'Only for internal checks (isInternal: true) — do not set this for external checkpoint-based checks',
        },
        isInternal: {
          type: 'boolean',
          description: 'false (default) for an external check from LM\'s global checkpoints; true for a private check from your own collector(s)',
        },
        useDefaultAlertSetting: {
          type: 'boolean',
          description: 'true (default) to inherit alert thresholds and SSL alert behavior from LM\'s default alert settings; false to use per-check overrides instead',
        },
        steps: {
          type: 'array',
          description: 'HTTP steps to run, in order. At least one is required.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Step label' },
              description: { type: 'string' },
              url: { type: 'string', description: 'Path or full URL for this step' },
              HTTPMethod: { type: 'string', description: '"GET" | "HEAD" | "POST" (default: "GET")' },
              HTTPHeaders: { type: 'string' },
              HTTPBody: { type: 'string' },
              matchType: { type: 'string', description: '"plain" (substring match) or "regex" (default: "plain")' },
              keyword: { type: 'string', description: 'Text or regex that must appear in the response body' },
              invertMatch: { type: 'boolean', description: 'Fail when the keyword IS found (default: false)' },
              statusCode: { type: 'string', description: 'Expected HTTP status code, e.g. "200"' },
              timeout: { type: 'number', description: 'Request timeout in seconds' },
              followRedirection: { type: 'boolean', description: 'Whether to follow redirects (default: true)' },
              requireAuth: { type: 'boolean' },
              enable: { type: 'boolean', description: 'Whether this step is active (default: true)' },
            },
            required: ['url'],
          },
        },
      },
      additionalProperties: false,
      required: ['displayName', 'name', 'domain'],
    },
  },
  {
    name: 'delete_website',
    description: 'Delete a website monitor from LogicMonitor (LM) monitoring. ' +
      '\n\n**⚠️ WARNING: PERMANENT DELETION** ' +
      '\n- Website monitor and all historical data permanently removed' +
      '\n- Response time history lost (cannot be recovered)' +
      '\n- Active alerts for this monitor cleared' +
      '\n- Cannot be undone' +
      '\n\n**What this does:** Permanently removes website/synthetic monitor from LogicMonitor. All monitoring stops immediately and historical performance data is deleted. ' +
      '\n\n**When to use:** ' +
      '\n- Service/website decommissioned' +
      '\n- URL permanently moved to different monitor' +
      '\n- Duplicate monitors cleanup' +
      '\n- Replacing with different monitoring approach' +
      '\n\n**Required parameters:** ' +
      '\n- websiteId: Website monitor ID to delete (from "list\\_websites")' +
      '\n\n**Before deleting - check:** ' +
      '\n- Use "get\\_website" to verify correct monitor' +
      '\n- Check if others depend on this monitor (dashboards, reports)' +
      '\n- Consider exporting historical data if needed' +
      '\n- Verify no active incidents related to this monitor' +
      '\n\n**Impact of deletion:** ' +
      '\n- Monitoring stops immediately (no more checks)' +
      '\n- Historical response time data deleted' +
      '\n- Dashboards showing this website will display "no data"' +
      '\n- Reports including this monitor need updating' +
      '\n- Alert rules filtering on this monitor may break' +
      '\n\n**Alternatives to deletion:** ' +
      '\n- **Pause instead:** Use "update\\_website" with stopMonitoring:true (preserves history)' +
      '\n- **Rename:** Mark as "DISABLED - [name]" instead of deleting' +
      '\n- **Move to archive folder:** Keep monitor but organize differently' +
      '\n- **Reduce check frequency:** Update to check less often instead of deleting' +
      '\n\n**Best practice:** Use "update\\_website" to pause monitoring (stopMonitoring:true) instead of deleting if you might need to resume monitoring later. ' +
      '\n\n**Workflow:** Use "get\\_website" to verify, export historical data if needed, then delete. ' +
      '\n\n**Related tools:** "get\\_website" (verify before delete), "list\\_websites" (find website), "update\\_website" (pause instead of delete).',
    annotations: {
      title: 'Delete website monitor',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        websiteId: {
          type: 'number',
          description: 'The ID of the website to delete',
        },
      },
      additionalProperties: false,
      required: ['websiteId'],
    },
  },

  // Website Group Tools
  {
    name: 'list_website_groups',
    description: 'List all website groups (folders) in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Array of website groups with: id, name, parentId, full path, description, number of websites, number of subgroups. ' +
      '\n\n**What are website groups:** Organizational folders for website monitors (synthetic checks), similar to resource/device groups. Used to categorize monitored URLs/services by application, environment, or customer. ' +
      '\n\n**When to use:** ' +
      '\n- Browse website organization before creating monitors' +
      '\n- Find group IDs for website operations' +
      '\n- Understand monitoring hierarchy' +
      '\n- Navigate to specific website folders' +
      '\n\n**Common organization patterns:** ' +
      '\n- By application: "E-Commerce Site", "API Endpoints", "Marketing Pages"' +
      '\n- By environment: "Production URLs", "Staging URLs", "DR Sites"' +
      '\n- By location: "US Sites", "EU Sites", "APAC Sites"' +
      '\n- By customer: "Customer A Sites", "Customer B Sites" (MSP)' +
      '\n- By type: "Public Websites", "Internal Apps", "Third-Party APIs"' +
      '\n\n**Use cases:** ' +
      '\n- Organize monitors by application or service' +
      '\n- Group customer-facing vs internal endpoints' +
      '\n- Separate production vs non-production monitoring' +
      '\n- Structure multi-region website monitoring' +
      '\n\n**Workflow:** Use this tool to browse hierarchy, then "list\\_websites" filtered by groupId to see monitors in specific folder. ' +
      '\n\n**Important:** LogicMonitor may return a negative "total" value due to a known upstream API limitation - this does not mean the request failed. Never use "total" to count or check for results; check the length of the "items" array instead, and use pagination (size/offset) or autoPaginate: true to retrieve all items across pages. ' +
      '\n\n**Related tools:** "get\\_website\\_group" (details), "list\\_websites" (websites in group), "create\\_website\\_group" (create folder).',
    annotations: {
      title: 'List website groups',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        ...paginationSchema,
        ...filterSchema,
        ...fieldsSchema,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_website_group',
    description: 'Get detailed information about a specific website group by its ID in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Complete website group details: name, full path, parentId, description, number of websites (direct and total), number of subgroups, alert status. ' +
      '\n\n**When to use:** ' +
      '\n- Get group path for documentation' +
      '\n- Check website membership counts' +
      '\n- Verify group hierarchy' +
      '\n- Review group structure before creating monitors' +
      '\n\n**Workflow:** Use "list\\_website\\_groups" to find groupId, then use this tool for complete details. ' +
      '\n\n**Related tools:** "list\\_website\\_groups" (find groups), "list\\_websites" (websites in group), "create\\_website\\_group" (create new).',
    annotations: {
      title: 'Get website group details',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        groupId: {
          type: 'number',
          description: 'The ID of the website group to retrieve',
        },
        ...fieldsSchema,
      },
      additionalProperties: false,
      required: ['groupId'],
    },
  },

  // User Management Tools
  {
    name: 'list_users',
    description: 'List all users in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Array of users with: id, username, email, roles, status (active/suspended), last login time, created date, API token count. ' +
      '\n\n**When to use:** ' +
      '\n- Audit user access' +
      '\n- Find user IDs for API token management' +
      '\n- Check who has admin access' +
      '\n- Identify inactive users' +
      '\n- Compliance reporting' +
      '\n\n**Common filter patterns:** ' +
      '\n- Active users: filter:"status:active"' +
      '\n- By email: filter:"email\\~\\*@company.com"' +
      '\n- By role: filter:"roles:\\*administrator\\*"' +
      '\n- Recent logins: filter:"lastLoginOn>{epoch}"' +
      '\n- Never logged in: filter:"lastLoginOn:0"' +
      '\n\n**Important:** LogicMonitor may return a negative "total" value due to a known upstream API limitation - this does not mean the request failed. Never use "total" to count or check for results; check the length of the "items" array instead, and use pagination (size/offset) or autoPaginate: true to retrieve all items across pages. ' +
      '\n\n**Related tools:** "get\\_user" (details), "list\\_roles" (available roles), "list\\_api\\_tokens" (user\'s API tokens).',
    annotations: {
      title: 'List users',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        ...paginationSchema,
        ...filterSchema,
        ...fieldsSchema,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_user',
    description: 'Get detailed information about a specific user by their ID in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Complete user details: username, email, firstName, lastName, roles (permissions), status (active/suspended), last login time, created date, phone, timezone, API token count, two-factor auth status. ' +
      '\n\n**When to use:** ' +
      '\n- Review user permissions and roles' +
      '\n- Check last login time (identify inactive users)' +
      '\n- Verify contact information' +
      '\n- Audit user access before modification' +
      '\n- Get user details for API token management' +
      '\n\n**Key information:** ' +
      '\n- roles: Array of role names (defines permissions)' +
      '\n- status: "active" (can login) vs "suspended" (access revoked)' +
      '\n- lastLoginOn: Epoch timestamp (identify inactive accounts)' +
      '\n- apiTokens: Number of active API tokens' +
      '\n- twoFAEnabled: Whether 2FA is configured' +
      '\n\n**Security audit use cases:** ' +
      '\n- Find users who haven\'t logged in for 90+ days' +
      '\n- Review which users have admin roles' +
      '\n- Check if former employees still have access' +
      '\n- Verify API token usage per user' +
      '\n\n**Workflow:** Use "list\\_users" to find userId, then use this tool for complete user profile. ' +
      '\n\n**Related tools:** "list\\_users" (find user), "list\\_roles" (see available roles), "list\\_api\\_tokens" (view user\'s tokens), "update\\_user" (modify).',
    annotations: {
      title: 'Get user details',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        userId: {
          type: 'number',
          description: 'The ID of the user to retrieve',
        },
        ...fieldsSchema,
      },
      additionalProperties: false,
      required: ['userId'],
    },
  },

  // Role Tools
  {
    name: 'list_roles',
    description: 'List all roles (permission sets) in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Array of roles with: id, name, description, custom flag, associated users count, permissions (view/manage/delete for resources/alerts/reports/settings). ' +
      '\n\n**What are roles:** Permission templates assigned to users. Control who can view/modify/delete resources, alerts, dashboards, settings. Essential for RBAC (role-based access control). ' +
      '\n\n**When to use:** ' +
      '\n- Discover available roles before creating users' +
      '\n- Audit permission structure' +
      '\n- Find role IDs for user assignment' +
      '\n- Compare custom vs built-in roles' +
      '\n- Compliance documentation' +
      '\n\n**Built-in roles (examples):** ' +
      '\n- administrator: Full access to everything' +
      '\n- readonly: View-only access to monitoring data' +
      '\n- manager: Manage resources/devices/alerts but not settings' +
      '\n\n**Custom roles:** Organizations create custom roles for specific needs (e.g., "database-team-role", "view-prod-only"). ' +
      '\n\n**Common use cases:** ' +
      '\n- "What roles exist?" → List all to see options' +
      '\n- "Who can delete resources/devices?" → Check which roles have delete permissions' +
      '\n- "Create read-only user" → Find "readonly" role ID for user creation' +
      '\n\n**Workflow:** Use this tool to discover roles, then "get\\_role" for detailed permissions, then use in "create\\_user" or "update\\_user". ' +
      '\n\n**Important:** LogicMonitor may return a negative "total" value due to a known upstream API limitation - this does not mean the request failed. Never use "total" to count or check for results; check the length of the "items" array instead, and use pagination (size/offset) or autoPaginate: true to retrieve all items across pages. ' +
      '\n\n**Related tools:** "get\\_role" (detailed permissions), "list\\_users" (see user assignments), "create\\_user" (assign roles to new users).',
    annotations: {
      title: 'List roles',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        ...paginationSchema,
        ...filterSchema,
        ...fieldsSchema,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_role',
    description: 'Get detailed information about a specific role by its ID in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Complete role details: name, description, custom flag, detailed permission matrix (view/manage/delete/acknowledge for each area: resources/devices, alerts, dashboards, reports, settings, users). ' +
      '\n\n**When to use:** ' +
      '\n- Review exact permissions before assigning role' +
      '\n- Compare roles to choose correct one' +
      '\n- Document security policies' +
      '\n- Audit what a role can/cannot do' +
      '\n- Before creating custom role (use as template)' +
      '\n\n**Permission granularity returned:** ' +
      '\n- Resources: Can view/add/modify/delete resource/device' +
      '\n- Alerts: Can view/acknowledge/manage alert rules' +
      '\n- Dashboards: Can view/create/edit/delete dashboards' +
      '\n- Reports: Can view/create/schedule reports' +
      '\n- Settings: Can modify datasources/collectors/integrations' +
      '\n- Users: Can manage other users/roles' +
      '\n\n**Use cases:** ' +
      '\n- Security audit: "Can this role delete production resources/devices?"' +
      '\n- Least privilege: Choose role with minimal required permissions' +
      '\n- Documentation: Export role permissions for compliance' +
      '\n- Role comparison: Compare multiple roles to find right fit' +
      '\n\n**Workflow:** Use "list\\_roles" to find roleId, then use this tool to review detailed permissions before assigning to users. ' +
      '\n\n**Related tools:** "list\\_roles" (find roles), "list\\_users" (see who has this role), "create\\_role" (create custom role).',
    annotations: {
      title: 'Get role details',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        roleId: {
          type: 'number',
          description: 'The ID of the role to retrieve',
        },
        ...fieldsSchema,
      },
      additionalProperties: false,
      required: ['roleId'],
    },
  },

  // API Token Tools
  {
    name: 'list_api_tokens',
    description: 'List API tokens for a specific user in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Array of API tokens for specified user with: id, note (description), created date, last used date, status (active/inactive), access ID, roles inherited from user. ' +
      '\n\n**What are API tokens:** Authentication credentials for LogicMonitor REST API. Alternative to username/password for programmatic access. Each token inherits permissions from its user. ' +
      '\n\n**When to use:** ' +
      '\n- Audit API access per user' +
      '\n- Find unused/stale tokens for security cleanup' +
      '\n- Check last usage time' +
      '\n- Inventory API integrations' +
      '\n- Before creating new token (check if existing one available)' +
      '\n\n**Security considerations:** ' +
      '\n- Each token has Access ID and Access Key (like username/password for API)' +
      '\n- Token inherits all permissions from user (if user is admin, token has admin rights)' +
      '\n- Tokens never expire automatically (must be manually revoked)' +
      '\n- Last used date helps identify unused tokens that should be removed' +
      '\n\n**Common use cases:** ' +
      '\n- **Security audit:** "Find all API tokens, check last usage, remove stale ones"' +
      '\n- **Integration tracking:** "Which integrations are using this user\'s tokens?"' +
      '\n- **Access review:** "What API access does this user have?"' +
      '\n- **Token rotation:** "List all tokens before rotating credentials"' +
      '\n\n**Best practices:** ' +
      '\n- Create service accounts (dedicated users) for API integrations instead of personal user tokens' +
      '\n- Add descriptive notes to tokens (e.g., "Terraform automation", "Grafana integration")' +
      '\n- Regularly audit and remove unused tokens (check lastUsedOn timestamp)' +
      '\n- Use least-privilege: Create users with minimal required permissions, then create tokens for those users' +
      '\n\n**Security workflow:** ' +
      '\n- List all users with "list\\_users"' +
      '\n- For each user, use this tool to check their API tokens' +
      '\n- Review lastUsedOn - if >90 days, consider revoking' +
      '\n- Check note field to understand token purpose' +
      '\n\n**Workflow:** Use this tool with userId from "list\\_users" to audit that user\'s API access. ' +
      '\n\n**Important:** LogicMonitor may return a negative "total" value due to a known upstream API limitation - this does not mean the request failed. Never use "total" to count or check for results; check the length of the "items" array instead, and use pagination (size/offset) or autoPaginate: true to retrieve all items across pages. ' +
      '\n\n**Related tools:** "list\\_users" (find userId), "create\\_api\\_token" (generate new), "delete\\_api\\_token" (revoke access).',
    annotations: {
      title: 'Get API tokens',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        userId: {
          type: 'number',
          description: 'The user ID',
        },
        ...paginationSchema,
        ...filterSchema,
        ...fieldsSchema,
      },
      additionalProperties: false,
      required: ['userId'],
    },
  },

  // SDT (Scheduled Down Time) Tools
  {
    name: 'list_sdts',
    description: 'List all Scheduled Down Times (SDTs) in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Array of SDTs with: id, type (DeviceSDT/DeviceGroupSDT/etc), device/group name, start/end times, duration, comment, creator, status (active/scheduled/expired). ' +
      '\n\n**What are SDTs:** Maintenance windows that suppress alerting to prevent false alarms during planned work. No alerts are generated during SDT periods. ' +
      '\n\n**When to use:** ' +
      '\n- View active maintenance windows' +
      '\n- Check upcoming scheduled maintenance' +
      '\n- Verify SDT was created correctly' +
      '\n- Find SDTs to extend or cancel' +
      '\n- Audit who scheduled downtime' +
      '\n\n**Common filter patterns:** ' +
      '\n- Active now: filter:"isEffective:true"' +
      '\n- Future SDTs: filter:"startDateTime>{epoch}"' +
      '\n- By device: filter:"deviceDisplayName\\~\\*prod-web\\*"' +
      '\n- One-time vs recurring: filter:"type:oneTime" or filter:"type:monthly"' +
      '\n- By creator: filter:"admin:john.doe"' +
      '\n\n**SDT types explained:** ' +
      '\n- DeviceSDT: All monitoring on specific resource/device' +
      '\n- DeviceGroupSDT: All resource/device in group' +
      '\n- DeviceDataSourceSDT: Specific datasource on resource/device' +
      '\n- DeviceDataSourceInstanceSDT: Specific instance only (e.g., C: drive)' +
      '\n\n**Best practice:** Always add meaningful comment explaining maintenance reason for audit trail. ' +
      '\n\n**Important:** LogicMonitor may return a negative "total" value due to a known upstream API limitation - this does not mean the request failed. Never use "total" to count or check for results; check the length of the "items" array instead, and use pagination (size/offset) or autoPaginate: true to retrieve all items across pages. ' +
      '\n\n**Related tools:** "create\\_resource\\_sdt" (schedule maintenance), "delete\\_sdt" (cancel maintenance), "get\\_sdt" (details).',
    annotations: {
      title: 'Get Scheduled Down Times',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        ...paginationSchema,
        ...filterSchema,
        ...fieldsSchema,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_sdt',
    description: 'Get detailed information about a specific Scheduled Down Time (SDT) by its ID in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Complete SDT details: type, device/group affected, start/end times, duration, comment, who created it, status (active/scheduled/expired), recurrence settings. ' +
      '\n\n**When to use:** ' +
      '\n- Verify SDT was created correctly' +
      '\n- Check when maintenance window ends' +
      '\n- See who scheduled downtime' +
      '\n- Get SDT details before extending/canceling' +
      '\n- Audit maintenance history' +
      '\n\n**Status meanings:** ' +
      '\n- scheduled: Future maintenance window (not started yet)' +
      '\n- active: Currently in maintenance window (alerts suppressed now)' +
      '\n- expired: Maintenance window completed (historical record)' +
      '\n\n**Workflow:** Use "list\\_sdts" to find SDT ID, then use this tool for complete details before deciding to extend or delete. ' +
      '\n\n**Related tools:** "list\\_sdts" (find SDTs), "create\\_resource\\_sdt" (create new), "delete\\_sdt" (cancel).',
    annotations: {
      title: 'Get Scheduled Down Time details',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        sdtId: {
          type: 'string',
          description: 'The ID of the Scheduled Down Time (SDT) to retrieve',
        },
        ...fieldsSchema,
      },
      additionalProperties: false,
      required: ['sdtId'],
    },
  },
  {
    name: 'create_resource_sdt',
    description: 'Schedule Down Time (SDT) for a resource/device in LogicMonitor (LM) monitoring to suppress alerts during planned maintenance. ' +
      '\n\n**What this does:** Prevents alert notifications during specified time window. No alerts generated = no noise during planned work like patching, upgrades, reboots, migrations. ' +
      '\n\n**When to use:** ' +
      '\n- Before patching servers' +
      '\n- During planned maintenance windows' +
      '\n- Network changes that will cause temporary outages' +
      '\n- Application deployments' +
      '\n- Database maintenance' +
      '\n\n**Required parameters:** ' +
      '\n- deviceId: Device to schedule maintenance for (from "list\\_resources")' +
      '\n- type: "DeviceSDT" (entire device) or "DeviceDataSourceSDT" (specific datasource)' +
      '\n- startDateTime: Start time in epoch MILLISECONDS (e.g., Date.now() + 3600000 for 1 hour from now)' +
      '\n- endDateTime: End time in epoch MILLISECONDS' +
      '\n- comment: Reason for maintenance (REQUIRED for audit trail)' +
      '\n\n**Time calculation examples:** ' +
      '\n- 1 hour from now: startDateTime: Date.now() + 3600000' +
      '\n- 4 hours maintenance: endDateTime: startDateTime + (4 * 3600000)' +
      '\n\n**SDT types:** ' +
      '\n- "DeviceSDT" - Suppresses ALL alerts on resource/device (most common)' +
      '\n- "DeviceDataSourceSDT" - Suppresses alerts from specific datasource only' +
      '\n\n**Best practices:** ' +
      '\n- Add detailed comment (e.g., "Patching Windows updates - Change ticket CHG12345")' +
      '\n- Use appropriate time buffer (start 15 min early, end 15 min late)' +
      '\n- Verify SDT with "list\\_sdts" after creation' +
      '\n\n**Related tools:** "list\\_sdts" (verify created), "delete\\_sdt" (cancel if needed).',
    annotations: {
      title: 'Schedule maintenance window',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        deviceId: {
          type: 'number',
          description: 'The resource/device ID',
        },
        type: {
          type: 'string',
          description: 'SDT type: "DeviceSDT", "DeviceGroupSDT", "DeviceDataSourceSDT", etc.',
        },
        startDateTime: {
          type: 'number',
          description: 'Start time (epoch milliseconds)',
        },
        endDateTime: {
          type: 'number',
          description: 'End time (epoch milliseconds)',
        },
        comment: {
          type: 'string',
          description: 'Comment explaining the Scheduled Down Time (SDT)',
        },
      },
      additionalProperties: false,
      required: ['deviceId', 'type', 'startDateTime', 'endDateTime'],
    },
  },
  {
    name: 'delete_sdt',
    description: 'Delete (cancel) a Scheduled Down Time (SDT) in LogicMonitor (LM) monitoring. ' +
      '\n\n**What this does:** ' +
      '\n- Cancels active or scheduled maintenance window' +
      '\n- Alerting resumes immediately if SDT was active' +
      '\n- Removes SDT from schedule if it was future/scheduled' +
      '\n- Cannot undo - creates audit log entry' +
      '\n\n**When to use:** ' +
      '\n- Maintenance completed early' +
      '\n- Maintenance canceled/postponed' +
      '\n- SDT created by mistake' +
      '\n- Need to restore alerting immediately' +
      '\n\n**Common scenarios:** ' +
      '\n- "Patching completed faster than expected - restore alerting"' +
      '\n- "Maintenance postponed to next week - cancel this SDT and create new one"' +
      '\n- "Wrong resource/device - need to delete and recreate for correct device"' +
      '\n- "Emergency issue needs alerting - cancel maintenance window"' +
      '\n\n**Important:** ' +
      '\n- If SDT is active, alerts resume IMMEDIATELY after deletion' +
      '\n- Check resource/device status before deleting active SDT to avoid alert flood' +
      '\n- Cannot delete only to extend - must delete and create new with longer duration' +
      '\n\n**Workflow:** ' +
      '\n- Use "list\\_sdts" to find SDT ID (check status: active/scheduled)' +
      '\n- Use "get\\_sdt" to verify correct SDT before deleting' +
      '\n- Delete SDT' +
      '\n- If resource/device still has issues, expect alerts immediately' +
      '\n\n**Best practice:** Add comment in related ticket/documentation explaining why SDT was canceled. ' +
      '\n\n**Related tools:** "list\\_sdts" (find SDT), "get\\_sdt" (verify before delete), "create\\_resource\\_sdt" (create replacement if needed).',
    annotations: {
      title: 'Delete Scheduled Down Time',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        sdtId: {
          type: 'string',
          description: 'The ID of the SDT to delete',
        },
      },
      additionalProperties: false,
      required: ['sdtId'],
    },
  },

  // ConfigSource Tools
  {
    name: 'list_configsources',
    description: 'List all ConfigSources in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Array of ConfigSources with: id, name, displayName, description, appliesTo logic, collection method. ' +
      '\n\n**What are ConfigSources:** Track configuration file changes for compliance and change management. Similar to datasources, but for configs instead of metrics. Alert when configs change unexpectedly. ' +
      '\n\n**When to use:** ' +
      '\n- Find ConfigSource for specific resource/device type (e.g., Cisco\\_IOS\\_Config)' +
      '\n- Discover what configs are being tracked' +
      '\n- Get ConfigSource IDs for API operations' +
      '\n- Audit configuration monitoring coverage' +
      '\n\n**What configs can be tracked:** ' +
      '\n- Network resources/devices: Router configs, switch configs, firewall rules' +
      '\n- Linux: /etc files, app configs, SSH authorized_keys' +
      '\n- Windows: Registry keys, security policies' +
      '\n- Cloud: Security groups, IAM policies' +
      '\n\n**Use cases:** ' +
      '\n- Compliance: "Alert when firewall rules change"' +
      '\n- Change management: "Who modified this router config?"' +
      '\n- Rollback: Compare current config to previous version' +
      '\n- Audit: "Show all config changes in last 30 days"' +
      '\n\n**Common ConfigSources:** ' +
      '\n- Cisco\\_IOS\_Config: Cisco router/switch configs' +
      '\n- F5\\_LTM\\_Config: F5 load balancer configs' +
      '\n- Palo\\_Alto\\_Config: Palo Alto firewall rules' +
      '\n- Linux\\_Config\\_Files: Monitor /etc files' +
      '\n\n**Important:** LogicMonitor may return a negative "total" value due to a known upstream API limitation - this does not mean the request failed. Never use "total" to count or check for results; check the length of the "items" array instead, and use pagination (size/offset) or autoPaginate: true to retrieve all items across pages. ' +
      '\n\n**Related tools:** "get\\_configsource" (details), "list\\_device\\_configs" (see configs for device).',
    annotations: {
      title: 'List ConfigSources',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        ...paginationSchema,
        ...filterSchema,
        ...fieldsSchema,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_configsource',
    description: 'Get detailed information about a specific ConfigSource by its ID in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Complete ConfigSource details: name, displayName, description, appliesTo logic (which resources/devices), collection method (CLI/SNMP/API), collection script, alert settings. ' +
      '\n\n**When to use:** ' +
      '\n- Understand what config is being collected' +
      '\n- Review appliesTo logic (why it does/doesn\'t apply to device)' +
      '\n- Check collection method' +
      '\n- Troubleshoot config collection issues' +
      '\n\n**Key information:** ' +
      '\n- appliesTo: Logic determining which resource/device get config tracking' +
      '\n- collectMethod: How config is retrieved (CLI commands, SNMP, API)' +
      '\n- configAlerts: Settings for when to alert on changes' +
      '\n- lineageId: Built-in (LogicMonitor) vs custom ConfigSource' +
      '\n\n**Workflow:** Use "list\\_configsources" to find configSourceId, then use this tool to understand how it works. ' +
      '\n\n**Related tools:** "list\\_configsources" (find ConfigSource), "list\\_device\\_configs" (see configs for device).',
    annotations: {
      title: 'Get ConfigSource details',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        configSourceId: {
          type: 'number',
          description: 'The ID of the configuration source to retrieve',
        },
        ...fieldsSchema,
      },
      additionalProperties: false,
      required: ['configSourceId'],
    },
  },

  // PropertySource Tools
  {
    name: 'list_propertysources',
    description: 'List all PropertySources in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Array of PropertySources with: id, name, description, appliesTo logic, scriptType (embed/powershell/external), group. ' +
      '\n\n**What are PropertySources:** Scripts (Groovy or PowerShell) that run against matching resources/devices to auto-populate custom properties. Unlike DataSources (metrics) or ConfigSources (config files), PropertySources set property key/value pairs on a device - often used to auto-discover credentials, roles, or metadata that other modules then key off of. ' +
      '\n\n**When to use:** ' +
      '\n- Find the PropertySource responsible for setting a specific auto.* or custom property' +
      '\n- Discover which script (Groovy vs PowerShell) determines a property value' +
      '\n- Get PropertySource IDs for API operations' +
      '\n- Audit property-discovery coverage and appliesTo logic' +
      '\n\n**Common PropertySource patterns:** ' +
      '\n- Auth-detection scripts: check if the target is the collector itself (run script locally, no credentials), else check for wmi.user/wmi.pass (or ssh.user/ssh.pass, etc.) properties (use explicit credentials), else fall back to integrated/current-context authentication' +
      '\n- Auto-discovery of OS version, role, hardware serial number, or licensing info used later by "appliesTo" logic on DataSources/EventSources' +
      '\n\n**Important:** LogicMonitor may return a negative "total" value due to a known upstream API limitation - this does not mean the request failed. Never use "total" to count or check for results; check the length of the "items" array instead, and use pagination (size/offset) or autoPaginate: true to retrieve all items across pages. ' +
      '\n\n**Related tools:** "get\\_propertysource" (full script/details), "list\\_datasources" (metric collection), "list\\_configsources" (config tracking).',
    annotations: {
      title: 'List PropertySources',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        ...paginationSchema,
        ...filterSchema,
        ...fieldsSchema,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_propertysource',
    description: 'Get detailed information about a specific PropertySource by its ID in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Complete PropertySource details: name, description, appliesTo logic (which resources/devices), scriptType (embed/powershell/external), groovyScript/windowsScript (the actual collection script body or external script name), windowsCmdline/linuxCmdline (script arguments). ' +
      '\n\n**When to use:** ' +
      '\n- Read the actual script body to understand how a property is computed' +
      '\n- Review appliesTo logic (why it does/doesn\'t apply to a device)' +
      '\n- Check scriptType to see if it is PowerShell, Groovy (embed), or an external script' +
      '\n- Trace authentication logic (e.g. collector-local vs wmi.user/wmi.pass vs integrated auth) embedded in the script' +
      '\n\n**Key information:** ' +
      '\n- appliesTo: Logic determining which resource/device this PropertySource runs against' +
      '\n- scriptType: "embed" (Groovy, in groovyScript), "powershell" (in windowsScript), or "external" (references a script file, args in windowsCmdline/linuxCmdline)' +
      '\n- lineageId: Built-in (LogicMonitor) vs custom PropertySource' +
      '\n\n**Workflow:** Use "list\\_propertysources" to find propertySourceId, then use this tool to read the script and understand its logic. ' +
      '\n\n**Related tools:** "list\\_propertysources" (find PropertySource), "execute\\_powershell\\_script"/"execute\\_groovy\\_script" (test the script logic against a collector/device).',
    annotations: {
      title: 'Get PropertySource details',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        propertySourceId: {
          type: 'number',
          description: 'The ID of the property source to retrieve',
        },
        ...fieldsSchema,
      },
      additionalProperties: false,
      required: ['propertySourceId'],
    },
  },

  // Device Property Tools
  {
    name: 'list_resource_properties',
    description: 'List all custom properties (system and user-defined) for a specific resource/device in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Array of properties with: name, value, source (device-level vs inherited from group), type (system vs custom). ' +
      '\n\n**When to use:** ' +
      '\n- Review resource/device configuration' +
      '\n- Check credentials/authentication settings' +
      '\n- See inherited vs device-specific properties' +
      '\n- Troubleshoot datasource applies logic' +
      '\n- Audit resource/device metadata' +
      '\n\n**Property types:** ' +
      '\n\n**System properties (auto-populated by LogicMonitor):** ' +
      '\n- system.hostname: Device hostname' +
      '\n- system.devicetype: Device category (server, network, cloud)' +
      '\n- system.ips: IP addresses' +
      '\n- system.categories: Auto-detected technologies (e.g., "AWS/EC2")' +
      '\n\n**Custom properties (user-defined):** ' +
      '\n- Credentials: ssh.user, snmp.community, wmi.user' +
      '\n- Tags: env (prod/staging), owner (team name), location' +
      '\n- Integration IDs: servicenow.ci_id, jira.project' +
      '\n- Business metadata: cost.center, sla.tier, backup.policy' +
      '\n\n**Property inheritance:** ' +
      'Properties can be set at: Device level (highest priority) → Group level → Parent group (inherited). ' +
      '\n\n**Datasource appliesTo logic uses properties:** ' +
      'Many datasources check properties to decide if they should monitor device. Example: AWS\\_EC2 datasource checks if resource/device has "aws.resourcetype=ec2" property. ' +
      '\n\n**Workflow:** Use "list\\_resources" to find deviceId, then use this tool to see all properties including inherited ones. ' +
      '\n\n**Important:** LogicMonitor may return a negative "total" value due to a known upstream API limitation - this does not mean the request failed. Never use "total" to count or check for results; check the length of the "items" array instead, and use pagination (size/offset) or autoPaginate: true to retrieve all items across pages. ' +
      '\n\n**Related tools:** "update\\_device\\_property" (modify), "get\\_resource" (see summary), "list\\_datasources" (see how properties affect monitoring).',
    annotations: {
      title: 'List resource/device properties',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        deviceId: {
          type: 'number',
          description: 'The resource/device ID',
        },
        ...paginationSchema,
        ...filterSchema,
        ...fieldsSchema,
      },
      additionalProperties: false,
      required: ['deviceId'],
    },
  },
  {
    name: 'update_resource_property',
    description: 'Update or create a custom property for a specific resource/device in LogicMonitor (LM) monitoring. ' +
      '\n\n**What this does:** Set/update a single resource/device-level custom property. Simpler alternative to "update\\_resource" when only changing one property. ' +
      '\n\n**When to use:** ' +
      '\n- Update single property value' +
      '\n- Add new property to device' +
      '\n- Override inherited property value' +
      '\n- Update credentials for one resource/device' +
      '\n- Change resource/device tags/metadata' +
      '\n\n**Required parameters:** ' +
      '\n- deviceId: Device ID (from "list\\_resources")' +
      '\n- name: Property name (e.g., "ssh.user", "env", "owner")' +
      '\n- value: Property value' +
      '\n\n**Property types and examples:** ' +
      '\n\n**Credentials (override group defaults):** ' +
      '\n- SSH: name="ssh.user", value="admin"' +
      '\n- SNMP: name="snmp.community", value="public"' +
      '\n- WMI: name="wmi.user", value="DOMAIN\\\\monitoring"' +
      '\n- Database: name="jdbc.user", value="dbmonitor"' +
      '\n\n**Tags and metadata:** ' +
      '\n- Environment: name="env", value="production"' +
      '\n- Owner: name="owner", value="platform-team"' +
      '\n- Cost center: name="cost.center", value="engineering"' +
      '\n- Application: name="app", value="web-frontend"' +
      '\n\n**Integration IDs:** ' +
      '\n- ServiceNow: name="servicenow.ci_id", value="ci12345"' +
      '\n- JIRA: name="jira.project", value="INFRA"' +
      '\n- CMDB: name="cmdb.id", value="server-001"' +
      '\n\n**Datasource-specific settings:** ' +
      '\n- Custom threshold: name="threshold.cpu", value="90"' +
      '\n- Collection interval: name="poll.interval", value="5"' +
      '\n- Monitoring scope: name="monitor.ports", value="80,443"' +
      '\n\n**Device-level vs Group-level:** ' +
      '\n- **Device property** (this tool): Applies only to this resource/device, overrides group property' +
      '\n- **Group property** (update_resource_group): Inherited by all resource/device in group' +
      '\n- Device properties take precedence over group properties' +
      '\n\n**Common scenarios:** ' +
      '\n\n**Override SSH credentials for one resource/device:** ' +
      '{deviceId: 123, name: "ssh.user", value: "specialadmin"} ' +
      '\n\n**Tag resource/device as production:** ' +
      '{deviceId: 123, name: "env", value: "production"} ' +
      '\n\n**Link to ServiceNow CI:** ' +
      '{deviceId: 123, name: "servicenow.ci_id", value: "ci-web-01"} ' +
      '\n\n**Set custom alert threshold:** ' +
      '{deviceId: 123, name: "cpu.threshold", value: "85"} ' +
      '\n\n**Workflow:** Use "list\\_device\\_properties" to see current properties, then update or add new ones. ' +
      '\n\n**Related tools:** "list\\_device\\_properties" (view all properties), "update\\_resource" (update multiple properties), "update\\_resource\\_group" (set group-level properties).',
    annotations: {
      title: 'Update resource/device properties',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        deviceId: {
          type: 'number',
          description: 'The resource/device ID',
        },
        propertyName: {
          type: 'string',
          description: 'The name of the property to update',
        },
        value: {
          type: 'string',
          description: 'The new value for the property',
        },
      },
      additionalProperties: false,
      required: ['deviceId', 'propertyName', 'value'],
    },
  },

  // Audit Logs Tools
  {
    name: 'list_audit_logs',
    description: 'List audit logs in LogicMonitor (LM) monitoring for compliance and security auditing. ' +
      '\n\n**Returns:** Array of audit log entries with: id, username, IP address, timestamp (happenedOn in epoch SECONDS), description of action performed, sessionId. ' +
      '\n\n**When to use:** ' +
      '\n- Investigate changes: "Who deleted this resource/device?" → filter:"description~\\*Delete\\*,description~\\*device\\*"' +
      '\n- Track user activity: "What did john.doe do today?" → filter:"username:john.doe,happenedOn>1730851200"' +
      '\n- Monitor API usage: Find actions performed via API tokens' +
      '\n- Compliance audits: Export log history for specific time periods' +
      '\n- Security investigation: Track login attempts, IP addresses, suspicious activities' +
      '\n- Troubleshooting: "Who changed this alert rule?" → filter:"description~\\*AlertRule\\*"' +
      '\n\n**Two search modes:** ' +
      '\n- **Simple search:** Use query parameter with free text (e.g., query:"john.doe", query:"device") - searches across username, description, and IP fields' +
      '\n- **Advanced filtering:** Use filter parameter with LM filter syntax (e.g., filter:"username:admin,happenedOn>1640995200") for precise control' +
      '\n\n**Common filter patterns:** ' +
      '\n- By user: filter:"username:john.doe"' +
      '\n- By time: filter:"happenedOn>1640995200" (IMPORTANT: epoch SECONDS, not milliseconds!)' +
      '\n- By action type: filter:"description~\\*Create\\*" or filter:"description~\\*Delete\\*" or filter:"description~\\*Update\\*"' +
      '\n- By resource: filter:"description~\\*device\\*" or filter:"description~\\*dashboard\\*"' +
      '\n- By IP: filter:"ip:192.168.1.100"' +
      '\n- Combined (AND): filter:"username:admin,happenedOn>1640995200,description~\\*device\\*"' +
      '\n\n**Query vs Filter:** ' +
      '\n- query: Simple text search across username, description, IP (OR logic). Use for quick lookups: query:"john.doe", query:"device"' +
      '\n- filter: Precise LM filter syntax with any field. Use for time ranges, exact matches: filter:"happenedOn>1640995200"' +
      '\n- **query and filter cannot be combined in one call:** since audit logs cannot use OR (||), and "query" expands to an OR across username/description/ip, combining it with an additional "filter" would require OR+AND mixing, which this API rejects. Passing both together throws an error with the exact per-field filter strings to use instead - make one call per field (e.g. username~"*value*",<filter>), then merge/dedupe the results yourself.' +
      '\n\n**Critical notes:** ' +
      '\n- Time uses epoch SECONDS (not milliseconds like other LM APIs)' +
      '\n- Cannot use OR operator (||) in audit logs, only AND (comma)' +
      '\n- Use autoPaginate:true for complete history (may take time for large datasets)' +
      `\n\n**Web UI access:** https://${process.env.LM_COMPANY}.logicmonitor.com/santaba/uiv4/settings/access-logs (Settings → Audit Logs) ` +
      '\n\n**Important:** LogicMonitor may return a negative "total" value due to a known upstream API limitation - this does not mean the request failed. Never use "total" to count or check for results; check the length of the "items" array instead, and use pagination (size/offset) or autoPaginate: true to retrieve all items across pages. ' +
      '\n\n**Related tools:** "get\\_audit\\_log" (details of specific entry).',
    annotations: {
      title: 'List audit logs',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Simple search query. Free text (e.g., "john.doe", "device", "192.168.1.100") automatically searches across username, description, and IP fields. Can also use filter syntax (e.g., "username:admin") which gets formatted automatically.',
        },
        ...paginationSchema,
        ...filterSchema,
        ...fieldsSchema,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_audit_log',
    description: 'Get detailed information about a specific audit log entry in LogicMonitor (LM) monitoring by its ID. ' +
      '\n\n**Returns:** Complete audit log details: username, IP address, exact timestamp, full description of action, session ID, affected resources, before/after values (for updates). ' +
      '\n\n**When to use:** ' +
      '\n- Get complete details after finding log ID via "list\\_audit\\_logs"' +
      '\n- Review exact changes made (old vs new values)' +
      '\n- Investigate specific incident with full context' +
      '\n\n**Workflow:** First use "list\\_audit\\_logs" with filters to find relevant entries, then use this tool with the log ID for complete details. ' +
      '\n\n**Related tools:** "list\\_audit\\_logs" (search logs), "search\\_audit\\_logs" (text search).',
    annotations: {
      title: 'Get audit details',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        auditLogId: {
          type: 'string',
          description: 'The ID of the audit log entry to retrieve',
        },
        ...fieldsSchema,
      },
      additionalProperties: false,
      required: ['auditLogId'],
    },
  },
  {
    name: 'list_integration_logs',
    description: 'List integration delivery logs in LogicMonitor (LM) monitoring - the audit trail of alert notifications sent to third-party integrations (ServiceNow, Slack, PagerDuty, Jira, webhooks, etc.). ' +
      '\n\n**Returns:** Array of delivery log entries with: id, happenedOnMs (delivery timestamp in epoch MILLISECONDS - note this differs from "list\\_audit\\_logs" which uses epoch SECONDS), integrationName, alertId, alertInstanceId, httpResponseCode (the HTTP status the integration endpoint returned). ' +
      '\n\n**What this is:** Every time LM sends/updates/clears an alert through a configured integration (see "list\\_integrations"), it records a delivery attempt here - separate from "list\\_audit\\_logs" (user/API actions) and from the alert itself. This is the same data backing LogicMonitor\'s built-in "LogicMonitor\\_Portal\\_Integration Logs" DataSource. ' +
      '\n\n**When to use:** ' +
      '\n- Troubleshoot "did this alert actually get sent to ServiceNow/Slack/PagerDuty?"' +
      '\n- Find failed deliveries: filter:"httpResponseCode!:200"' +
      '\n- Audit a specific integration\'s traffic: query:"ServiceNow" or filter:"integrationName:ServiceNow"' +
      '\n- Correlate a specific alert\'s notification history: filter:"alertId:SV63577"' +
      '\n- Investigate a delivery-failure incident window: filter:"happenedOnMs>:1730851200000,happenedOnMs<:1730855000000" (epoch MILLISECONDS)' +
      '\n\n**Two search modes:** ' +
      '\n- **Simple search:** Use query parameter with free text (e.g., query:"ServiceNow") - searches the integrationName field' +
      '\n- **Advanced filtering:** Use filter parameter with LM filter syntax (e.g., filter:"httpResponseCode!:200") for precise control' +
      '\n\n**Critical notes:** ' +
      '\n- Time field is happenedOnMs in epoch MILLISECONDS, unlike "list\\_audit\\_logs" which uses happenedOn in epoch SECONDS - do not mix these up' +
      '\n- Use autoPaginate:true for complete history (may take time for large datasets)' +
      '\n\n**Important:** LogicMonitor may return a negative "total" value due to a known upstream API limitation - this does not mean the request failed. Never use "total" to count or check for results; check the length of the "items" array instead, and use pagination (size/offset) or autoPaginate: true to retrieve all items across pages. ' +
      '\n\n**Related tools:** "list\\_integrations" (see configured integrations), "list\\_audit\\_logs" (user/API actions, not alert delivery), "get\\_alert" (the alert that triggered a delivery).',
    annotations: {
      title: 'List integration logs',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Simple search query. Free text (e.g., "ServiceNow", "Slack") automatically searches the integrationName field. Can also use filter syntax (e.g., "integrationName:ServiceNow") which gets formatted automatically.',
        },
        sort: {
          type: 'string',
          description: 'Sort order, e.g. "-happenedOnMs" for newest first (default LogicMonitor Integration Logs DataSource behavior).',
        },
        ...paginationSchema,
        ...filterSchema,
        ...fieldsSchema,
      },
      additionalProperties: false,
    },
  },

  // Access Groups Tools
  {
    name: 'list_access_groups',
    description: 'List all access groups in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Array of access groups with: id, name, description, tenant ID, number of associated resources, number of users. ' +
      '\n\n**What are access groups:** Permission boundaries that control WHICH resources users can see and manage. Used in multi-tenant environments to isolate customer data, or to segment access by team/department. Users assigned to access group can only see resources in that group. ' +
      '\n\n**When to use:** ' +
      '\n- Manage multi-tenant environments (MSPs)' +
      '\n- Segment monitoring by department/team' +
      '\n- Control resource visibility' +
      '\n- Audit access control configuration' +
      '\n- Find access group IDs for user assignment' +
      '\n\n**Access groups vs Roles (important distinction):** ' +
      '\n- **Access Groups:** Control WHAT resources you can see (visibility, data isolation)' +
      '\n- **Roles:** Control WHAT actions you can perform (view/edit/delete permissions)' +
      '\n- Users need BOTH: Role (what they can do) + Access Group (what they can see)' +
      '\n\n**Common use cases:** ' +
      '\n\n**MSP / Multi-tenant:** ' +
      '\n- Access Group "Customer A" - User sees only Customer A resource/device' +
      '\n- Access Group "Customer B" - User sees only Customer B resource/device' +
      '\n- Prevents customers from seeing each other\'s data' +
      '\n\n**Departmental isolation:** ' +
      '\n- Access Group "Network Team" - See only network resource/device' +
      '\n- Access Group "Server Team" - See only servers' +
      '\n- Access Group "Database Team" - See only database servers' +
      '\n\n**Environment separation:** ' +
      '\n- Access Group "Production" - Only prod resource/device' +
      '\n- Access Group "Dev/Test" - Only non-prod resource/device' +
      '\n- Junior staff limited to dev/test access group' +
      '\n\n**Workflow:** Use this tool to find access groups, then assign users to groups via "update\\_user" to control resource visibility. ' +
      '\n\n**Important:** LogicMonitor may return a negative "total" value due to a known upstream API limitation - this does not mean the request failed. Never use "total" to count or check for results; check the length of the "items" array instead, and use pagination (size/offset) or autoPaginate: true to retrieve all items across pages. ' +
      '\n\n**Related tools:** "get\\_access\\_group" (details), "create\\_access\\_group" (create new), "list\\_users" (see user assignments), "list\\_resources" (associate resource/device with groups).',
    annotations: {
      title: 'List access groups',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        ...paginationSchema,
        ...filterSchema,
        ...fieldsSchema,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_access_group',
    description: 'Get detailed information about a specific access group in LogicMonitor (LM) monitoring by its ID. ' +
      '\n\n**Returns:** Complete access group details: name, description, tenant ID, list of associated resources (which resources/devices/groups are in this access group), list of users assigned to this access group. ' +
      '\n\n**When to use:** ' +
      '\n- Review which resources are in this access group' +
      '\n- Check which users have access to this group' +
      '\n- Audit access control before modifications' +
      '\n- Verify tenant isolation configuration' +
      '\n\n**Key information returned:** ' +
      '\n- **Resources:** Which resource/device groups and resources users in this access group can see' +
      '\n- **Users:** Which users are assigned to this access group' +
      '\n- **Tenant ID:** Multi-tenant identifier (MSP environments)' +
      '\n\n**Impact analysis:** ' +
      'Before modifying access group: ' +
      '\n- Removing resource: Users lose visibility to those resource/device' +
      '\n- Removing user: User loses visibility to all resources in group' +
      '\n- Deleting group: All users lose their access scope' +
      '\n\n**Workflow:** Use "list\\_access\\_groups" to find accessGroupId, then use this tool to review complete configuration before modifications. ' +
      '\n\n**Related tools:** "list\\_access\\_groups" (find groups), "update\\_access\\_group" (modify), "list\\_users" (see user access).',
    annotations: {
      title: 'Get access group details',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        accessGroupId: {
          type: 'number',
          description: 'The ID of the access group to retrieve',
        },
        ...fieldsSchema,
      },
      additionalProperties: false,
      required: ['accessGroupId'],
    },
  },
  {
    name: 'create_access_group',
    description: 'Create a new access group in LogicMonitor (LM) monitoring. ' +
      '\n\n**What this does:** Creates permission boundary controlling which resources/devices users can see and manage. Essential for multi-tenant environments (MSPs) or departmental isolation. ' +
      '\n\n**When to use:** ' +
      '\n- Set up multi-tenant monitoring (MSP with multiple customers)' +
      '\n- Segment access by department/team' +
      '\n- Create read-only views for specific resource/device groups' +
      '\n- Isolate production from dev/test access' +
      '\n- Control customer/client data visibility' +
      '\n\n**Required parameters:** ' +
      '\n- name: Access group name (e.g., "Customer A", "Network Team", "Production Access")' +
      '\n- description: Purpose/scope (e.g., "Access to Customer A resource/device only")' +
      '\n\n**Optional parameters:** ' +
      '\n- tenantId: Multi-tenant identifier (for MSP environments)' +
      '\n- resourceGroups: Array of resource/device group IDs users can access' +
      '\n- websites: Array of website monitor IDs' +
      '\n- dashboards: Array of dashboard IDs' +
      '\n\n**Access Groups = Data Isolation:** ' +
      'Users assigned to access group can ONLY see resources in that group. Perfect for: ' +
      '\n- MSPs managing multiple customers' +
      '\n- Enterprises with separate business units' +
      '\n- Teams managing different environments (prod/staging/dev)' +
      '\n- Contractors needing limited access' +
      '\n\n**Multi-tenant setup (MSP example):** ' +
      '\n\n**Customer A Access:** ' +
      '{name: "Customer A", description: "Customer A resource/device and dashboards", resourceGroups: [10,11,12]} ' +
      '// Users see only Customer A resource/device ' +
      '\n\n**Customer B Access:** ' +
      '{name: "Customer B", description: "Customer B resource/device and dashboards", resourceGroups: [20,21,22]} ' +
      '// Users see only Customer B resource/device ' +
      '\n\n**Internal Team (all access):** ' +
      '{name: "MSP Admin Team", description: "Full access to all customers", resourceGroups: []} ' +
      '// Empty resourceGroups = access to everything ' +
      '\n\n**Department isolation example:** ' +
      '\n\n**Network Team:** ' +
      '{name: "Network Team", description: "Access to network resource/device only", resourceGroups: [100]} ' +
      '// Group 100 = "Network resources/Devices" folder ' +
      '\n\n**Server Team:** ' +
      '{name: "Server Team", description: "Access to servers only", resourceGroups: [200]} ' +
      '// Group 200 = "Servers" folder ' +
      '\n\n**Database Team:** ' +
      '{name: "Database Team", description: "Access to database servers", resourceGroups: [300]} ' +
      '// Group 300 = "Database Servers" folder ' +
      '\n\n**Environment isolation example:** ' +
      '\n\n**Production Access:** ' +
      '{name: "Production Team", description: "Production environment only", resourceGroups: [1]} ' +
      '\n\n**Dev/Test Access:** ' +
      '{name: "Developers", description: "Development and test environments", resourceGroups: [2,3]} ' +
      '\n\n**Access Group + Role (both needed):** ' +
      '\n- **Access Group:** Controls WHAT resources user sees (visibility)' +
      '\n- **Role:** Controls WHAT actions user can perform (permissions)' +
      '\n- Users need BOTH assigned to have any access' +
      '\n\n**After creation workflow:** ' +
      '\n- Create access group with resource scope' +
      '\n- Create users and assign them to this access group' +
      '\n- Assign appropriate role to users (view/manage/admin)' +
      '\n- Users now see only resources in their access group' +
      '\n\n**Best practices:** ' +
      '\n- One access group per customer (MSP)' +
      '\n- One access group per team (department isolation)' +
      '\n- Empty resourceGroups = full access (admin groups)' +
      '\n- Descriptive names: "Customer Name - Environment"' +
      '\n\n**Related tools:** "update\\_access\\_group" (add/remove resources), "list\\_access\\_groups" (view all), "create\\_user" (assign users to group), "list\\_resource\\_groups" (find group IDs).',
    annotations: {
      title: 'Create access group',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the access group',
        },
        description: {
          type: 'string',
          description: 'Description of the access group',
        },
        tenantId: {
          type: 'number',
          description: 'Tenant ID (optional, for multi-tenant environments)',
        },
      },
      additionalProperties: false,
      required: ['name', 'description'],
    },
  },
  {
    name: 'update_access_group',
    description: 'Update an existing access group in LogicMonitor (LM) monitoring. ' +
      '\n\n**What this does:** Modify access group properties, add/remove resources, or change tenant assignment. Affects all users assigned to this group immediately. ' +
      '\n\n**When to use:**' +
      '\n- Add/remove resource/device groups from access scope' +
      '\n- Rename access group' +
      '\n- Update description' +
      '\n- Add new resources after customer growth' +
      '\n- Remove decommissioned resources' +
      '\n' +
      '\n\n**Required parameters:** ' +
      '\n- accessGroupId: Access group ID (from "list\\_access\\_groups") ' +
      '\n\n**Optional parameters (what to change):** ' +
      '\n- name: New access group name ' +
      '\n- description: Updated description ' +
      '\n- resourceGroups: New array of resource/device group IDs (replaces existing) ' +
      '\n- websites: Update website monitor access ' +
      '\n- dashboards: Update dashboard access ' +
      '\n- tenantId: Change tenant assignment ' +
      '\n\n**Common update scenarios:** ' +
      '\n\n**Add more resource/device groups to access:** ' +
      '{accessGroupId: 123, resourceGroups: [10,11,12,13,14]} // Added groups 13,14 ' +
      '\n\n**Remove access to resource/device group:** ' +
      '{accessGroupId: 123, resourceGroups: [10,11]} // Removed group 12 (decomm resources/devices) ' +
      '\n\n**Rename access group:** ' +
      '{accessGroupId: 123, name: "Customer A - Updated Name"} ' +
      '\n\n**Grant full access (admin group):** ' +
      '{accessGroupId: 123, resourceGroups: []} // Empty = see everything ' +
      '\n\n**⚠️ Important - Immediate Impact:** ' +
      '\n- Updating resourceGroups affects ALL users in this access group immediately ' +
      '\n- Removing resource/device group: Users instantly lose access to those resource/device ' +
      '\n- Adding resource/device group: Users instantly gain access to new resource/device ' +
      '\n- Users currently viewing removed resources will see "no access" errors ' +
      '\n\n**Best practice workflow:** ' +
      '1. Use "get\\_access\\_group" to see current configuration ' +
      '2. Use "list\\_users" to see which users affected by change ' +
      '3. Update access group with new resource scope ' +
      '4. Notify users of access changes ' +
      '\n\n**Example: Customer adds new infrastructure:** ' +
      '1. Customer provisions new resource/device group (e.g., "Customer A - AWS") ' +
      '2. Get current access: get_access_group(accessGroupId: 123) ' +
      '   // Returns: resourceGroups: [10,11] ' +
      '3. Add new group: update_access_group(accessGroupId: 123, resourceGroups: [10,11,12]) ' +
      '4. Customer users now see new AWS resource/device ' +
      '\n\n**Related tools:** "get\\_access\\_group" (review before update), "list\\_access\\_groups" (find group), "list\\_users" (see affected users), "list\\_resource\\_groups" (find group IDs).',
    annotations: {
      title: 'Update access group',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        accessGroupId: {
          type: 'number',
          description: 'The ID of the access group to update',
        },
        name: {
          type: 'string',
          description: 'New name for the access group',
        },
        description: {
          type: 'string',
          description: 'New description for the access group',
        },
        tenantId: {
          type: 'number',
          description: 'New tenant ID (optional)',
        },
      },
      additionalProperties: false,
      required: ['accessGroupId'],
    },
  },
  {
    name: 'delete_access_group',
    description: 'Delete an access group from LogicMonitor (LM) monitoring. ' +
      '\n\n**⚠️ WARNING: CRITICAL IMPACT ON USERS** ' +
      '\n- Users assigned to this group lose ALL access immediately ' +
      '\n- Users cannot login or see any resources until reassigned ' +
      '\n- Cannot be undone - users must be manually reassigned ' +
      '\n- Active user sessions may be terminated ' +
      '\n\n**What this does:** Permanently removes access group. All users assigned to this group lose their resource visibility immediately. ' +
      '\n\n**When to use:**' +
      '\n- Customer/client offboarded (MSP)' +
      '\n- Department dissolved/restructured' +
      '\n- Consolidating duplicate access groups' +
      '\n- Cleanup unused access groups' +
      '\n' +
      '\n\n**Required parameters:** ' +
      '\n- accessGroupId: Access group ID to delete (from "list\\_access\\_groups") ' +
      '\n\n**Before deleting - CRITICAL CHECKS:** ' +
      '1. Use "get\\_access\\_group" to see which resources are in scope ' +
      '2. Use "list\\_users" with filter to find ALL users assigned to this group ' +
      '3. Verify users have alternate access groups to move to ' +
      '4. Coordinate with users - they will lose access immediately ' +
      '\n\n**Impact of deletion:** ' +
      '\n- **Users:** Cannot login or see resources until reassigned to new group ' +
      '\n- **Active sessions:** May be terminated immediately ' +
      '\n- **Resources:** Not deleted, just become inaccessible to these users ' +
      '\n- **Dashboards:** Users lose access to dashboards shared via this group ' +
      '\n\n**Safe deletion workflow:** ' +
      '\n\n**Step 1: Identify affected users** ' +
      'list_users() // Find users with accessGroup: "Customer A" ' +
      '\n\n**Step 2: Create/identify replacement access group** ' +
      'create_access_group(name: "Customer A - New") // Or use existing group ' +
      '\n\n**Step 3: Reassign users BEFORE deleting group** ' +
      'For each user: update_user(userId: X, accessGroupId: NEW_GROUP_ID) ' +
      '\n\n**Step 4: Verify no users remain** ' +
      'get_access_group(accessGroupId: 123) // Check users list is empty ' +
      '\n\n**Step 5: Delete group** ' +
      'delete_access_group(accessGroupId: 123) ' +
      '\n\n**Common scenarios:** ' +
      '\n\n**MSP customer offboarding:** ' +
      '1. Verify customer contract ended ' +
      '2. Export customer data for records ' +
      '3. Check no customer users remain in access group ' +
      '4. Delete access group ' +
      '5. Optionally delete customer resources ' +
      '\n\n**Department restructuring:** ' +
      '1. Create new access group for reorganized team ' +
      '2. Move all users to new group ' +
      '3. Verify old group has zero users ' +
      '4. Delete old access group ' +
      '\n\n**⚠️ NEVER delete access group with active users unless intentionally revoking their access immediately!** ' +
      '\n\n**Best practice:** Always reassign users to new access group BEFORE deleting old group to prevent access disruption. ' +
      '\n\n**Related tools:** "get\\_access\\_group" (check users), "list\\_users" (find affected users), "update\\_user" (reassign users), "create\\_access\\_group" (create replacement).',
    annotations: {
      title: 'Delete access group',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        accessGroupId: {
          type: 'number',
          description: 'The ID of the access group to delete',
        },
      },
      additionalProperties: false,
      required: ['accessGroupId'],
    },
  },

  // Device DataSources
  {
    name: 'list_resource_datasources',
    description: 'List datasources applied to a specific resource/device in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Array of datasources actively monitoring this resource/device with: id (deviceDataSourceId), dataSourceName, dataSourceDisplayName, status, alert status, instance count, last poll time. ' +
      '\n\n**When to use:**' +
      '\n- See what\'s being monitored on a resource/device' +
      '\n- Verify datasource is collecting data' +
      '\n- Get deviceDataSourceId for metric retrieval' +
      '\n- Troubleshoot missing data' +
      '\n- Check datasource health' +
      '\n' +
      '\n\n**What you discover:** ' +
      '\n- Which datasources are active (e.g., WinCPU, WinMemory, SNMP\_Network\_Interfaces) ' +
      '\n- How many instances per datasource (e.g., 3 disks, 4 network interfaces) ' +
      '\n- Collection status: Collecting data vs errors ' +
      '\n- Alert status: Any active alerts from this datasource ' +
      '\n\n**This is step 1 for getting metrics:** ' +
      '**Complete workflow to retrieve metric data:** ' +
      '1. Use this tool → get deviceDataSourceId for datasource you want (e.g., WinCPU) ' +
      '2. Use "list\\_device\\_instances" → get instanceId for specific instance ' +
      '3. Use "get\\_device\\_instance\\_data" → get actual metric values ' +
      '\n\n**Troubleshooting use cases:** ' +
      '\n- "Why no CPU data?" → Check if WinCPU datasource is applied and collecting ' +
      '\n- "Find disk datasource" → Look for datasource with "disk" or "volume" in name ' +
      '\n- "Check datasource errors" → Review status field for error messages ' +
      '\n\n**Important:** LogicMonitor may return a negative "total" value due to a known upstream API limitation - this does not mean the request failed. Never use "total" to count or check for results; check the length of the "items" array instead, and use pagination (size/offset) or autoPaginate: true to retrieve all items across pages. ' +
      '\n\n**Related tools:** "list\\_device\\_instances" (next step), "get\\_device\\_instance\\_data" (get metrics), "update\\_device\\_datasource" (enable/disable).',
    annotations: {
      title: 'List resource/device datasources',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        deviceId: {
          type: 'number',
          description: 'The resource/device ID',
        },
        ...paginationSchema,
        ...filterSchema,
        ...fieldsSchema,
      },
      additionalProperties: false,
      required: ['deviceId'],
    },
  },
  {
    name: 'get_resource_datasource',
    description: 'Get detailed information about a specific datasource applied to a resource/device in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Complete resource/device datasource details: dataSourceName, status, alert status, number of instances, monitoring configuration, stop monitoring flag, custom properties, graphs. ' +
      '\n\n**When to use:**' +
      '\n- Check if datasource is collecting data' +
      '\n- Review alert status for specific datasource' +
      '\n- Verify custom thresholds' +
      '\n- Get deviceDataSourceId for instance operations' +
      '\n- Troubleshoot data collection issues' +
      '\n' +
      '\n\n**Key fields:** ' +
      '\n- instanceNumber: How many instances (e.g., 4 network interfaces) ' +
      '\n- status: Collection status (normal vs error) ' +
      '\n- alertStatus: Any active alerts from this datasource ' +
      '\n- stopMonitoring: Whether datasource is disabled on this resource/device ' +
      '\n\n**Workflow:** Use "list\\_device\\_datasources" to find deviceDataSourceId, then use this tool for detailed status. ' +
      '\n\n**Related tools:** "list\\_device\\_datasources" (find datasource), "list\\_device\\_instances" (get instances), "update\\_device\\_datasource" (enable/disable).',
    annotations: {
      title: 'Get resource/device datasource details',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        deviceId: {
          type: 'number',
          description: 'The resource/device ID',
        },
        deviceDataSourceId: {
          type: 'number',
          description: 'The resource/device datasource ID',
        },
        ...fieldsSchema,
      },
      additionalProperties: false,
      required: ['deviceId', 'deviceDataSourceId'],
    },
  },
  {
    name: 'update_resource_datasource',
    description: 'Update resource/device datasource configuration in LogicMonitor (LM) monitoring. ' +
      '\n\n**What this does:** Modify how a specific datasource monitors a specific resource/device. Control alerting, enable/disable monitoring, or adjust device-specific datasource settings without affecting other resources/devices. ' +
      '\n\n**When to use:**' +
      '\n- Disable monitoring for specific datasource on one resource/device' +
      '\n- Disable alerting during maintenance' +
      '\n- Enable previously disabled datasource' +
      '\n- Adjust polling interval for device' +
      '\n- Update device-specific thresholds' +
      '\n' +
      '\n\n**Required parameters:** ' +
      '\n- deviceId: Device ID (from "list\\_resources") ' +
      '\n- deviceDataSourceId: Device datasource ID (from "list\\_device\\_datasources") ' +
      '\n\n**Optional parameters (what to change):** ' +
      '\n- disableAlerting: true (mute alerts) or false (enable alerts) ' +
      '\n- stopMonitoring: true (stop data collection) or false (resume monitoring) ' +
      '\n- pollingInterval: Custom polling interval in seconds (override default) ' +
      '\n- customProperties: Device-specific datasource properties/thresholds ' +
      '\n\n**Common scenarios:** ' +
      '\n\n**Disable alerting during troubleshooting:** ' +
      '{deviceId: 123, deviceDataSourceId: 456, disableAlerting: true} ' +
      '// Keep collecting data, but suppress alerts ' +
      '\n\n**Stop monitoring specific datasource:** ' +
      '{deviceId: 123, deviceDataSourceId: 456, stopMonitoring: true} ' +
      '// Stop collection completely (e.g., datasource not applicable) ' +
      '\n\n**Resume monitoring after maintenance:** ' +
      '{deviceId: 123, deviceDataSourceId: 456, disableAlerting: false, stopMonitoring: false} ' +
      '\n\n**Custom polling interval:** ' +
      '{deviceId: 123, deviceDataSourceId: 456, pollingInterval: 300} ' +
      '// Poll every 5 minutes instead of default 1 minute ' +
      '\n\n**Device-specific threshold:** ' +
      '{deviceId: 123, deviceDataSourceId: 456, customProperties: [{name: "cpu.threshold", value: "95"}]} ' +
      '// This resource/device can run hotter than others ' +
      '\n\n**DisableAlerting vs StopMonitoring:** ' +
      '\n- **disableAlerting: true** - Still collects data, graphs work, but no alerts (good for maintenance) ' +
      '\n- **stopMonitoring: true** - No data collection, no graphs, no alerts (fully disabled) ' +
      '\n\n**Use cases by scenario:** ' +
      '\n\n**During server patching:** ' +
      'disableAlerting: true (want graphs to show downtime, but no alerts) ' +
      '\n\n**Datasource not applicable:** ' +
      'stopMonitoring: true (e.g., Windows datasource on Linux server - shouldn\'t be there) ' +
      '\n\n**High-frequency monitoring:** ' +
      'pollingInterval: 60 (every minute for critical metrics) ' +
      '\n\n**Low-frequency monitoring:** ' +
      'pollingInterval: 600 (every 10 minutes for less critical metrics) ' +
      '\n\n**Workflow:** Use "list\\_device\\_datasources" to find deviceDataSourceId, then update configuration. ' +
      '\n\n**Related tools:** "list\\_device\\_datasources" (find datasource), "get\\_device\\_datasource" (check current config), "list\\_device\\_instances" (see monitored instances).',
    annotations: {
      title: 'Update resource/device datasource',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        deviceId: {
          type: 'number',
          description: 'The resource/device ID',
        },
        deviceDataSourceId: {
          type: 'number',
          description: 'The resource/device datasource ID',
        },
        disableAlerting: {
          type: 'boolean',
          description: 'Whether to disable alerting for this datasource',
        },
        stopMonitoring: {
          type: 'boolean',
          description: 'Whether to stop monitoring this datasource',
        },
      },
      additionalProperties: false,
      required: ['deviceId', 'deviceDataSourceId'],
    },
  },

  // EventSources
  {
    name: 'list_eventsources',
    description: 'List all EventSources in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Array of EventSources with: id, name, displayName, description, appliesTo logic, event collection method. ' +
      '\n\n**What are EventSources:** Collect and process event data (logs, Windows events, syslog, traps). Different from DataSources (metrics) and ConfigSources (configs). Used for log monitoring and event correlation. ' +
      '\n\n**When to use:**' +
      '\n- Find EventSource for log monitoring' +
      '\n- Discover what events are being collected' +
      '\n- Get EventSource IDs for operations' +
      '\n- Audit event monitoring coverage' +
      '\n' +
      '\n\n**Event types collected:** ' +
      '\n- Windows Event Logs: Application, Security, System logs ' +
      '\n- Syslog: Linux/Unix system logs, network resource/device logs ' +
      '\n- SNMP Traps: Network resource/device alerts and notifications ' +
      '\n- Application logs: Custom app logs, web server logs ' +
      '\n- Cloud events: CloudWatch logs, Azure events ' +
      '\n\n**Common EventSources:** ' +
      '\n- Windows\\_Application\\_EventLog: Windows application events ' +
      '\n- Windows\\_Security\\_EventLog: Security/audit logs ' +
      '\n- Linux\\_Syslog: Linux system logs via syslog ' +
      '\n- SNMP\\_Traps: Network resource/device SNMP traps ' +
      '\n- VMware\\_Events: vCenter events ' +
      '\n\n**Use cases:** ' +
      '\n- Monitor Windows failed login attempts ' +
      '\n- Alert on ERROR/CRITICAL in application logs ' +
      '\n- Collect network resource/device syslog for troubleshooting ' +
      '\n- Track security events for compliance ' +
      '\n\n**Important:** LogicMonitor may return a negative "total" value due to a known upstream API limitation - this does not mean the request failed. Never use "total" to count or check for results; check the length of the "items" array instead, and use pagination (size/offset) or autoPaginate: true to retrieve all items across pages. ' +
      '\n\n**Related tools:** "get\\_eventsource" (details), "list\\_device\\_eventsources" (events for device).',
    annotations: {
      title: 'List EventSources',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        ...paginationSchema,
        ...filterSchema,
        ...fieldsSchema,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_eventsource',
    description: 'Get detailed information about a specific EventSource by its ID in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Complete EventSource details: name, displayName, description, appliesTo logic, collection method, filter rules, severity mapping, alert settings. ' +
      '\n\n**When to use:**' +
      '\n- Understand what events are collected' +
      '\n- Review filter rules (which events trigger alerts)' +
      '\n- Check severity mapping' +
      '\n- Troubleshoot event collection' +
      '\n- See appliesTo logic' +
      '\n' +
      '\n\n**Key information:** ' +
      '\n- appliesTo: Which resources/devicesget event monitoring ' +
      '\n- filters: Rules for parsing/matching events ' +
      '\n- severityMapping: Map event levels (INFO/WARN/ERROR) to LM alert levels ' +
      '\n- schedule: When event collection runs ' +
      '\n\n**Workflow:** Use "list\\_eventsources" to find eventSourceId, then use this tool for complete configuration. ' +
      '\n\n**Related tools:** "list\\_eventsources" (find EventSource), "list\\_device\\_eventsources" (events for device).',
    annotations: {
      title: 'Get EventSource details',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        eventSourceId: {
          type: 'number',
          description: 'The ID of the eventsource to retrieve',
        },
        ...fieldsSchema,
      },
      additionalProperties: false,
      required: ['eventSourceId'],
    },
  },

  // Escalation Chains
  {
    name: 'list_escalation_chains',
    description: 'List all escalation chains in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Array of escalation chains with: id, name, description, escalation stages, recipients at each stage, timing/delays, enabled status. ' +
      '\n\n**What are escalation chains:** Define HOW and WHO gets notified when alerts trigger. Multi-stage notification workflows: Stage 1 (notify team lead immediately) → Stage 2 (if still open after 15 min, notify manager) → Stage 3 (if still open after 30 min, page director). ' +
      '\n\n**When to use:**' +
      '\n- Audit notification routing' +
      '\n- Find escalation chain IDs for alert rule configuration' +
      '\n- Review who gets notified for critical alerts' +
      '\n- Verify on-call escalation paths' +
      '\n' +
      '\n\n**How escalation chains work:** ' +
      'Alert triggers → Alert Rule matches → Routes to Escalation Chain → Stage 1 notifies immediately → Wait X minutes → If still alerting, Stage 2 notifies → Repeat through stages ' +
      '\n\n**Common escalation patterns:** ' +
      '\n- **Critical Production:** Stage 1: On-call engineer (0 min) → Stage 2: Team lead (15 min) → Stage 3: Engineering manager (30 min) ' +
      '\n- **Standard:** Stage 1: Team email (0 min) → Stage 2: PagerDuty (30 min) ' +
      '\n- **Business Hours Only:** Stage 1: Team Slack (0 min, 8am-6pm only) ' +
      '\n\n**Use cases:** ' +
      '\n- "Who gets paged for critical database alerts?" → Check escalation chain ' +
      '\n- "Why didn\'t I get notified?" → Verify you\'re in the escalation chain ' +
      '\n- "Update on-call rotation" → Modify escalation chain recipients ' +
      '\n\n**Important:** LogicMonitor may return a negative "total" value due to a known upstream API limitation - this does not mean the request failed. Never use "total" to count or check for results; check the length of the "items" array instead, and use pagination (size/offset) or autoPaginate: true to retrieve all items across pages. ' +
      '\n\n**Related tools:** "get\\_escalation\\_chain" (detailed stages), "list\\_alert\\_rules" (see which rules use chain), "list\\_recipients" (available notification targets).',
    annotations: {
      title: 'List escalation chains',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        ...paginationSchema,
        ...filterSchema,
        ...fieldsSchema,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_escalation_chain',
    description: 'Get detailed information about a specific escalation chain by its ID in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Complete escalation chain details: name, description, all stages with: recipients at each stage, notification methods (email/SMS/webhook), time delays between stages, rate limiting, business hours restrictions. ' +
      '\n\n**When to use:**' +
      '\n- Review detailed notification workflow' +
      '\n- Verify who gets notified at each stage' +
      '\n- Check timing between escalations' +
      '\n- Audit notification methods' +
      '\n- Troubleshoot why notifications not received' +
      '\n' +
      '\n\n**Stage details returned:** ' +
      'For each stage: ' +
      '\n- Stage number (1, 2, 3...) ' +
      '\n- Delay before stage triggers (minutes) ' +
      '\n- Recipients/groups notified ' +
      '\n- Notification methods (email, SMS, integration) ' +
      '\n- Schedule (24/7 vs business hours only) ' +
      '\n\n**Example escalation chain details:** ' +
      'Stage 1 (0 min): Email "oncall@company.com", SMS "+1-555-1234" ' +
      'Stage 2 (15 min): PagerDuty integration, Email "team-lead@company.com" ' +
      'Stage 3 (30 min): Slack webhook, Email "engineering-manager@company.com" ' +
      '\n\n**Workflow:** Use "list\\_escalation\\_chains" to find chainId, then use this tool to review complete notification workflow. ' +
      '\n\n**Related tools:** "list\\_escalation\\_chains" (find chains), "update\\_escalation\\_chain" (modify), "list\\_recipients" (see recipients).',
    annotations: {
      title: 'Get escalation chain details',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        chainId: {
          type: 'number',
          description: 'The ID of the escalation chain to retrieve',
        },
        ...fieldsSchema,
      },
      additionalProperties: false,
      required: ['chainId'],
    },
  },
  {
    name: 'create_escalation_chain',
    description: 'Create a new escalation chain in LogicMonitor (LM) monitoring. ' +
      '\n\n**What this does:** Defines multi-stage notification workflow for alerts. Controls WHO gets notified, WHEN they get notified, and HOW notifications escalate if alerts remain unacknowledged. ' +
      '\n\n**When to use:**' +
      '\n- Set up on-call rotation notifications' +
      '\n- Define critical alert escalation (team → lead → manager)' +
      '\n- Create business hours vs after-hours notification paths' +
      '\n- Configure team-specific alert routing' +
      '\n- Establish incident escalation procedures' +
      '\n' +
      '\n\n**Required parameters:** ' +
      '\n- name: Escalation chain name (e.g., "Critical Production", "Database Team", "Business Hours Only") ' +
      '\n- stages: Array of escalation stages defining notification workflow ' +
      '\n\n**Stage configuration:** ' +
      'Each stage defines: ' +
      '\n- recipients: Array of recipient IDs or group IDs to notify ' +
      '\n- delay: Minutes to wait before this stage (0 = immediate, 15 = wait 15 min) ' +
      '\n- notificationMethod: email, SMS, voice, webhook, integration ' +
      '\n- schedule: When stage is active (24/7 vs business hours only) ' +
      '\n\n**Escalation chain workflow:** ' +
      'Alert triggers → Matched by Alert Rule → Routes to Escalation Chain → ' +
      'Stage 1 notifies immediately → Wait delay → If still alerting → Stage 2 notifies → Repeat ' +
      '\n\n**Common escalation patterns:** ' +
      '\n\n**Critical Production (3-stage):** ' +
      '{name: "Critical Production", stages: [ ' +
      '  {recipients: [1,2], delay: 0, method: "SMS"},  // On-call engineer immediately ' +
      '  {recipients: [3], delay: 15, method: "SMS"},  // Team lead after 15min ' +
      '  {recipients: [4], delay: 30, method: "voice"}  // Manager after 30min total ' +
      ']} ' +
      '\n\n**Standard Team (2-stage):** ' +
      '{name: "Database Team", stages: [ ' +
      '  {recipients: [groupId:10], delay: 0, method: "email"},  // Entire team immediately ' +
      '  {recipients: [5], delay: 30, method: "SMS"}  // Team lead after 30min ' +
      ']} ' +
      '\n\n**Business Hours Only:** ' +
      '{name: "Non-Critical", stages: [ ' +
      '  {recipients: [groupId:20], delay: 0, method: "email", schedule: "business-hours"}  // Email during work hours only ' +
      ']} ' +
      '\n\n**PagerDuty Integration:** ' +
      '{name: "PagerDuty Escalation", stages: [ ' +
      '  {recipients: [integrationId:1], delay: 0, method: "webhook"}  // PagerDuty handles escalation ' +
      ']} ' +
      '\n\n**Slack + Email Combo:** ' +
      '{name: "DevOps Team", stages: [ ' +
      '  {recipients: [slackId:1], delay: 0, method: "webhook"},  // Slack channel immediately ' +
      '  {recipients: [groupId:30], delay: 10, method: "email"}  // Email if not acknowledged ' +
      ']} ' +
      '\n\n**Delay timing explained:** ' +
      '\n- delay: 0 = Immediate notification when alert triggers ' +
      '\n- delay: 15 = Wait 15 minutes from previous stage ' +
      '\n- delay: 30 = Wait 30 minutes from previous stage ' +
      '\n- If alert acknowledged, escalation stops (no further stages notify) ' +
      '\n- If alert clears, escalation stops ' +
      '\n\n**Notification methods:** ' +
      '\n- email: Email to recipient address ' +
      '\n- SMS: Text message to phone ' +
      '\n- voice: Phone call ' +
      '\n- webhook: HTTP POST (for Slack, PagerDuty, custom integrations) ' +
      '\n- integration: Pre-configured integration (ServiceNow, Jira, etc.) ' +
      '\n\n**Schedule restrictions:** ' +
      '\n- "24/7" or null: Always active ' +
      '\n- "business-hours": Mon-Fri 9am-5pm (configurable) ' +
      '\n- Custom schedules: Define specific time windows ' +
      '\n\n**After creation workflow:** ' +
      '1. Create escalation chain with notification stages ' +
      '2. Create Alert Rule that routes alerts to this chain ' +
      '3. Alert Rule matches alerts → Routes to chain → Chain notifies per stages ' +
      '\n\n**Best practices:** ' +
      '\n- Use recipient groups instead of individuals (easier to update) ' +
      '\n- Start with reasonable delays (15-30 min between stages) ' +
      '\n- Use SMS/voice for critical escalations only (cost/noise) ' +
      '\n- Business hours chains for non-critical alerts (reduce after-hours noise) ' +
      '\n- Test escalation chains before production use ' +
      '\n- Document who is in each stage for on-call handoffs ' +
      '\n\n**Related tools:** "list\\_recipients" (find recipients), "list\\_recipient\\_groups" (find groups), "list\\_integrations" (find integrations), "create\\_alert\\_rule" (route alerts to chain), "list\\_escalation\\_chains" (view all).',
    annotations: {
      title: 'Create escalation chain',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the escalation chain',
        },
        description: {
          type: 'string',
          description: 'Description of the escalation chain',
        },
        stages: {
          type: 'array',
          description: 'Array of escalation stages with recipients and timing',
        },
      },
      additionalProperties: false,
      required: ['name'],
    },
  },
  {
    name: 'update_escalation_chain',
    description: 'Update an existing escalation chain in LogicMonitor (LM) monitoring. ' +
      '\n\n**What this does:** Modify escalation chain stages, recipients, timing, or notification methods. Changes affect all alert rules using this chain immediately. ' +
      '\n\n**When to use:**' +
      '\n- Update on-call rotation recipients' +
      '\n- Adjust escalation timing' +
      '\n- Add/remove notification stages' +
      '\n- Change notification methods' +
      '\n- Update business hours schedules' +
      '\n' +
      '\n\n**Required parameters:** ' +
      '\n- chainId: Escalation chain ID (from "list\\_escalation\\_chains") ' +
      '\n\n**Optional parameters (what to change):** ' +
      '\n- name: New chain name ' +
      '\n- description: Updated description ' +
      '\n- stages: New escalation stages array (replaces all stages) ' +
      '\n- enabled: true (active) or false (disable temporarily) ' +
      '\n\n**Common update scenarios:** ' +
      '\n\n**Update on-call rotation:** ' +
      '{chainId: 123, stages: [{recipients: [newOnCallId], delay: 0, method: "SMS"}]} ' +
      '\n\n**Adjust escalation timing:** ' +
      '{chainId: 123, stages: [{recipients: [1,2], delay: 0}, {recipients: [3], delay: 10}]} // Faster escalation ' +
      '\n\n**Add stage for manager escalation:** ' +
      '{chainId: 123, stages: [stage1, stage2, {recipients: [managerId], delay: 45}]} // Add 3rd stage ' +
      '\n\n**Disable chain temporarily:** ' +
      '{chainId: 123, enabled: false} // During team restructuring ' +
      '\n\n**⚠️ Important - Immediate Impact:** ' +
      '\n- All alert rules using this chain immediately use new configuration ' +
      '\n- Active alerts in-progress continue with old stages (already notified) ' +
      '\n- New alerts use updated stages ' +
      '\n- Disabling chain stops all notifications for alerts routed to it ' +
      '\n\n**Best practice workflow:** ' +
      '1. Use "get\\_escalation\\_chain" to review current configuration ' +
      '2. Use "list\\_alert\\_rules" to see which rules use this chain (impact analysis) ' +
      '3. Update escalation chain ' +
      '4. Monitor alerts to verify new configuration works ' +
      '\n\n**Related tools:** "get\\_escalation\\_chain" (review), "list\\_alert\\_rules" (impact analysis), "list\\_recipients" (find new recipients).',
    annotations: {
      title: 'Update escalation chain',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        chainId: {
          type: 'number',
          description: 'The ID of the escalation chain to update',
        },
        name: {
          type: 'string',
          description: 'New name for the escalation chain',
        },
        description: {
          type: 'string',
          description: 'New description',
        },
        stages: {
          type: 'array',
          description: 'Updated array of escalation stages',
        },
      },
      additionalProperties: false,
      required: ['chainId'],
    },
  },
  {
    name: 'delete_escalation_chain',
    description: 'Delete an escalation chain from LogicMonitor (LM) monitoring. ' +
      '\n\n**⚠️ WARNING: BREAKS ALERT ROUTING** ' +
      '\n- Alert rules using this chain will stop sending notifications ' +
      '\n- Active alerts routed to this chain stop escalating ' +
      '\n- Cannot be undone - must recreate chain if needed ' +
      '\n- No alerts will be sent until rules updated to use different chain ' +
      '\n\n**What this does:** Permanently removes escalation chain. Alert rules referencing this chain lose their notification path and stop sending alerts. ' +
      '\n\n**When to use:**' +
      '\n- Consolidating duplicate chains' +
      '\n- Replacing with better-configured chain' +
      '\n- Team/process restructuring' +
      '\n- Cleanup unused chains' +
      '\n' +
      '\n\n**Required parameters:** ' +
      '\n- chainId: Escalation chain ID to delete (from "list\\_escalation\\_chains") ' +
      '\n\n**Before deleting - CRITICAL CHECKS:** ' +
      '1. Use "list\\_alert\\_rules" with filter to find ALL rules using this chain ' +
      '2. Create/identify replacement escalation chain ' +
      '3. Update all alert rules to use new chain BEFORE deleting ' +
      '4. Verify no rules still reference this chain ' +
      '\n\n**Impact of deletion:** ' +
      '\n- **Alert Rules:** Rules using this chain stop sending notifications (silently!) ' +
      '\n- **Active Alerts:** In-progress escalations stop (no further stages notify) ' +
      '\n- **New Alerts:** Matched by broken rules but no notifications sent ' +
      '\n- **No Error:** System does not warn that notifications stopped ' +
      '\n\n**Safe deletion workflow:** ' +
      '\n\n**Step 1: Find affected alert rules** ' +
      'list_alert_rules() // Look for escalationChainId matching chain to delete ' +
      '\n\n**Step 2: Create/identify replacement chain** ' +
      'create_escalation_chain(name: "New On-Call") // Or use existing chain ID ' +
      '\n\n**Step 3: Update ALL alert rules FIRST** ' +
      'For each rule: update_alert_rule(ruleId: X, escalationChainId: NEW_CHAIN_ID) ' +
      '\n\n**Step 4: Verify no rules reference old chain** ' +
      'list_alert_rules() // Confirm no rules use old chainId ' +
      '\n\n**Step 5: Delete chain** ' +
      'delete_escalation_chain(chainId: OLD_CHAIN_ID) ' +
      '\n\n**Common scenarios:** ' +
      '\n\n**Replace on-call rotation chain:** ' +
      '1. Create new escalation chain with updated rotation ' +
      '2. Update all alert rules to new chain ' +
      '3. Test with sample alert ' +
      '4. Delete old chain once verified ' +
      '\n\n**Consolidate duplicate chains:** ' +
      '1. Identify chains doing same thing ' +
      '2. Choose one to keep (or create better one) ' +
      '3. Update rules using duplicate chains to use primary chain ' +
      '4. Delete duplicate chains ' +
      '\n\n**⚠️ NEVER delete escalation chain without updating alert rules first - notifications will silently stop!** ' +
      '\n\n**Best practice:** Always migrate alert rules to replacement chain BEFORE deleting old chain. ' +
      '\n\n**Related tools:** "list\\_alert\\_rules" (find usage), "update\\_alert\\_rule" (migrate rules), "create\\_escalation\\_chain" (create replacement).',
    annotations: {
      title: 'Delete escalation chain',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        chainId: {
          type: 'number',
          description: 'The ID of the escalation chain to delete',
        },
      },
      additionalProperties: false,
      required: ['chainId'],
    },
  },

  // Recipients
  {
    name: 'list_recipients',
    description: 'List all alert recipients (individual notification targets) in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Array of recipients with: id, type (email/SMS/webhook), contact information, method (email address, phone number, webhook URL), name, status. ' +
      '\n\n**What are recipients:** Individual notification endpoints used in escalation chains. Can be: email addresses, SMS/phone numbers, webhook URLs, or integration endpoints (Slack, PagerDuty, etc.). ' +
      '\n\n**When to use:**' +
      '\n- Find recipient IDs for escalation chain configuration' +
      '\n- Audit who can receive alerts' +
      '\n- Verify contact information is current' +
      '\n- Review notification endpoints before updating escalation chains' +
      '\n' +
      '\n\n**Recipient types explained:** ' +
      '\n- **Email:** Email address (e.g., oncall@company.com, john.doe@company.com) ' +
      '\n- **SMS:** Mobile phone number (e.g., +1-555-123-4567) ' +
      '\n- **Voice:** Phone number for voice calls ' +
      '\n- **Arbitrary:** Custom webhooks for external integrations ' +
      '\n\n**Common use cases:** ' +
      '\n- "Who can receive critical production alerts?" → List recipients used in escalation chains ' +
      '\n- "Update on-call phone number" → Find recipient by name, update contact info ' +
      '\n- "Add new team member to alerts" → Create recipient, add to escalation chain ' +
      '\n- "Remove former employee" → Find and delete recipient ' +
      '\n\n**Recipients vs Recipient Groups:** ' +
      '\n- Recipients: Individual targets (one email, one phone) ' +
      '\n- Recipient Groups: Collections of recipients (notify entire team at once) ' +
      '\n\n**Workflow:** Use this tool to find available recipients, then use in "create\\_escalation\\_chain" or "update\\_escalation\\_chain" to set up notifications. ' +
      '\n\n**Important:** LogicMonitor may return a negative "total" value due to a known upstream API limitation - this does not mean the request failed. Never use "total" to count or check for results; check the length of the "items" array instead, and use pagination (size/offset) or autoPaginate: true to retrieve all items across pages. ' +
      '\n\n**Related tools:** "get\\_recipient" (details), "list\\_recipient\\_groups" (group management), "list\\_escalation\\_chains" (see who gets notified).',
    annotations: {
      title: 'List alert recipients',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        ...paginationSchema,
        ...filterSchema,
        ...fieldsSchema,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_recipient',
    description: 'Get detailed information about a specific recipient by ID in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Complete recipient details: type, name, contact information (email/phone/URL), notification method, timezone, schedule restrictions, rate limiting settings. ' +
      '\n\n**When to use:**' +
      '\n- Verify contact information before escalation' +
      '\n- Check notification schedule (business hours vs 24/7)' +
      '\n- Review rate limiting settings' +
      '\n- Audit recipient configuration' +
      '\n' +
      '\n\n**Details returned:** ' +
      '\n- Contact info: Exact email/phone/webhook URL ' +
      '\n- Schedule: When notifications are sent (always vs business hours) ' +
      '\n- Rate limit: Max notifications per time period (prevent notification fatigue) ' +
      '\n- Method: Delivery mechanism (SMTP, Twilio, webhook) ' +
      '\n\n**Workflow:** Use "list\\_recipients" to find recipientId, then use this tool for complete configuration. ' +
      '\n\n**Related tools:** "list\\_recipients" (find recipient), "update\\_recipient" (modify), "list\\_escalation\\_chains" (usage).',
    annotations: {
      title: 'Get recipient details',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        recipientId: {
          type: 'number',
          description: 'The ID of the recipient to retrieve',
        },
        ...fieldsSchema,
      },
      additionalProperties: false,
      required: ['recipientId'],
    },
  },
  {
    name: 'create_recipient',
    description: 'Create a new alert recipient (notification endpoint) in LogicMonitor (LM) monitoring. ' +
      '\n\n**What this does:** Creates individual notification target (email address, phone number, webhook URL, etc.) that can receive alert notifications via escalation chains. ' +
      '\n\n**When to use:**' +
      '\n- Add new team member to alert notifications' +
      '\n- Set up on-call phone numbers' +
      '\n- Configure webhook for Slack/Teams integration' +
      '\n- Add email distribution lists' +
      '\n- Set up SMS alerts for critical issues' +
      '\n' +
      '\n\n**Required parameters:** ' +
      '\n- type: Recipient type - "email", "sms", "voice", "webhook" ' +
      '\n- address: Contact information (email address, phone number, webhook URL) ' +
      '\n\n**Optional parameters:** ' +
      '\n- name: Friendly name (e.g., "John Doe - Mobile", "Team Slack Channel") ' +
      '\n- schedule: Notification schedule (24/7, business hours only, custom) ' +
      '\n- rateLimit: Max notifications per time period (prevent alert fatigue) ' +
      '\n\n**Recipient types and examples:** ' +
      '\n\n**Email recipient:** ' +
      '{type: "email", address: "oncall@company.com", name: "On-Call Team Email"} ' +
      '{type: "email", address: "john.doe@company.com", name: "John Doe"} ' +
      '\n\n**SMS recipient (mobile alerts):** ' +
      '{type: "sms", address: "+1-555-123-4567", name: "John - Mobile", schedule: "24/7"} ' +
      '{type: "sms", address: "+1-555-987-6543", name: "On-Call Phone"} ' +
      '\n\n**Voice recipient (phone calls):** ' +
      '{type: "voice", address: "+1-555-111-2222", name: "Emergency Contact"} ' +
      '\n\n**Webhook recipient (integrations):** ' +
      '{type: "webhook", address: "https://hooks.slack.com/...", name: "DevOps Slack Channel"} ' +
      '{type: "webhook", address: "https://custom-app.com/alerts", name: "Custom Integration"} ' +
      '\n\n**Schedule options:** ' +
      '\n- "24/7" or null: Always receive notifications ' +
      '\n- "business-hours": Mon-Fri 9am-5pm only (reduce after-hours noise) ' +
      '\n- Custom schedule: Define specific days/times ' +
      '\n\n**Rate limiting (prevent notification fatigue):** ' +
      '\n- rateLimit: 10 = Max 10 notifications per hour ' +
      '\n- rateLimit: 5 = Max 5 notifications per hour (for SMS/voice - cost control) ' +
      '\n- Prevents alert storms from flooding recipient ' +
      '\n\n**Common recipient patterns:** ' +
      '\n\n**On-call engineer (multiple contact methods):** ' +
      '1. Create email: {type: "email", address: "engineer@company.com"} ' +
      '2. Create SMS: {type: "sms", address: "+1-555-1234"} ' +
      '3. Create voice: {type: "voice", address: "+1-555-1234"} ' +
      '4. Add all to escalation chain for redundancy ' +
      '\n\n**Team notification (prefer groups):** ' +
      'For multiple people, better to: ' +
      '1. Create individual recipients for each team member ' +
      '2. Create recipient group containing all members ' +
      '3. Use group in escalation chains (easier to manage) ' +
      '\n\n**After creation workflow:** ' +
      '1. Create recipient(s) ' +
      '2. Optionally create recipient group to organize ' +
      '3. Add to escalation chain stages ' +
      '4. Escalation chain used by alert rules ' +
      '5. Recipient receives notifications when alerts match ' +
      '\n\n**Best practices:** ' +
      '\n- Descriptive names: "John Doe - Mobile" not just phone number ' +
      '\n- Use business hours schedule for non-critical alerts ' +
      '\n- Rate limit SMS/voice to control costs ' +
      '\n- Group related recipients (easier management) ' +
      '\n- Test with sample alert before production use ' +
      '\n\n**Related tools:** "create\\_recipient\\_group" (organize recipients), "create\\_escalation\\_chain" (use recipients), "list\\_recipients" (view all).',
    annotations: {
      title: 'Create recipient',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: 'Recipient type (e.g., "email", "sms")',
        },
        addr: {
          type: 'string',
          description: 'Recipient address (email or phone number)',
        },
        name: {
          type: 'string',
          description: 'Recipient name',
        },
        method: {
          type: 'string',
          description: 'Notification method',
        },
      },
      additionalProperties: false,
      required: ['type', 'addr'],
    },
  },
  {
    name: 'update_recipient',
    description: 'Update an existing alert recipient in LogicMonitor (LM) monitoring. ' +
      '\n\n**What this does:** Modify recipient contact information, notification schedule, rate limits, or name. Changes affect all escalation chains using this recipient. ' +
      '\n\n**When to use:**' +
      '\n- Update phone number/email after personnel changes' +
      '\n- Change notification schedule' +
      '\n- Adjust rate limits' +
      '\n- Update recipient name' +
      '\n- Switch from email to SMS' +
      '\n' +
      '\n\n**Required parameters:** ' +
      '\n- recipientId: Recipient ID (from "list\\_recipients") ' +
      '\n\n**Optional parameters (what to change):** ' +
      '\n- address: New contact info (email, phone, webhook URL) ' +
      '\n- name: New friendly name ' +
      '\n- schedule: Update notification hours ' +
      '\n- rateLimit: Change max notifications per hour ' +
      '\n\n**Common update scenarios:** ' +
      '\n\n**Update on-call phone number:** ' +
      '{recipientId: 123, address: "+1-555-999-8888", name: "John Doe - New Mobile"} ' +
      '\n\n**Change to business hours only:** ' +
      '{recipientId: 123, schedule: "business-hours"} // Stop after-hours alerts ' +
      '\n\n**Reduce SMS rate limit (cost control):** ' +
      '{recipientId: 123, rateLimit: 5} // Max 5 SMS per hour ' +
      '\n\n**Update webhook URL:** ' +
      '{recipientId: 123, address: "https://new-webhook-url.com/alerts"} ' +
      '\n\n**Best practice workflow:** ' +
      '1. Use "get\\_recipient" to review current configuration ' +
      '2. Update recipient information ' +
      '3. Changes take effect immediately for new notifications ' +
      '\n\n**Related tools:** "get\\_recipient" (review), "list\\_recipients" (find recipient), "list\\_escalation\\_chains" (see usage).',
    annotations: {
      title: 'Update recipient',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        recipientId: {
          type: 'number',
          description: 'The ID of the recipient to update',
        },
        name: {
          type: 'string',
          description: 'New name',
        },
        addr: {
          type: 'string',
          description: 'New address',
        },
        method: {
          type: 'string',
          description: 'New notification method',
        },
      },
      additionalProperties: false,
      required: ['recipientId'],
    },
  },
  {
    name: 'delete_recipient',
    description: 'Delete an alert recipient from LogicMonitor (LM) monitoring. ' +
      '\n\n**⚠️ WARNING: BREAKS ESCALATION CHAINS** ' +
      '\n- Escalation chains using this recipient will have gaps in notification ' +
      '\n- Stages referencing this recipient stop notifying (silently) ' +
      '\n- No error shown - notifications just don\'t arrive ' +
      '\n- Cannot be undone ' +
      '\n\n**What this does:** Permanently removes recipient. Escalation chains referencing this recipient lose that notification endpoint. ' +
      '\n\n**When to use:**' +
      '\n- Employee left company' +
      '\n- Phone number decommissioned' +
      '\n- Email no longer valid' +
      '\n- Webhook endpoint retired' +
      '\n- Consolidating duplicate recipients' +
      '\n' +
      '\n\n**Required parameters:** ' +
      '\n- recipientId: Recipient ID to delete (from "list\\_recipients") ' +
      '\n\n**Before deleting - CRITICAL CHECKS:** ' +
      '1. Use "list\\_escalation\\_chains" to find chains using this recipient ' +
      '2. Create/identify replacement recipient ' +
      '3. Update escalation chains to use new recipient BEFORE deleting ' +
      '4. Verify no chains reference this recipient ' +
      '\n\n**Impact of deletion:** ' +
      '\n- Escalation chain stages with this recipient stop sending notifications ' +
      '\n- No error or warning - notifications silently fail ' +
      '\n- Active alerts may skip escalation stages ' +
      '\n\n**Safe deletion workflow:** ' +
      '1. Find which escalation chains use this recipient ' +
      '2. Create new recipient for replacement ' +
      '3. Update all escalation chains to use new recipient ' +
      '4. Verify updated ' +
      '5. Delete old recipient ' +
      '\n\n**Best practice:** Replace recipient in all escalation chains BEFORE deleting to prevent notification gaps. ' +
      '\n\n**Related tools:** "list\\_escalation\\_chains" (find usage), "create\\_recipient" (replacement), "update\\_escalation\\_chain" (migrate).',
    annotations: {
      title: 'Delete recipient',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        recipientId: {
          type: 'number',
          description: 'The ID of the recipient to delete',
        },
      },
      additionalProperties: false,
      required: ['recipientId'],
    },
  },

  // Recipient Groups
  {
    name: 'list_recipient_groups',
    description: 'List all recipient groups in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Array of recipient groups with: id, name, description, member count, recipients list. ' +
      '\n\n**What are recipient groups:** Collections of recipients treated as a single notification target. Simplify escalation chains by notifying entire teams at once. Example: "Database Team" group contains 5 team members - notify group = notify all 5. ' +
      '\n\n**When to use:**' +
      '\n- Find group IDs for escalation chains' +
      '\n- Audit team notification lists' +
      '\n- Review group membership before changes' +
      '\n- Simplify notification management' +
      '\n' +
      '\n\n**Benefits over individual recipients:** ' +
      '\n- **Easier management:** Update team once, applies to all escalation chains using that group ' +
      '\n- **Team notifications:** Notify entire team simultaneously ' +
      '\n- **Organized:** Group by function (DB team, Network team, On-call rotation) ' +
      '\n\n**Common recipient groups:** ' +
      '\n- "On-Call Engineers" - Current on-call rotation members ' +
      '\n- "Database Team" - All database administrators ' +
      '\n- "Network Operations" - NOC team members ' +
      '\n- "Management" - For escalation to leadership ' +
      '\n\n**Use cases:** ' +
      '\n- "Notify entire team for critical alerts" → Use group instead of 5 individual recipients ' +
      '\n- "Rotate on-call" → Update group members without touching escalation chains ' +
      '\n- "Add new team member" → Add to group, automatically included in alerts ' +
      '\n\n**Workflow:** Use this tool to find groups, then use in escalation chains to notify multiple people at once. ' +
      '\n\n**Important:** LogicMonitor may return a negative "total" value due to a known upstream API limitation - this does not mean the request failed. Never use "total" to count or check for results; check the length of the "items" array instead, and use pagination (size/offset) or autoPaginate: true to retrieve all items across pages. ' +
      '\n\n**Related tools:** "get\\_recipient\\_group" (details), "list\\_recipients" (individual members), "list\\_escalation\\_chains" (see usage).',
    annotations: {
      title: 'List recipient groups',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        ...paginationSchema,
        ...filterSchema,
        ...fieldsSchema,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_recipient_group',
    description: 'Get detailed information about a specific recipient group by ID in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Complete recipient group details: name, description, list of all members (recipients), member contact info, escalation chains using this group. ' +
      '\n\n**When to use:**' +
      '\n- Review group membership before modifications' +
      '\n- Verify who gets notified through this group' +
      '\n- Check which escalation chains use this group' +
      '\n- Audit team notification lists' +
      '\n' +
      '\n\n**Key information returned:** ' +
      '\n- Members: All recipients in group (names, emails, phones) ' +
      '\n- Usage: Which escalation chains reference this group ' +
      '\n- Description: Purpose/team name ' +
      '\n\n**Before modifying group:** Review escalation chain usage to understand impact of changes. Removing member from group affects all chains using that group. ' +
      '\n\n**Workflow:** Use "list\\_recipient\\_groups" to find groupId, then use this tool to review membership before updating. ' +
      '\n\n**Related tools:** "list\\_recipient\\_groups" (find groups), "update\\_recipient\\_group" (modify), "list\\_escalation\\_chains" (see where used).',
    annotations: {
      title: 'Get recipient group details',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        groupId: {
          type: 'number',
          description: 'The ID of the recipient group to retrieve',
        },
        ...fieldsSchema,
      },
      additionalProperties: false,
      required: ['groupId'],
    },
  },
  {
    name: 'create_recipient_group',
    description: 'Create a new recipient group in LogicMonitor (LM) monitoring. ' +
      '\n\n**What this does:** Creates collection of recipients treated as single notification target. Simplifies escalation chains by notifying entire teams at once instead of listing individual recipients. ' +
      '\n\n**When to use:**' +
      '\n- Set up team notifications (email entire team)' +
      '\n- Create on-call rotation groups' +
      '\n- Organize recipients by department/function' +
      '\n- Simplify escalation chain management' +
      '\n- Group multiple contact methods for redundancy' +
      '\n' +
      '\n\n**Required parameters:** ' +
      '\n- name: Group name (e.g., "Database Team", "On-Call Engineers", "NOC Team") ' +
      '\n- recipients: Array of recipient IDs to include in group ' +
      '\n\n**Optional parameters:** ' +
      '\n- description: Group purpose/notes ' +
      '\n\n**Benefits of recipient groups:** ' +
      '\n- **Simpler management:** Update group once vs updating each escalation chain ' +
      '\n- **Team notifications:** Notify all 5 team members by referencing 1 group ' +
      '\n- **Easy rotation updates:** Swap group members without touching escalation chains ' +
      '\n- **Organized:** Group by function (database team, network team, managers) ' +
      '\n\n**Common group patterns:** ' +
      '\n\n**Team notification group:** ' +
      '{name: "Database Team", recipients: [1,2,3,4,5], description: "All database administrators"} ' +
      '// Notify entire team at once ' +
      '\n\n**On-call rotation group:** ' +
      '{name: "Current On-Call", recipients: [10,11], description: "This week\'s on-call engineers"} ' +
      '// Update recipients weekly for rotation ' +
      '\n\n**Multi-channel redundancy group:** ' +
      '{name: "John Doe - All Contacts", recipients: [emailId, smsId, voiceId]} ' +
      '// Email + SMS + Voice for same person ' +
      '\n\n**Escalation level groups:** ' +
      '{name: "Management", recipients: [20,21,22], description: "Engineering managers"} ' +
      '{name: "Executives", recipients: [30,31], description: "CTO, VP Engineering"} ' +
      '\n\n**Department groups:** ' +
      '{name: "Network Operations", recipients: [40,41,42,43]} ' +
      '{name: "Server Team", recipients: [50,51,52]} ' +
      '{name: "Security Team", recipients: [60,61]} ' +
      '\n\n**Workflow example:** ' +
      '1. Create individual recipients for team members ' +
      '2. Create recipient group containing all members ' +
      '3. Use group in escalation chain (simpler than listing 5 individuals) ' +
      '4. Update group membership when team changes (escalation chains unchanged) ' +
      '\n\n**On-call rotation workflow:** ' +
      '1. Create "On-Call This Week" group ' +
      '2. Initially: Add current on-call person ' +
      '3. Use group in escalation chains ' +
      '4. Weekly: Update group members (swap old/new on-call) ' +
      '5. Escalation chains automatically use new on-call person ' +
      '\n\n**Best practices:** ' +
      '\n- Descriptive names: "Team Name - Purpose" ' +
      '\n- One group per team/function ' +
      '\n- Use groups in escalation chains instead of individual recipients ' +
      '\n- Keep groups small (3-10 members) for manageability ' +
      '\n- Document group purpose in description ' +
      '\n\n**Related tools:** "list\\_recipients" (find recipients), "update\\_recipient\\_group" (change members), "create\\_escalation\\_chain" (use groups).',
    annotations: {
      title: 'Create recipient group',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the recipient group',
        },
        description: {
          type: 'string',
          description: 'Description of the group',
        },
        recipientIds: {
          type: 'array',
          description: 'Array of recipient IDs to include in this group',
        },
      },
      additionalProperties: false,
      required: ['name'],
    },
  },
  {
    name: 'update_recipient_group',
    description: 'Update an existing recipient group in LogicMonitor (LM) monitoring. ' +
      '\n\n**What this does:** Modify group membership, name, or description. Changes affect all escalation chains using this group immediately. ' +
      '\n\n**When to use:**' +
      '\n- Update on-call rotation (swap team members)' +
      '\n- Add new team members to notifications' +
      '\n- Remove departed employees' +
      '\n- Reorganize team structure' +
      '\n- Rename group' +
      '\n' +
      '\n\n**Required parameters:** ' +
      '\n- groupId: Recipient group ID (from "list\\_recipient\\_groups") ' +
      '\n\n**Optional parameters (what to change):** ' +
      '\n- name: New group name ' +
      '\n- description: Updated description ' +
      '\n- recipients: New array of recipient IDs (replaces all members) ' +
      '\n\n**Common update scenarios:** ' +
      '\n\n**Update on-call rotation:** ' +
      '{groupId: 123, recipients: [newOnCallId1, newOnCallId2]} // Swap weekly rotation ' +
      '\n\n**Add new team member:** ' +
      '{groupId: 123, recipients: [1,2,3,4,5,6]} // Added recipient 6 ' +
      '\n\n**Remove departed employee:** ' +
      '{groupId: 123, recipients: [1,2,4,5]} // Removed recipient 3 ' +
      '\n\n**Rename group:** ' +
      '{groupId: 123, name: "Database Team - Updated"} ' +
      '\n\n**⚠️ Important:** ' +
      '\n- All escalation chains using this group immediately use new members ' +
      '\n- Removing member: They stop receiving notifications ' +
      '\n- Adding member: They start receiving notifications ' +
      '\n\n**Best practice workflow:** ' +
      '1. Use "get\\_recipient\\_group" to see current members ' +
      '2. Update group with new membership ' +
      '3. Changes take effect for next alerts ' +
      '\n\n**Related tools:** "get\\_recipient\\_group" (review), "list\\_recipient\\_groups" (find group), "list\\_recipients" (find recipients).',
    annotations: {
      title: 'Update recipient group',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        groupId: {
          type: 'number',
          description: 'The ID of the recipient group to update',
        },
        name: {
          type: 'string',
          description: 'New name',
        },
        description: {
          type: 'string',
          description: 'New description',
        },
        recipientIds: {
          type: 'array',
          description: 'Updated array of recipient IDs',
        },
      },
      additionalProperties: false,
      required: ['groupId'],
    },
  },
  {
    name: 'delete_recipient_group',
    description: 'Delete a recipient group from LogicMonitor (LM) monitoring. ' +
      '\n\n**⚠️ WARNING: BREAKS ESCALATION CHAINS** ' +
      '\n- Escalation chains using this group stop notifying those members ' +
      '\n- No error or warning shown ' +
      '\n- Notifications silently fail for stages using this group ' +
      '\n- Cannot be undone ' +
      '\n\n**What this does:** Permanently removes recipient group. Escalation chains referencing this group lose that notification path. ' +
      '\n\n**When to use:**' +
      '\n- Team dissolved/restructured' +
      '\n- Consolidating duplicate groups' +
      '\n- Replacing with individual recipients' +
      '\n- Cleanup unused groups' +
      '\n' +
      '\n\n**Required parameters:** ' +
      '\n- groupId: Recipient group ID to delete (from "list\\_recipient\\_groups") ' +
      '\n\n**Before deleting - CRITICAL CHECKS:** ' +
      '1. Use "list\\_escalation\\_chains" to find chains using this group ' +
      '2. Create replacement group or identify individual recipients ' +
      '3. Update all escalation chains BEFORE deleting group ' +
      '4. Verify no chains reference this group ' +
      '\n\n**Impact of deletion:** ' +
      '\n- Escalation chain stages with this group stop sending notifications ' +
      '\n- No error - notifications silently fail ' +
      '\n- Individual recipients NOT deleted (just group container removed) ' +
      '\n\n**Safe deletion workflow:** ' +
      '1. Find which escalation chains use this group ' +
      '2. Create new group or identify replacement recipients ' +
      '3. Update all escalation chains to use replacement ' +
      '4. Verify updated ' +
      '5. Delete old group ' +
      '\n\n**Best practice:** Migrate escalation chains to replacement group/recipients BEFORE deleting to prevent notification gaps. ' +
      '\n\n**Related tools:** "list\\_escalation\\_chains" (find usage), "create\\_recipient\\_group" (replacement), "update\\_escalation\\_chain" (migrate).',
    annotations: {
      title: 'Delete recipient group',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        groupId: {
          type: 'number',
          description: 'The ID of the recipient group to delete',
        },
      },
      additionalProperties: false,
      required: ['groupId'],
    },
  },

  // Alert Rules
  {
    name: 'list_alert_rules',
    description: 'List all alert rules in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Array of alert rules with: id, name, priority, enabled status, matching conditions (device/datasource/severity filters), escalation chain assigned, suppression settings. ' +
      '\n\n**What are alert rules:** The ROUTING LOGIC that determines "which alerts go to which people." Act as traffic directors: "IF alert matches these conditions, THEN send to this escalation chain." Rules are evaluated in priority order (1st match wins). ' +
      '\n\n**When to use:**' +
      '\n- Audit who gets notified for different alert types' +
      '\n- Understand notification routing logic' +
      '\n- Find rule IDs for modifications' +
      '\n- Troubleshoot "why didn\'t I get alerted?"' +
      '\n- Document alert notification policies' +
      '\n' +
      '\n\n**How alert rules work:** ' +
      'Alert triggers → Rules evaluated in priority order → First matching rule wins → Routes alert to that rule\'s escalation chain → Escalation chain notifies recipients ' +
      '\n\n**Common alert rule patterns:** ' +
      '\n- **Priority 1 (Critical Production):** IF resource/device in "Production" group AND severity = critical → Route to "Critical On-Call" escalation chain ' +
      '\n- **Priority 2 (Database Team):** IF datasource contains "MySQL" OR "PostgreSQL" → Route to "Database Team" escalation chain ' +
      '\n- **Priority 3 (Business Hours):** IF severity = warning → Route to "Business Hours Email" chain (no pages) ' +
      '\n- **Priority 99 (Catch-All):** IF any alert not matched above → Route to "Default NOC" escalation chain ' +
      '\n\n**Use cases:** ' +
      '\n- "Who gets paged for production CPU alerts?" → Find rule matching prod resources/devices+ CPU datasource ' +
      '\n- "Update team notifications" → Modify alert rule to route to different escalation chain ' +
      '\n- "Stop getting low-priority pages" → Check which rule routes those alerts, adjust severity or chain ' +
      '\n\n**Critical for notification troubleshooting:** If alerts aren\'t reaching people, check:' +
      '\n- Does alert match any rule?' +
      '\n- Is matched rule enabled?' +
      '\n- Is escalation chain configured correctly?' +
      '\n' +
      '\n\n**Important:** LogicMonitor may return a negative "total" value due to a known upstream API limitation - this does not mean the request failed. Never use "total" to count or check for results; check the length of the "items" array instead, and use pagination (size/offset) or autoPaginate: true to retrieve all items across pages. ' +
      '\n\n**Related tools:** "get\\_alert\\_rule" (detailed conditions), "list\\_escalation\\_chains" (destination chains), "update\\_alert\\_rule" (modify routing).',
    annotations: {
      title: 'List alert rules',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        ...paginationSchema,
        ...filterSchema,
        ...fieldsSchema,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_alert_rule',
    description: 'Get detailed information about a specific alert rule by ID in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Complete alert rule details: name, priority, enabled status, detailed matching conditions (device groups, datasources, datapoints, instance filters, severity levels), escalation chain assignment, suppression windows, notification settings. ' +
      '\n\n**When to use:**' +
      '\n- Review exact matching logic before modifying rule' +
      '\n- Troubleshoot why alert matched (or didn\'t match) this rule' +
      '\n- Document alert routing policies' +
      '\n- Verify suppression settings' +
      '\n- Check which escalation chain receives matching alerts' +
      '\n' +
      '\n\n**Matching conditions explained:** ' +
      '\n- deviceGroups: Which resource/device folders this rule applies to (e.g., /Production/, /Database Servers/) ' +
      '\n- datasources: Which datasources trigger this rule (e.g., CPU, Memory, AWS\_EC2) ' +
      '\n- datapoints: Specific metrics (e.g., CPUBusyPercent, MemoryUsedPercent) ' +
      '\n- instances: Filter by instance name (e.g., C: drive only, eth0 interface only) ' +
      '\n- severity: Alert levels (critical, error, warn) ' +
      '\n- escalatingChainId: Where matching alerts are routed ' +
      '\n\n**Troubleshooting use cases:** ' +
      '\n- "Why did this CPU alert go to wrong team?" → Check resource/device group + datasource filters ' +
      '\n- "Why didn\'t I get paged?" → Verify alert matches conditions AND check escalation chain ' +
      '\n- "Too many alerts" → Review if conditions too broad, add instance filters ' +
      '\n\n**Workflow:** Use "list\\_alert\\_rules" to find ruleId, then use this tool to review complete matching logic and routing. ' +
      '\n\n**Related tools:** "list\\_alert\\_rules" (find rules), "update\\_alert\\_rule" (modify), "get\\_escalation\\_chain" (check notification chain).',
    annotations: {
      title: 'Get alert rule details',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        ruleId: {
          type: 'number',
          description: 'The ID of the alert rule to retrieve',
        },
        ...fieldsSchema,
      },
      additionalProperties: false,
      required: ['ruleId'],
    },
  },
  {
    name: 'create_alert_rule',
    description: 'Create a new alert rule in LogicMonitor (LM) monitoring. ' +
      '\n\n**What this does:** Defines routing logic determining which alerts go to which escalation chains. Alert rules match alerts by device, datasource, severity, etc., and route to appropriate notification paths. ' +
      '\n\n**When to use:**' +
      '\n- Set up alert notifications for new teams' +
      '\n- Route critical alerts differently than warnings' +
      '\n- Send database alerts to database team' +
      '\n- Configure environment-specific routing (prod vs dev)' +
      '\n- Establish tiered alerting by severity' +
      '\n' +
      '\n\n**Required parameters:** ' +
      '\n- name: Rule name (e.g., "Critical Production Alerts", "Database Team Alerts") ' +
      '\n- priority: Rule evaluation order (1=highest, evaluated first) ' +
      '\n- escalationChainId: Which escalation chain receives matching alerts ' +
      '\n\n**Optional parameters (matching conditions):** ' +
      '\n- deviceGroups: Device folders to match (e.g., "/Production/") ' +
      '\n- datasources: DataSource names to match (e.g., "CPU", "Memory") ' +
      '\n- instances: Instance names to match ' +
      '\n- datapoints: Specific metrics ' +
      '\n- severity: Alert levels (critical, error, warn) ' +
      '\n\n**How alert rules work:** ' +
      'Alert triggers → Rules evaluated in priority order → First matching rule wins → Routes to that rule\'s escalation chain → Escalation chain notifies recipients ' +
      '\n\n**Priority is CRITICAL:** ' +
      '\n- Rules evaluated in priority order (1, 2, 3...) ' +
      '\n- FIRST matching rule wins (stops evaluation) ' +
      '\n- More specific rules need LOWER priority numbers (evaluated first) ' +
      '\n- Catch-all rules need HIGHER priority numbers (evaluated last) ' +
      '\n\n**Common alert rule patterns:** ' +
      '\n\n**Critical production alerts (Priority 1):** ' +
      '{name: "Critical Production", priority: 1, deviceGroups: "/Production/", severity: "critical", escalationChainId: 10} ' +
      '// Critical alerts from production resources/devices→ On-call chain ' +
      '\n\n**Database team alerts (Priority 2):** ' +
      '{name: "Database Team", priority: 2, datasources: "MySQL,PostgreSQL,Oracle", escalationChainId: 20} ' +
      '// Any database datasource → Database team chain ' +
      '\n\n**Network team alerts (Priority 3):** ' +
      '{name: "Network Team", priority: 3, deviceGroups: "/Network resources/Devices/", escalationChainId: 30} ' +
      '// Network resource/device → Network team chain ' +
      '\n\n**Business hours only (Priority 4):** ' +
      '{name: "Non-Critical Warnings", priority: 4, severity: "warn", escalationChainId: 40} ' +
      '// Warnings → Business hours email chain ' +
      '\n\n**Catch-all rule (Priority 99):** ' +
      '{name: "Default - All Alerts", priority: 99, escalationChainId: 50} ' +
      '// Everything else → Default NOC chain ' +
      '\n\n**DeviceGroups filter examples:** ' +
      '\n- "/Production/" - Any resource/device in Production folder ' +
      '\n- "/Production/Web Servers/" - Only production web servers ' +
      '\n- "\*" - All resource/device (catch-all) ' +
      '\n\n**Datasources filter examples:** ' +
      '\n- "CPU" - Any datasource with CPU in name ' +
      '\n- "WinCPU,LinuxCPU" - Specific datasources (comma-separated) ' +
      '\n- "Memory,Disk" - Memory or Disk datasources ' +
      '\n\n**Severity options:** ' +
      '\n- "critical" - Critical alerts only ' +
      '\n- "error" - Error and critical ' +
      '\n- "warn" - All severities (warn, error, critical) ' +
      '\n\n**Best practices:** ' +
      '\n- Start with priority 1 for most specific rules ' +
      '\n- Increment by 10 (1, 10, 20, 30...) to leave room for insertions ' +
      '\n- Always have catch-all rule at high priority (99) as safety net ' +
      '\n- Test rules with sample alerts before production ' +
      '\n- Document why each rule exists (in description) ' +
      '\n- Review rules quarterly as teams/infrastructure changes ' +
      '\n\n**After creation workflow:** ' +
      '1. Create escalation chains first (define WHO gets notified) ' +
      '2. Create alert rules (define WHICH alerts go to which chains) ' +
      '3. Test with sample alerts ' +
      '4. Monitor alert routing to verify working correctly ' +
      '\n\n**Related tools:** "list\\_escalation\\_chains" (create chains first), "update\\_alert\\_rule" (modify), "list\\_alert\\_rules" (view all), "list\\_alerts" (test routing).',
    annotations: {
      title: 'Create alert rule',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the alert rule',
        },
        priority: {
          type: 'number',
          description: 'Priority of the rule (lower number = higher priority, default: 10)',
        },
        escalationChainId: {
          type: 'number',
          description: 'ID of the escalation chain to use for alerts matching this rule',
        },
        devices: {
          type: 'array',
          description: 'Array of resource/device criteria for this rule',
        },
        datasources: {
          type: 'array',
          description: 'Array of datasource criteria for this rule',
        },
      },
      additionalProperties: false,
      required: ['name', 'escalationChainId'],
    },
  },
  {
    name: 'update_alert_rule',
    description: 'Update an existing alert rule in LogicMonitor (LM) monitoring. ' +
      '\n\n**What this does:** Modify rule matching conditions, priority, escalation chain, or enable/disable rule. Changes affect how NEW alerts are routed immediately. ' +
      '\n\n**When to use:**' +
      '\n- Route alerts to different team' +
      '\n- Adjust rule priority' +
      '\n- Update matching conditions' +
      '\n- Temporarily disable rule' +
      '\n- Broaden/narrow alert scope' +
      '\n' +
      '\n\n**Required parameters:** ' +
      '\n- ruleId: Alert rule ID (from "list\\_alert\\_rules") ' +
      '\n\n**Optional parameters (what to change):** ' +
      '\n- name: New rule name ' +
      '\n- priority: Change evaluation order ' +
      '\n- escalationChainId: Route to different chain ' +
      '\n- deviceGroups: Update resource/device scope ' +
      '\n- datasources: Update datasource filter ' +
      '\n- severity: Change severity matching ' +
      '\n- enabled: true (active) or false (disable) ' +
      '\n\n**Common update scenarios:** ' +
      '\n\n**Route to different team:** ' +
      '{ruleId: 123, escalationChainId: 456} // Database alerts → new DB team chain ' +
      '\n\n**Adjust priority (rule conflict):** ' +
      '{ruleId: 123, priority: 5} // Make this rule evaluate earlier ' +
      '\n\n**Temporarily disable rule:** ' +
      '{ruleId: 123, enabled: false} // During team transition ' +
      '\n\n**Broaden scope:** ' +
      '{ruleId: 123, deviceGroups: "/Production/,/Staging/"} // Add staging resource/device ' +
      '\n\n**Narrow scope:** ' +
      '{ruleId: 123, severity: "critical"} // Only critical, not warnings ' +
      '\n\n**⚠️ Important - Immediate Impact:** ' +
      '\n- New alerts immediately use updated rule ' +
      '\n- Active alerts already routed continue with original chain ' +
      '\n- Disabling rule means matching alerts route to next matching rule ' +
      '\n- Priority changes affect which rule wins for overlapping conditions ' +
      '\n\n**Priority update considerations:** ' +
      'If two rules match same alert, LOWER priority number wins. Example: ' +
      '\n- Rule A (priority 1): deviceGroups="/Production/" ' +
      '\n- Rule B (priority 2): datasources="CPU" ' +
      '\n- Alert from Production resource/device with CPU datasource → Rule A wins (priority 1) ' +
      '\n\n**Best practice workflow:** ' +
      '1. Use "get\\_alert\\_rule" to review current configuration ' +
      '2. Use "list\\_alert\\_rules" to check priority conflicts ' +
      '3. Update alert rule ' +
      '4. Monitor new alerts to verify routing correctly ' +
      '\n\n**Related tools:** "get\\_alert\\_rule" (review), "list\\_alert\\_rules" (check priorities), "list\\_alerts" (verify routing).',
    annotations: {
      title: 'Update alert rule',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        ruleId: {
          type: 'number',
          description: 'The ID of the alert rule to update',
        },
        name: {
          type: 'string',
          description: 'New name',
        },
        priority: {
          type: 'number',
          description: 'New priority',
        },
        escalationChainId: {
          type: 'number',
          description: 'New escalation chain ID',
        },
        devices: {
          type: 'array',
          description: 'Updated resource/device criteria',
        },
        datasources: {
          type: 'array',
          description: 'Updated datasource criteria',
        },
      },
      additionalProperties: false,
      required: ['ruleId'],
    },
  },
  {
    name: 'delete_alert_rule',
    description: 'Delete an alert rule from LogicMonitor (LM) monitoring. ' +
      '\n\n**⚠️ WARNING: STOPS ALERT ROUTING** ' +
      '\n- Alerts that matched this rule will route to NEXT matching rule ' +
      '\n- If no other rules match, alerts may go to default catch-all rule ' +
      '\n- If NO rules match, alerts might not notify anyone ' +
      '\n- Cannot be undone ' +
      '\n\n**What this does:** Permanently removes alert rule from routing logic. Alerts previously matched by this rule will be evaluated by remaining rules. ' +
      '\n\n**When to use:**' +
      '\n- Consolidating duplicate rules' +
      '\n- Team/function no longer exists' +
      '\n- Replacing with better-configured rule' +
      '\n- Cleanup after reorganization' +
      '\n' +
      '\n\n**Required parameters:** ' +
      '\n- ruleId: Alert rule ID to delete (from "list\\_alert\\_rules") ' +
      '\n\n**Before deleting - CRITICAL CHECKS:** ' +
      '1. Use "get\\_alert\\_rule" to understand what alerts this rule matches ' +
      '2. Use "list\\_alert\\_rules" to identify which rule will handle these alerts after deletion ' +
      '3. If replacing, create new rule with LOWER priority BEFORE deleting old one ' +
      '4. Verify alert coverage gap won\'t occur ' +
      '\n\n**Impact of deletion:** ' +
      '\n- **Immediate:** New alerts re-evaluate against remaining rules ' +
      '\n- **Next match:** Alerts fall through to next matching rule (higher priority number) ' +
      '\n- **No match:** Alerts might reach catch-all rule or go unnotified ' +
      '\n- **Active alerts:** Continue with original routing (already assigned) ' +
      '\n\n**Safe deletion workflow:** ' +
      '\n\n**Scenario 1: Replacing rule** ' +
      '1. Get current rule details: get_alert_rule(ruleId: OLD_ID) ' +
      '2. Create new rule with improved config and SAME/LOWER priority ' +
      '3. Test: Verify new rule catches expected alerts ' +
      '4. Delete old rule ' +
      '\n\n**Scenario 2: Consolidating duplicate rules** ' +
      '1. Identify which rules match same alerts (review priorities) ' +
      '2. Keep most comprehensive rule ' +
      '3. Update kept rule if needed to cover all cases ' +
      '4. Delete duplicate rules ' +
      '\n\n**Scenario 3: Team disbanded** ' +
      '1. Find what alerts this rule matched ' +
      '2. Identify which team should receive these alerts now ' +
      '3. Create/update rule to route to new team ' +
      '4. Delete old rule ' +
      '\n\n**Priority matters when deleting:** ' +
      'Example: 3 rules with priorities 1, 5, 10 ' +
      '\n- Delete priority 1 → Alerts now match priority 5 (if conditions match) ' +
      '\n- Delete priority 5 → Priority 1 still catches most; priority 10 catches remainder ' +
      '\n- Delete priority 10 (catch-all) → Alerts with no other match might go unnotified! ' +
      '\n\n**⚠️ NEVER delete catch-all rule (high priority like 99) without replacement - creates notification black hole!** ' +
      '\n\n**Best practice:** Create replacement rule BEFORE deleting old rule to ensure continuous alert coverage. ' +
      '\n\n**Related tools:** "get\\_alert\\_rule" (review before delete), "list\\_alert\\_rules" (check coverage), "create\\_alert\\_rule" (replacement).',
    annotations: {
      title: 'Delete alert rule',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        ruleId: {
          type: 'number',
          description: 'The ID of the alert rule to delete',
        },
      },
      additionalProperties: false,
      required: ['ruleId'],
    },
  },

  // OpsNotes
  {
    name: 'list_opsnotes',
    description: 'List all operational notes (OpsNotes) in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Array of OpsNotes with: id, note text, timestamp (epoch), who created it, tags, scope (applies to which resources/devices/groups), related SDTs. ' +
      '\n\n**What are OpsNotes:** Timestamped operational annotations displayed on graphs and dashboards. Document changes, deployments, maintenance, incidents - anything that might affect metrics. Appear as vertical lines on metric graphs at the time they occurred. ' +
      '\n\n**When to use:**' +
      '\n- Correlate metric changes with operational events' +
      '\n- Document deployments/changes' +
      '\n- Create timeline of incidents and responses' +
      '\n- Track maintenance activities' +
      '\n- Generate operational reports' +
      '\n' +
      '\n\n**Use cases and examples:** ' +
      '\n\n**Deployments:** ' +
      '\n- "Deployed v2.5.0 to production" (explains CPU spike at deploy time) ' +
      '\n- "Database schema migration" (explains slow queries during migration) ' +
      '\n\n**Incidents:** ' +
      '\n- "Customer reported slow load times - investigating" ' +
      '\n- "Found memory leak, restarting services" ' +
      '\n- "Incident resolved - bad cache configuration" ' +
      '\n\n**Maintenance:** ' +
      '\n- "Scaled from 10 to 15 instances" ' +
      '\n- "Updated SSL certificates" ' +
      '\n- "Cleared old logs, freed 500GB disk" ' +
      '\n\n**Benefits:** ' +
      '\n- **Troubleshooting:** "Latency increased at 2pm" → Check OpsNotes: "Deploy happened at 2pm" ' +
      '\n- **Correlation:** Understand cause of metric anomalies ' +
      '\n- **Documentation:** Automatic operational timeline ' +
      '\n- **Communication:** Share what happened with team ' +
      '\n\n**Common filter patterns:** ' +
      '\n- By time: filter:"happenedOn>1730851200" (recent notes) ' +
      '\n- By tags: filter:"tags~*deployment*" ' +
      '\n- By device: filter:"monitorObjectName~*prod-web*" ' +
      '\n\n**Displayed on:** Graphs, dashboards, resource/device pages - visible wherever metrics are shown. ' +
      '\n\n**Important:** LogicMonitor may return a negative "total" value due to a known upstream API limitation - this does not mean the request failed. Never use "total" to count or check for results; check the length of the "items" array instead, and use pagination (size/offset) or autoPaginate: true to retrieve all items across pages. ' +
      '\n\n**Related tools:** "get\\_opsnote" (details), "create\\_opsnote" (add new), "create\\_device\\_sdt" (maintenance windows).',
    annotations: {
      title: 'List OpsNotes',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        ...paginationSchema,
        ...filterSchema,
        ...fieldsSchema,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_opsnote',
    description: 'Get detailed information about a specific operational note by ID in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Complete OpsNote details: note text, timestamp, creator, tags, scope (resources/devices/groups affected), related SDTs, linked resources. ' +
      '\n\n**When to use:**' +
      '\n- Get full note details after finding ID via list' +
      '\n- Review what was documented at specific time' +
      '\n- Check scope of operational event' +
      '\n- Verify linked resources' +
      '\n' +
      '\n\n**Workflow:** Use "list\\_opsnotes" to find note ID, then use this tool for complete details. ' +
      '\n\n**Related tools:** "list\\_opsnotes" (find notes), "create\\_opsnote" (add new), "update\\_opsnote" (modify).',
    annotations: {
      title: 'Get OpsNote details',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        opsNoteId: {
          type: 'string',
          description: 'The ID of the OpsNote to retrieve',
        },
        ...fieldsSchema,
      },
      additionalProperties: false,
      required: ['opsNoteId'],
    },
  },
  {
    name: 'create_opsnote',
    description: 'Create a new operational note (OpsNote) in LogicMonitor (LM) monitoring. ' +
      '\n\n**What this does:** Creates timestamped annotation displayed on graphs/dashboards at specific time. Documents changes, deployments, incidents, maintenance - anything that might correlate with metric changes. ' +
      '\n\n**When to use:**' +
      '\n- Document deployments/releases' +
      '\n- Track incident timelines' +
      '\n- Note configuration changes' +
      '\n- Record maintenance windows' +
      '\n- Annotate known events that affect metrics' +
      '\n' +
      '\n\n**Required parameters:** ' +
      '\n- note: The annotation text (what happened) ' +
      '\n- timestamp: When it happened (epoch milliseconds) ' +
      '\n\n**Optional parameters (scope - what it applies to):** ' +
      '\n- deviceId: Specific resource/device (shows on that device\'s graphs) ' +
      '\n- deviceGroupId: Device group (shows on all resource/device in group) ' +
      '\n- websiteId: Website monitor ' +
      '\n- tags: Keywords for filtering/searching (e.g., ["deployment", "database"]) ' +
      '\n\n**Why OpsNotes are valuable:** ' +
      '\n- **Troubleshooting:** Quickly see "what changed" around metric spikes/drops ' +
      '\n- **Correlation:** Link operational events to performance impact ' +
      '\n- **Documentation:** Automatic timeline of changes ' +
      '\n- **Team communication:** Share context on dashboards ' +
      '\n\n**Common OpsNote patterns:** ' +
      '\n\n**Deployment tracking:** ' +
      '{note: "Deployed v2.5.0 to production web servers - build #12345", timestamp: 1699889400000, deviceGroupId: 123, tags: ["deployment", "web"]} ' +
      '// Shows on all web server graphs ' +
      '\n\n**Incident documentation:** ' +
      '{note: "Incident INC-5678: Database performance issue - investigating", timestamp: 1699890000000, deviceId: 456, tags: ["incident", "database"]} ' +
      '{note: "INC-5678: Root cause - slow query. Optimized index.", timestamp: 1699891800000, deviceId: 456, tags: ["incident", "resolved"]} ' +
      '// Timeline of incident on affected resource/device ' +
      '\n\n**Configuration changes:** ' +
      '{note: "Updated Nginx config - increased worker processes from 4 to 8", timestamp: 1699892000000, deviceId: 789, tags: ["config-change"]} ' +
      '{note: "Applied firewall rule changes - blocked port 8080", timestamp: 1699893000000, deviceGroupId: 100, tags: ["security", "firewall"]} ' +
      '\n\n**Maintenance windows:** ' +
      '{note: "Started OS patching on all Linux servers", timestamp: 1699894000000, deviceGroupId: 200, tags: ["maintenance", "patching"]} ' +
      '{note: "Completed OS patching - all servers rebooted", timestamp: 1699898000000, deviceGroupId: 200, tags: ["maintenance", "completed"]} ' +
      '\n\n**Known events:** ' +
      '{note: "AWS announced maintenance in us-east-1", timestamp: 1699895000000, tags: ["aws", "external"]} ' +
      '{note: "Batch job running - expected high CPU", timestamp: 1699896000000, deviceId: 111, tags: ["batch-job", "expected"]} ' +
      '\n\n**Scope options explained:** ' +
      '\n- **deviceId:** Shows on specific resource/device\'s graphs only ' +
      '\n- **deviceGroupId:** Shows on all resource/device in that group ' +
      '\n- **websiteId:** Shows on website monitoring graphs ' +
      '\n- **No scope (global):** Shows on all graphs (use sparingly) ' +
      '\n\n**Timestamp tips:** ' +
      '\n- Use actual event time (not current time) for accurate correlation ' +
      '\n- Epoch milliseconds: Date.now() in JavaScript, time.time()*1000 in Python ' +
      '\n- For past events: Calculate epoch milliseconds for that date/time ' +
      '\n\n**Best practices:** ' +
      '\n- **Be specific:** "Deployed v2.5.0" not "deployed" ' +
      '\n- **Include identifiers:** Build numbers, ticket IDs, version numbers ' +
      '\n- **Use tags:** Makes finding related notes easy ' +
      '\n- **Scope appropriately:** Don\'t make global notes for single resource/device changes ' +
      '\n- **Document resolution:** Add note when incident resolved, not just when started ' +
      '\n\n**Workflow examples:** ' +
      '\n\n**During deployment:** ' +
      '1. Start: Create note "Deployment started - v2.5.0" ' +
      '2. Progress: Create note "Database migrations complete" ' +
      '3. Complete: Create note "Deployment complete - all services healthy" ' +
      '\n\n**During incident:** ' +
      '1. Detection: Create note "High CPU detected - investigating" ' +
      '2. Updates: Add notes as you discover findings ' +
      '3. Resolution: Create note "RESOLVED: Killed runaway process" ' +
      '\n\n**After creation:** ' +
      'OpsNotes appear as vertical lines on graphs at the timestamp. Hover to see note text. Use "list\\_opsnotes" to search/review notes. ' +
      '\n\n**Related tools:** "list\\_opsnotes" (view all notes), "update\\_opsnote" (modify), "delete\\_opsnote" (remove).',
    annotations: {
      title: 'Create OpsNote',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        note: {
          type: 'string',
          description: 'The note text content',
        },
        scopes: {
          type: 'array',
          description: 'Array of scopes (resources/devices, groups) this note applies to',
        },
        tags: {
          type: 'array',
          description: 'Array of tags for categorizing the note',
        },
        happenOnInSec: {
          type: 'number',
          description: 'Timestamp (in seconds since epoch) when the event occurred',
        },
      },
      additionalProperties: false,
      required: ['note'],
    },
  },
  {
    name: 'update_opsnote',
    description: 'Update an existing operational note in LogicMonitor (LM) monitoring. ' +
      '\n\n**What this does:** Modify OpsNote text, timestamp, tags, or scope. Useful for correcting mistakes or adding details after initial creation. ' +
      '\n\n**When to use:**' +
      '\n- Fix typos in note text' +
      '\n- Add more details after investigation' +
      '\n- Correct timestamp' +
      '\n- Update tags for better organization' +
      '\n- Change scope (different device/group)' +
      '\n' +
      '\n\n**Required parameters:** ' +
      '\n- opsNoteId: OpsNote ID (from "list\\_opsnotes") ' +
      '\n\n**Optional parameters (what to change):** ' +
      '\n- note: New note text ' +
      '\n- timestamp: Corrected time (epoch milliseconds) ' +
      '\n- tags: Updated tag array ' +
      '\n- deviceId: Change to different resource/device ' +
      '\n- deviceGroupId: Change to different group ' +
      '\n\n**Common update scenarios:** ' +
      '\n\n**Add more details after investigation:** ' +
      '{opsNoteId: 123, note: "Deployed v2.5.0 - ROLLBACK at 3:45pm due to memory leak in new code"} ' +
      '// Updated after discovering issue ' +
      '\n\n**Fix typo:** ' +
      '{opsNoteId: 456, note: "Database migration completed successfully"} ' +
      '// Fixed spelling error ' +
      '\n\n**Correct timestamp:** ' +
      '{opsNoteId: 789, timestamp: 1699899000000} ' +
      '// Used wrong time initially ' +
      '\n\n**Add tags for better organization:** ' +
      '{opsNoteId: 111, tags: ["deployment", "rollback", "production", "critical"]} ' +
      '// Added more descriptive tags ' +
      '\n\n**Best practice workflow:** ' +
      '1. Use "list\\_opsnotes" to find note to update ' +
      '2. Update with new information ' +
      '3. Graph annotations update immediately ' +
      '\n\n**Related tools:** "list\\_opsnotes" (find note), "create\\_opsnote" (create new), "delete\\_opsnote" (remove).',
    annotations: {
      title: 'Update OpsNote',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        opsNoteId: {
          type: 'string',
          description: 'The ID of the OpsNote to update',
        },
        note: {
          type: 'string',
          description: 'Updated note text',
        },
        scopes: {
          type: 'array',
          description: 'Updated scopes',
        },
        tags: {
          type: 'array',
          description: 'Updated tags',
        },
      },
      additionalProperties: false,
      required: ['opsNoteId'],
    },
  },
  {
    name: 'delete_opsnote',
    description: 'Delete an operational note from LogicMonitor (LM) monitoring. ' +
      '\n\n**What this does:** Permanently removes OpsNote. Annotation disappears from graphs and dashboards immediately. ' +
      '\n\n**When to use:**' +
      '\n- Created note by mistake' +
      '\n- Note contains incorrect information' +
      '\n- Note is no longer relevant' +
      '\n- Cleanup old test notes' +
      '\n' +
      '\n\n**Required parameters:** ' +
      '\n- opsNoteId: OpsNote ID to delete (from "list\\_opsnotes") ' +
      '\n\n**Impact:** ' +
      '\n- Note removed from all graphs and dashboards immediately ' +
      '\n- Historical record deleted (cannot be recovered) ' +
      '\n- Other notes unaffected ' +
      '\n\n**Common deletion scenarios:** ' +
      '\n- Wrong device: Created note on wrong resource/device - delete and recreate on correct one ' +
      '\n- Wrong time: Timestamp significantly wrong - easier to delete and recreate ' +
      '\n- Test note: Remove test annotations after experimenting ' +
      '\n- Irrelevant: "Testing new deployment process" after test completed ' +
      '\n\n**Best practice:** ' +
      'Consider updating note instead of deleting if it just needs correction. Deletion removes historical record. ' +
      '\n\n**Workflow:** ' +
      '1. Use "list\\_opsnotes" to find note ' +
      '2. Verify correct note before deleting ' +
      '3. Delete note ' +
      '4. Annotation disappears from graphs immediately ' +
      '\n\n**Related tools:** "list\\_opsnotes" (find note), "update\\_opsnote" (alternative to deletion), "create\\_opsnote" (recreate if needed).',
    annotations: {
      title: 'Delete OpsNote',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        opsNoteId: {
          type: 'string',
          description: 'The ID of the OpsNote to delete',
        },
      },
      additionalProperties: false,
      required: ['opsNoteId'],
    },
  },

  // Services
  {
    name: 'list_services',
    description: 'List all business services in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Array of services with: id, name, description, health status, dependencies, monitored resources, service level objectives (SLOs), availability percentage. ' +
      '\n\n**What are services:** Business-level monitoring constructs that aggregate multiple resources/devices/resources into a single health status. Represent customer-facing services, applications, or business processes. Example: "E-Commerce Platform" service includes web servers, databases, load balancers, and APIs - one health indicator for entire platform. ' +
      '\n\n**When to use:**' +
      '\n- Monitor business service health vs individual resource/device health' +
      '\n- Track SLA compliance for customer-facing services' +
      '\n- Understand service dependencies' +
      '\n- Create business-level dashboards' +
      '\n- Report on application availability' +
      '\n' +
      '\n\n**Service health calculation:** ' +
      'Service health = Aggregate of all dependent resources. If critical resource fails, service status = down. Allows stakeholders to see "Is the application working?" instead of "Is server X working?" ' +
      '\n\n**Use cases and examples:** ' +
      '\n\n**Customer-facing services:** ' +
      '\n- "E-Commerce Website" - Web servers + database + payment gateway + CDN ' +
      '\n- "Mobile App Backend" - API servers + auth service + push notifications ' +
      '\n- "SaaS Platform" - All infrastructure for multi-tenant application ' +
      '\n\n**Internal services:** ' +
      '\n- "Employee VPN" - VPN servers + RADIUS auth + firewall ' +
      '\n- "Corporate Email" - Mail servers + spam filter + archiving ' +
      '\n- "CI/CD Pipeline" - Jenkins + artifact storage + deployment agents ' +
      '\n\n**Benefits:** ' +
      '\n- **Business perspective:** Non-technical stakeholders understand "Shopping Cart is 99.5% available" ' +
      '\n- **SLA tracking:** Measure uptime for customer SLAs ' +
      '\n- **Root cause:** When service is down, see which specific resource failed ' +
      '\n- **Dependencies:** Visualize what resources comprise a service ' +
      '\n\n**Common filter patterns:** ' +
      '\n- By status: filter:"status:normal" or filter:"status:dead" ' +
      '\n- By name: filter:"name~*production*" ' +
      '\n\n**Workflow:** Use this tool to find services, then "get\\_service" for detailed dependency tree and health status. ' +
      '\n\n**Important:** LogicMonitor may return a negative "total" value due to a known upstream API limitation - this does not mean the request failed. Never use "total" to count or check for results; check the length of the "items" array instead, and use pagination (size/offset) or autoPaginate: true to retrieve all items across pages. ' +
      '\n\n**Related tools:** "get\\_service" (details and dependencies), "list\\_service\\_groups" (organization), "create\\_service" (define new business service).',
    annotations: {
      title: 'List services',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        ...paginationSchema,
        ...filterSchema,
        ...fieldsSchema,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_service',
    description: 'Get detailed information about a specific service by ID in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Complete service details: name, description, health status, dependency tree (all resources comprising service), SLA/SLO configuration, availability statistics, alert rules, service group. ' +
      '\n\n**When to use:**' +
      '\n- Review service dependencies (what resources are included)' +
      '\n- Check current health status and root cause' +
      '\n- Verify SLA/SLO configuration' +
      '\n- Troubleshoot service downtime' +
      '\n- Understand service architecture' +
      '\n' +
      '\n\n**Key information returned:** ' +
      '\n- **Dependency tree:** All resources/devices/resources that comprise this service ' +
      '\n- **Health calculation:** How service status is determined (e.g., "If ANY web server is down, service is degraded") ' +
      '\n- **Current status:** Operational / Degraded / Down ' +
      '\n- **SLA metrics:** Uptime percentage, outage history ' +
      '\n- **Alert configuration:** When to alert on service issues ' +
      '\n\n**Troubleshooting workflow:** ' +
      'Service shows "Down" → Check dependency tree → Identify which specific resource(s) failed → Address those resources → Service auto-recovers when dependencies healthy ' +
      '\n\n**Workflow:** Use "list\\_services" to find serviceId, then use this tool for complete dependency analysis. ' +
      '\n\n**Related tools:** "list\\_services" (find service), "update\\_service" (modify dependencies), "list\\_resources" (see health of dependent resources).',
    annotations: {
      title: 'Get service details',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        serviceId: {
          type: 'number',
          description: 'The ID of the service to retrieve',
        },
        ...fieldsSchema,
      },
      additionalProperties: false,
      required: ['serviceId'],
    },
  },
  {
    name: 'create_service',
    description: 'Create a new business service in LogicMonitor (LM) monitoring. ' +
      '\n\n**What this does:** Creates business-level service aggregating multiple resources into single health status. Think "E-commerce Website" service composed of web servers, databases, load balancers, etc. Service health calculated from member resource/device health. ' +
      '\n\n**When to use:**' +
      '\n- Monitor application-level health (not just infrastructure)' +
      '\n- Create business-facing dashboards' +
      '\n- SLA tracking for customer-facing services' +
      '\n- Executive reporting (business view, not technical)' +
      '\n- Complex dependency modeling' +
      '\n' +
      '\n\n**Required parameters:** ' +
      '\n- name: Service name (e.g., "E-commerce Website", "Payment API", "Mobile App Backend") ' +
      '\n- groupId: Service group ID for organization (from "list\\_service\\_groups") ' +
      '\n\n**Optional parameters:** ' +
      '\n- description: Service purpose/details ' +
      '\n- resources/devices: Array of resource/device IDs that comprise this service ' +
      '\n- alertStatus: Service alert status (calculated or manual) ' +
      '\n\n**What are business services?** ' +
      'Business services represent application/service from business perspective, not infrastructure perspective. Examples: ' +
      '\n- "E-commerce Website" = web servers + database + Redis + CDN ' +
      '\n- "Payment Processing" = payment API + payment database + fraud detection service ' +
      '\n- "Mobile App Backend" = API gateway + app servers + auth service + database ' +
      '\n\n**Why use services?** ' +
      '\n- **Business view:** Executives care about "Is checkout working?" not "Is web-01 up?" ' +
      '\n- **SLA tracking:** Monitor service availability for SLA compliance ' +
      '\n- **Dependencies:** Model which resource/device affect which services ' +
      '\n- **Simplified dashboards:** Show service health, not 50 individual resource/device ' +
      '\n- **Impact analysis:** "Which services affected when database down?" ' +
      '\n\n**Service health calculation:** ' +
      'Service health = rollup of member resource/device health: ' +
      '\n- All resource/device healthy → Service healthy (green) ' +
      '\n- Any resource/device warning → Service warning (yellow) ' +
      '\n- Any resource/device critical → Service critical (red) ' +
      '\n- Any resource/device dead → Service dead (gray) ' +
      '\n\n**Common service patterns:** ' +
      '\n\n**Web application service:** ' +
      '{name: "E-commerce Website", groupId: 10, description: "Customer-facing e-commerce platform", resources/devices: [webserver1Id, webserver2Id, dbserverId, redisId, loadbalancerId]} ' +
      '// All components needed for website to function ' +
      '\n\n**API service:** ' +
      '{name: "Payment API v2", groupId: 20, description: "Payment processing API - SLA 99.9%", resources/devices: [apiserver1Id, apiserver2Id, paymentDbId, queueId]} ' +
      '// API servers + supporting infrastructure ' +
      '\n\n**Tiered application:** ' +
      '// Create separate services per tier for granular monitoring ' +
      '{name: "Mobile App - Web Tier", groupId: 30, resources/devices: [nginx1Id, nginx2Id]} ' +
      '{name: "Mobile App - App Tier", groupId: 30, resources/devices: [app1Id, app2Id, app3Id]} ' +
      '{name: "Mobile App - Data Tier", groupId: 30, resources/devices: [db1Id, db2Id, cacheId]} ' +
      '\n\n**Multi-region service:** ' +
      '{name: "Global API - US-East", groupId: 40, resources/devices: [usEastDevices...]} ' +
      '{name: "Global API - EU-West", groupId: 40, resources/devices: [euWestDevices...]} ' +
      '{name: "Global API - Asia-Pacific", groupId: 40, resources/devices: [asiaPacificDevices...]} ' +
      '\n\n**Workflow for creating services:** ' +
      '1. Identify business-critical application/service ' +
      '2. List all resources/devices/components required for service to function ' +
      '3. Create service group for organization (if needed) ' +
      '4. Create service with all member resource/device ' +
      '5. Create dashboard showing service health ' +
      '6. Configure service-level alerting ' +
      '\n\n**Best practices:** ' +
      '\n- **Business names:** "Customer Portal" not "Web Stack 3" ' +
      '\n- **Complete membership:** Include ALL critical dependencies ' +
      '\n- **Granular services:** One service per distinct business function ' +
      '\n- **Use service groups:** Organize by department, product, or region ' +
      '\n- **Document SLAs:** Add SLA targets to description ' +
      '\n\n**After creation:** ' +
      'Service appears in Services view with aggregated health status. Use in dashboards to show business-level health. Use "update\\_service" to modify membership as infrastructure changes. ' +
      '\n\n**Related tools:** "list\\_service\\_groups" (create groups first), "update\\_service" (modify), "list\\_resources" (find resources/devices), "create\\_service\\_dashboard" (visualize).',
    annotations: {
      title: 'Create service',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the service',
        },
        type: {
          type: 'string',
          description: 'Type of service (default: "default")',
        },
        description: {
          type: 'string',
          description: 'Description of the service',
        },
        groupId: {
          type: 'number',
          description: 'ID of the service group to place this service in',
        },
      },
      additionalProperties: false,
      required: ['name'],
    },
  },
  {
    name: 'update_service',
    description: 'Update an existing business service in LogicMonitor (LM) monitoring. ' +
      '\n\n**What this does:** Modify service name, description, or member resources/devices. Updates service health calculation when membership changes. ' +
      '\n\n**When to use:**' +
      '\n- Add/remove resource/device as infrastructure changes' +
      '\n- Rename service' +
      '\n- Update description/SLA' +
      '\n- Reorganize service structure' +
      '\n- Reflect architecture changes' +
      '\n' +
      '\n\n**Required parameters:** ' +
      '\n- serviceId: Service ID (from "list\\_services") ' +
      '\n\n**Optional parameters (what to change):** ' +
      '\n- name: New service name ' +
      '\n- description: Updated description ' +
      '\n- resources/devices: New array of resource/device IDs (replaces all members) ' +
      '\n- groupId: Move to different service group ' +
      '\n\n**Common update scenarios:** ' +
      '\n\n**Add new infrastructure:** ' +
      '{serviceId: 123, resources/devices: [existingDevices..., newDb2Id, newCache2Id]} ' +
      '// Added replica database and cache to service ' +
      '\n\n**Remove decommissioned resources/devices:** ' +
      '{serviceId: 123, resources/devices: [dev1, dev2, dev4]} // Removed dev3 (decomm) ' +
      '\n\n**Rename service:** ' +
      '{serviceId: 123, name: "E-commerce Platform v2"} ' +
      '\n\n**Update SLA documentation:** ' +
      '{serviceId: 123, description: "Customer-facing checkout - SLA 99.95% (updated Q4 2024)"} ' +
      '\n\n**⚠️ Important:** ' +
      'Updating resource/device array REPLACES all members. Include existing + new resources/devices, or resource/device will be removed from service. ' +
      '\n\n**Best practice workflow:** ' +
      '1. Use "get\\_service" to see current membership ' +
      '2. Update service with complete resource/device list ' +
      '3. Service health recalculates immediately ' +
      '\n\n**Related tools:** "get\\_service" (review), "list\\_services" (find service), "list\\_resources" (find resources/devices).',
    annotations: {
      title: 'Update service',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        serviceId: {
          type: 'number',
          description: 'The ID of the service to update',
        },
        name: {
          type: 'string',
          description: 'New name',
        },
        description: {
          type: 'string',
          description: 'New description',
        },
      },
      additionalProperties: false,
      required: ['serviceId'],
    },
  },
  {
    name: 'delete_service',
    description: 'Delete a business service from LogicMonitor (LM) monitoring. ' +
      '\n\n**What this does:** Permanently removes service. Service disappears from dashboards and Services view. Member resource/device remain unaffected (only service container deleted). ' +
      '\n\n**When to use:**' +
      '\n- Application/service decommissioned' +
      '\n- Service no longer needed' +
      '\n- Consolidating duplicate services' +
      '\n- Restructuring service hierarchy' +
      '\n' +
      '\n\n**Required parameters:** ' +
      '\n- serviceId: Service ID to delete (from "list\\_services") ' +
      '\n\n**Impact:** ' +
      '\n- Service removed from all dashboards ' +
      '\n- Service health history deleted ' +
      '\n- Member resource/device NOT deleted (remain in monitoring) ' +
      '\n- Cannot be undone ' +
      '\n\n**Common deletion scenarios:** ' +
      '\n- Application decommissioned: Delete service after shutting down application ' +
      '\n- Consolidation: Merge multiple services into one, delete duplicates ' +
      '\n- Restructuring: Delete old service structure, create new one ' +
      '\n\n**Before deleting:** ' +
      '1. Check if service used in dashboards (will break dashboard widgets) ' +
      '2. Check if service used in alert rules (will break routing) ' +
      '3. Verify service no longer represents active business function ' +
      '\n\n**Best practice:** Update dashboards to remove service widgets BEFORE deleting service. ' +
      '\n\n**Related tools:** "list\\_services" (find service), "get\\_service" (verify before delete), "list\\_dashboards" (check usage).',
    annotations: {
      title: 'Delete service',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        serviceId: {
          type: 'number',
          description: 'The ID of the service to delete',
        },
      },
      additionalProperties: false,
      required: ['serviceId'],
    },
  },

  // Service Groups
  {
    name: 'list_service_groups',
    description: 'List all service groups (folders) in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Array of service groups with: id, name, parentId, full path, description, number of services, number of subgroups. ' +
      '\n\n**What are service groups:** Organizational folders for business services, similar to resource/device groups for resources/devices. Used to categorize services by business unit, region, customer, or application stack. ' +
      '\n\n**When to use:**' +
      '\n- Browse service organization before creating services' +
      '\n- Find group IDs for service operations' +
      '\n- Understand service hierarchy' +
      '\n- Navigate to specific service folders' +
      '\n' +
      '\n\n**Common organization patterns:** ' +
      '\n- By business unit: "E-Commerce", "Marketing Platform", "Internal IT" ' +
      '\n- By customer: "Customer A Services", "Customer B Services" (MSP environments) ' +
      '\n- By region: "APAC Services", "EMEA Services", "Americas Services" ' +
      '\n- By tier: "Tier 1 Critical", "Tier 2 Standard", "Tier 3 Best Effort" ' +
      '\n\n**Use cases:** ' +
      '\n- Organize services for different stakeholders ' +
      '\n- Group services by SLA tiers ' +
      '\n- Separate internal vs customer-facing services ' +
      '\n- Structure multi-tenant service monitoring ' +
      '\n\n**Workflow:** Use this tool to browse hierarchy, then "list\\_services" filtered by groupId to see services in specific folder. ' +
      '\n\n**Important:** LogicMonitor may return a negative "total" value due to a known upstream API limitation - this does not mean the request failed. Never use "total" to count or check for results; check the length of the "items" array instead, and use pagination (size/offset) or autoPaginate: true to retrieve all items across pages. ' +
      '\n\n**Related tools:** "get\\_service\\_group" (details), "list\\_services" (services in group), "create\\_service\\_group" (create folder).',
    annotations: {
      title: 'List service groups',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        ...paginationSchema,
        ...filterSchema,
        ...fieldsSchema,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_service_group',
    description: 'Get detailed information about a specific service group by ID in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Complete service group details: name, full path, parentId, description, number of services (direct and total), number of subgroups. ' +
      '\n\n**When to use:**' +
      '\n- Get group path for documentation' +
      '\n- Check service membership counts' +
      '\n- Verify group hierarchy' +
      '\n- Review group structure before creating services' +
      '\n' +
      '\n\n**Workflow:** Use "list\\_service\\_groups" to find groupId, then use this tool for complete details. ' +
      '\n\n**Related tools:** "list\\_service\\_groups" (find groups), "list\\_services" (services in group), "create\\_service\\_group" (create new).',
    annotations: {
      title: 'Get service group details',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        groupId: {
          type: 'number',
          description: 'The ID of the service group to retrieve',
        },
        ...fieldsSchema,
      },
      additionalProperties: false,
      required: ['groupId'],
    },
  },
  {
    name: 'create_service_group',
    description: 'Create a new service group (folder) in LogicMonitor (LM) monitoring. ' +
      '\n\n**What this does:** Creates organizational folder for business services. Like resource/device groups for resources/devices, service groups organize services by team, product, region, or function. ' +
      '\n\n**When to use:**' +
      '\n- Organize services before creating them' +
      '\n- Group services by department/team' +
      '\n- Separate services by product line' +
      '\n- Organize by region/environment' +
      '\n- Create service hierarchy' +
      '\n' +
      '\n\n**Required parameters:** ' +
      '\n- name: Group name (e.g., "E-commerce Services", "Payment Services", "Mobile App Services") ' +
      '\n\n**Optional parameters:** ' +
      '\n- description: Group purpose ' +
      '\n- parentId: Parent group ID for nested hierarchy ' +
      '\n\n**Common service group patterns:** ' +
      '\n\n**By department/team:** ' +
      '{name: "Platform Engineering Services", description: "Core platform services"} ' +
      '{name: "Data Engineering Services", description: "Data pipelines and analytics"} ' +
      '{name: "Customer Services", description: "Customer-facing applications"} ' +
      '\n\n**By product line:** ' +
      '{name: "E-commerce Platform", description: "Online store services"} ' +
      '{name: "Mobile Banking", description: "Mobile banking app services"} ' +
      '{name: "Enterprise Suite", description: "B2B product services"} ' +
      '\n\n**By environment:** ' +
      '{name: "Production Services", description: "Customer-facing production"} ' +
      '{name: "Staging Services", description: "Pre-production testing"} ' +
      '\n\n**Nested hierarchy example:** ' +
      '1. Create parent: {name: "All Services"} → groupId: 100 ' +
      '2. Create children: {name: "Web Services", parentId: 100} ' +
      '3. Create children: {name: "API Services", parentId: 100} ' +
      '4. Create children: {name: "Data Services", parentId: 100} ' +
      '\n\n**Best practices:** ' +
      '\n- Create groups before creating services ' +
      '\n- Use descriptive names matching organizational structure ' +
      '\n- Organize by how business views applications ' +
      '\n- Keep hierarchy shallow (2-3 levels max) ' +
      '\n\n**After creation:** Use groupId when creating services to place them in appropriate folder. ' +
      '\n\n**Related tools:** "list\\_service\\_groups" (view hierarchy), "create\\_service" (add services to group), "update\\_service\\_group" (modify).',
    annotations: {
      title: 'Create service group',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the service group',
        },
        description: {
          type: 'string',
          description: 'Description',
        },
        parentId: {
          type: 'number',
          description: 'Parent group ID (use 1 for root)',
        },
      },
      additionalProperties: false,
      required: ['name'],
    },
  },
  {
    name: 'update_service_group',
    description: 'Update an existing service group in LogicMonitor (LM) monitoring. ' +
      '\n\n**What this does:** Modify group name, description, or parent (move in hierarchy). Does not affect services within group. ' +
      '\n\n**When to use:**' +
      '\n- Rename group after reorg' +
      '\n- Update description' +
      '\n- Move group in hierarchy' +
      '\n- Reorganize service structure' +
      '\n' +
      '\n\n**Required parameters:** ' +
      '\n- groupId: Service group ID (from "list\\_service\\_groups") ' +
      '\n\n**Optional parameters (what to change):** ' +
      '\n- name: New group name ' +
      '\n- description: Updated description ' +
      '\n- parentId: New parent group (moves group) ' +
      '\n\n**Common update scenarios:** ' +
      '\n\n**Rename after reorg:** ' +
      '{groupId: 123, name: "Platform Services (Cloud Native)"} ' +
      '\n\n**Move in hierarchy:** ' +
      '{groupId: 123, parentId: 456} // Move to different parent ' +
      '\n\n**Update description:** ' +
      '{groupId: 123, description: "Updated to include new microservices"} ' +
      '\n\n**Best practice workflow:** ' +
      '1. Use "list\\_service\\_groups" to find group ' +
      '2. Update group settings ' +
      '3. Services within group unaffected ' +
      '\n\n**Related tools:** "list\\_service\\_groups" (find group), "get\\_service\\_group" (verify), "list\\_services" (services in group).',
    annotations: {
      title: 'Update service group',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        groupId: {
          type: 'number',
          description: 'The ID of the service group to update',
        },
        name: {
          type: 'string',
          description: 'New name',
        },
        description: {
          type: 'string',
          description: 'New description',
        },
      },
      additionalProperties: false,
      required: ['groupId'],
    },
  },
  {
    name: 'delete_service_group',
    description: 'Delete a service group from LogicMonitor (LM) monitoring. ' +
      '\n\n**⚠️ WARNING: CHECK FOR SERVICES FIRST** ' +
      '\n- Cannot delete group containing services ' +
      '\n- Cannot delete group containing subgroups ' +
      '\n- Must be empty to delete ' +
      '\n\n**What this does:** Removes empty service group folder. Group must have no services and no subgroups. ' +
      '\n\n**When to use:**' +
      '\n- Cleanup empty groups after reorganization' +
      '\n- Remove unused organizational folders' +
      '\n- Simplify service hierarchy' +
      '\n' +
      '\n\n**Required parameters:** ' +
      '\n- groupId: Service group ID to delete (from "list\\_service\\_groups") ' +
      '\n\n**Before deleting:** ' +
      '1. Move all services to different group (or delete services) ' +
      '2. Move or delete all subgroups ' +
      '3. Verify group is empty ' +
      '\n\n**Safe deletion workflow:** ' +
      '1. Use "list\\_services" to find services in this group ' +
      '2. Move services: update_service(serviceId: X, groupId: NEW_GROUP) ' +
      '3. Check for subgroups in group ' +
      '4. Delete empty subgroups first ' +
      '5. Delete empty group ' +
      '\n\n**Error handling:** ' +
      'If deletion fails, group likely not empty. Check for: ' +
      '\n- Services still in group ' +
      '\n- Subgroups still under this group ' +
      '\n\n**Related tools:** "list\\_services" (check for services), "list\\_service\\_groups" (check for subgroups), "update\\_service" (move services).',
    annotations: {
      title: 'Delete service group',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        groupId: {
          type: 'number',
          description: 'The ID of the service group to delete',
        },
      },
      additionalProperties: false,
      required: ['groupId'],
    },
  },

  // Report Groups
  {
    name: 'list_report_groups',
    description: 'List all report groups (folders) in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Array of report groups with: id, name, parentId, full path, description, number of reports, number of subgroups. ' +
      '\n\n**What are report groups:** Organizational folders for reports, like directories for files. Used to categorize reports by audience, frequency, purpose, or department. ' +
      '\n\n**When to use:**' +
      '\n- Browse report organization before creating reports' +
      '\n- Find group IDs for report operations' +
      '\n- Understand report hierarchy' +
      '\n- Navigate to specific report folders' +
      '\n' +
      '\n\n**Common organization patterns:** ' +
      '\n- By audience: "Executive Reports", "Operations Reports", "Customer Reports" ' +
      '\n- By frequency: "Daily Reports", "Weekly Reports", "Monthly Reports" ' +
      '\n- By department: "IT Reports", "Finance Reports", "Compliance Reports" ' +
      '\n- By type: "SLA Reports", "Capacity Reports", "Alert Summary Reports" ' +
      '\n\n**Use cases:** ' +
      '\n- Organize reports for different stakeholders ' +
      '\n- Group compliance/audit reports separately ' +
      '\n- Separate internal vs customer-facing reports ' +
      '\n- Structure reports by delivery schedule ' +
      '\n\n**Workflow:** Use this tool to browse hierarchy, then "list\\_reports" filtered by groupId to see reports in specific folder. ' +
      '\n\n**Important:** LogicMonitor may return a negative "total" value due to a known upstream API limitation - this does not mean the request failed. Never use "total" to count or check for results; check the length of the "items" array instead, and use pagination (size/offset) or autoPaginate: true to retrieve all items across pages. ' +
      '\n\n**Related tools:** "get\\_report\\_group" (details), "list\\_reports" (reports in group), "create\\_report\\_group" (create folder).',
    annotations: {
      title: 'List report groups',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        ...paginationSchema,
        ...filterSchema,
        ...fieldsSchema,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_report_group',
    description: 'Get detailed information about a specific report group by ID in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Complete report group details: name, full path, parentId, description, number of reports (direct and total), number of subgroups. ' +
      '\n\n**When to use:**' +
      '\n- Get group path for documentation' +
      '\n- Check report membership counts' +
      '\n- Verify group hierarchy' +
      '\n- Review group structure before creating reports' +
      '\n' +
      '\n\n**Workflow:** Use "list\\_report\\_groups" to find groupId, then use this tool for complete details. ' +
      '\n\n**Related tools:** "list\\_report\\_groups" (find groups), "list\\_reports" (reports in group), "create\\_report\\_group" (create new).',
    annotations: {
      title: 'Get report group details',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        groupId: {
          type: 'number',
          description: 'The ID of the report group to retrieve',
        },
        ...fieldsSchema,
      },
      additionalProperties: false,
      required: ['groupId'],
    },
  },
  {
    name: 'create_report_group',
    description: 'Create a new report group (folder) in LogicMonitor (LM) monitoring. ' +
      '\n\n**What this does:** Creates organizational folder for reports. Organize reports by team, report type, schedule, or purpose. ' +
      '\n\n**When to use:**' +
      '\n- Organize reports before creating them' +
      '\n- Group by department/team' +
      '\n- Separate by report frequency (daily/weekly/monthly)' +
      '\n- Organize by purpose (compliance/executive/operational)' +
      '\n' +
      '\n\n**Required parameters:** ' +
      '\n- name: Group name (e.g., "Executive Reports", "Compliance Reports", "Daily Operations") ' +
      '\n\n**Optional parameters:** ' +
      '\n- description: Group purpose ' +
      '\n- parentId: Parent group ID for nested hierarchy ' +
      '\n\n**Common report group patterns:** ' +
      '\n- By audience: "Executive Reports", "Engineering Reports", "Business Unit Reports" ' +
      '\n- By frequency: "Daily Reports", "Weekly Reports", "Monthly Reports" ' +
      '\n- By purpose: "Compliance Reports", "SLA Reports", "Capacity Planning" ' +
      '\n- By type: "Alert Reports", "Availability Reports", "Performance Reports" ' +
      '\n\n**Best practices:** ' +
      '\n- Create groups before creating reports ' +
      '\n- Use descriptive names matching business needs ' +
      '\n- Keep hierarchy shallow (2-3 levels max) ' +
      '\n\n**Related tools:** "list\\_report\\_groups" (view hierarchy), "create\\_report" (add reports), "update\\_report\\_group" (modify).',
    annotations: {
      title: 'Create report group',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the report group',
        },
        description: {
          type: 'string',
          description: 'Description',
        },
      },
      additionalProperties: false,
      required: ['name'],
    },
  },
  {
    name: 'update_report_group',
    description: 'Update an existing report group in LogicMonitor (LM) monitoring. ' +
      '\n\n**What this does:** Modify group name, description, or parent (move in hierarchy). Does not affect reports within group. ' +
      '\n\n**When to use:**' +
      '\n- Rename group' +
      '\n- Update description' +
      '\n- Move group in hierarchy' +
      '\n- Reorganize report structure' +
      '\n' +
      '\n\n**Required parameters:** ' +
      '\n- groupId: Report group ID (from "list\\_report\\_groups") ' +
      '\n\n**Optional parameters:** ' +
      '\n- name: New group name ' +
      '\n- description: Updated description ' +
      '\n- parentId: New parent group (moves group) ' +
      '\n\n**Related tools:** "list\\_report\\_groups" (find group), "get\\_report\\_group" (verify), "list\\_reports" (reports in group).',
    annotations: {
      title: 'Update report group',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        groupId: {
          type: 'number',
          description: 'The ID of the report group to update',
        },
        name: {
          type: 'string',
          description: 'New name',
        },
        description: {
          type: 'string',
          description: 'New description',
        },
      },
      additionalProperties: false,
      required: ['groupId'],
    },
  },
  {
    name: 'delete_report_group',
    description: 'Delete a report group from LogicMonitor (LM) monitoring. ' +
      '\n\n**⚠️ WARNING:** Cannot delete group containing reports or subgroups. Must be empty to delete. ' +
      '\n\n**What this does:** Removes empty report group folder. Group must have no reports and no subgroups. ' +
      '\n\n**When to use:**' +
      '\n- Cleanup empty groups after reorganization' +
      '\n- Remove unused organizational folders' +
      '\n- Simplify report hierarchy' +
      '\n' +
      '\n\n**Required parameters:** ' +
      '\n- groupId: Report group ID to delete (from "list\\_report\\_groups") ' +
      '\n\n**Before deleting:** Move all reports and subgroups first, then delete empty group. ' +
      '\n\n**Related tools:** "list\\_reports" (check for reports), "list\\_report\\_groups" (check for subgroups), "update\\_report" (move reports).',
    annotations: {
      title: 'Delete report group',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        groupId: {
          type: 'number',
          description: 'The ID of the report group to delete',
        },
      },
      additionalProperties: false,
      required: ['groupId'],
    },
  },

  // Collector Groups
  {
    name: 'list_collector_groups',
    description: 'List all collector groups (folders) in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Array of collector groups with: id, name, parentId, full path, description, number of collectors, number of subgroups. ' +
      '\n\n**What are collector groups:** Organizational folders for collectors (monitoring agents), similar to resource/device groups. Used to categorize collectors by location, function, or customer. ' +
      '\n\n**When to use:**' +
      '\n- Browse collector organization' +
      '\n- Find group IDs for collector operations' +
      '\n- Understand collector deployment structure' +
      '\n- Navigate to specific collector folders' +
      '\n' +
      '\n\n**Common organization patterns:** ' +
      '\n- By location: "US-West Collectors", "EU Collectors", "APAC Collectors" ' +
      '\n- By environment: "Production Collectors", "Dev/Test Collectors" ' +
      '\n- By customer: "Customer A Collectors", "Customer B Collectors" (MSP) ' +
      '\n- By datacenter: "DC1 Collectors", "DC2 Collectors", "AWS Collectors" ' +
      '\n- By function: "Network Collectors", "Server Collectors", "Cloud Collectors" ' +
      '\n\n**Use cases:** ' +
      '\n- Organize collectors by geographic region ' +
      '\n- Group collectors by customer or tenant ' +
      '\n- Separate production vs non-production collectors ' +
      '\n- Structure multi-datacenter collector deployments ' +
      '\n\n**Workflow:** Use this tool to browse hierarchy, then "list\\_collectors" filtered by groupId to see collectors in specific folder. ' +
      '\n\n**Important:** LogicMonitor may return a negative "total" value due to a known upstream API limitation - this does not mean the request failed. Never use "total" to count or check for results; check the length of the "items" array instead, and use pagination (size/offset) or autoPaginate: true to retrieve all items across pages. ' +
      '\n\n**Related tools:** "get\\_collector\\_group" (details), "list\\_collectors" (collectors in group), "create\\_collector\\_group" (create folder).',
    annotations: {
      title: 'List collector groups',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        ...paginationSchema,
        ...filterSchema,
        ...fieldsSchema,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_collector_group',
    description: 'Get detailed information about a specific collector group by ID in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Complete collector group details: name, full path, parentId, description, number of collectors (direct and total), number of subgroups. ' +
      '\n\n**When to use:**' +
      '\n- Get group path for documentation' +
      '\n- Check collector membership counts' +
      '\n- Verify group hierarchy' +
      '\n- Review group structure before deploying collectors' +
      '\n' +
      '\n\n**Workflow:** Use "list\\_collector\\_groups" to find groupId, then use this tool for complete details. ' +
      '\n\n**Related tools:** "list\\_collector\\_groups" (find groups), "list\\_collectors" (collectors in group), "create\\_collector\\_group" (create new).',
    annotations: {
      title: 'Get collector group details',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        groupId: {
          type: 'number',
          description: 'The ID of the collector group to retrieve',
        },
        ...fieldsSchema,
      },
      additionalProperties: false,
      required: ['groupId'],
    },
  },
  {
    name: 'delete_collector_group',
    description: 'Delete a collector group from LogicMonitor (LM) monitoring. ' +
      '\n\n**⚠️ WARNING: CHECK FOR COLLECTORS FIRST** ' +
      '\n- Cannot delete group containing collectors ' +
      '\n- Cannot delete group containing subgroups ' +
      '\n- Must be empty to delete ' +
      '\n- The "@default" group cannot be deleted ' +
      '\n\n**What this does:** Removes empty collector group folder. Group must have no collectors and no subgroups. ' +
      '\n\n**When to use:**' +
      '\n- Cleanup empty groups after reorganization' +
      '\n- Remove unused organizational folders' +
      '\n- Simplify collector hierarchy' +
      '\n' +
      '\n\n**Required parameters:** ' +
      '\n- groupId: Collector group ID to delete (from "list\\_collector\\_groups") ' +
      '\n\n**Before deleting:** ' +
      '1. Use "list\\_collector\\_groups" or "get\\_collector\\_group" to confirm numOfCollectors is 0 and there are no subgroups ' +
      '2. Move or delete collectors/subgroups first if not empty ' +
      '\n\n**Error handling:** ' +
      'If deletion fails, group likely not empty. Check for: ' +
      '\n- Collectors still in group ' +
      '\n- Subgroups still under this group ' +
      '\n\n**Related tools:** "list\\_collector\\_groups" (find groups), "get\\_collector\\_group" (check for collectors/subgroups), "list\\_collectors" (collectors in group).',
    annotations: {
      title: 'Delete collector group',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        groupId: {
          type: 'number',
          description: 'The ID of the collector group to delete',
        },
      },
      additionalProperties: false,
      required: ['groupId'],
    },
  },

  // Device Group Properties
  {
    name: 'list_resource_group_properties',
    description: 'List all custom properties for a specific resource/device group in LogicMonitor (LM) monitoring. Properties set at group level are inherited by all resource/device in the group. ' +
      '\n\n**Returns:** Array of properties with: name, value, type (custom vs system), and inheritance source. ' +
      '\n\n**When to use:**' +
      '\n- Review properties before bulk updates' +
      '\n- Audit credentials/settings applied to resource/device group' +
      '\n- Verify property inheritance from parent groups' +
      '\n- Check which properties resource/device will inherit when added to group' +
      '\n- Document group configuration' +
      '\n' +
      '\n\n**What are group properties:** Key-value pairs set at group level that ALL resource/device in the group inherit. Common uses: credentials (SSH/SNMP), environment tags, owner/team info, monitoring settings. ' +
      '\n\n**Property inheritance:** ' +
      '\n- Properties set on group apply to ALL resource/device in group ' +
      '\n- Child groups inherit from parent groups ' +
      '\n- Device-level properties override group properties ' +
      '\n- Used by datasource "appliesTo" logic and authentication ' +
      '\n\n**Common group properties:** ' +
      '\n- **Credentials:** ssh.user, ssh.pass, snmp.community, wmi.user, wmi.pass ' +
      '\n- **Tags:** env (production/staging), location (datacenter), owner (team name) ' +
      '\n- **Business metadata:** cost.center, sla.tier, compliance.level ' +
      '\n- **Monitoring config:** polling.interval, alert.threshold.multiplier ' +
      '\n\n**Use cases:** ' +
      '\n- Audit credentials: Check which credentials are configured for group ' +
      '\n- Before bulk update: See current values before changing ' +
      '\n- Troubleshoot authentication: Verify credentials applied to resource/device ' +
      '\n- Document configuration: Export group settings ' +
      '\n\n**Workflow:** Use "list\\_resource\\_groups" to find groupId, then use this tool to see properties, then "update\\_device\\_group\\_property" to modify. ' +
      '\n\n**Important:** LogicMonitor may return a negative "total" value due to a known upstream API limitation - this does not mean the request failed. Never use "total" to count or check for results; check the length of the "items" array instead, and use pagination (size/offset) or autoPaginate: true to retrieve all items across pages. ' +
      '\n\n**Related tools:** "update\\_device\\_group\\_property" (modify property), "get\\_resource\\_group" (group details), "list\\_device\\_properties" (device-level properties).',
    annotations: {
      title: 'List resource/device group properties',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        groupId: {
          type: 'number',
          description: 'The resource/device group ID',
        },
        ...paginationSchema,
        ...filterSchema,
        ...fieldsSchema,
      },
      additionalProperties: false,
      required: ['groupId'],
    },
  },
  {
    name: 'update_resource_group_property',
    description: 'Update a custom property value for a resource/device group in LogicMonitor (LM) monitoring. ' +
      '\n\n**What this does:** Modifies group-level property inherited by all resource/device in group. Changes immediately affect all member resources/devices. ' +
      '\n\n**When to use:**' +
      '\n- Update credentials for all resource/device in group' +
      '\n- Change environment tags' +
      '\n- Update owner/team information' +
      '\n- Modify monitoring settings' +
      '\n- Bulk property updates' +
      '\n' +
      '\n\n**Required parameters:** ' +
      '\n- groupId: Device group ID (from "list\\_resource\\_groups") ' +
      '\n- name: Property name (e.g., "ssh.user", "env", "owner") ' +
      '\n- value: New property value ' +
      '\n\n**Common update scenarios:** ' +
      '\n\n**Update credentials for entire group:** ' +
      '{groupId: 123, name: "ssh.user", value: "monitoring-v2"} ' +
      '// All resource/device in group now use new SSH user ' +
      '\n\n**Change environment tag:** ' +
      '{groupId: 123, name: "env", value: "production"} ' +
      '// Mark entire group as production ' +
      '\n\n**Update owner/team:** ' +
      '{groupId: 123, name: "owner", value: "platform-team"} ' +
      '\n\n**⚠️ Important - Inheritance Impact:** ' +
      '\n- All resource/device in group inherit updated property ' +
      '\n- resources/Devices with device-level override keep their value (device wins) ' +
      '\n- Subgroup resource/device also inherit unless overridden ' +
      '\n- Credential changes affect monitoring immediately ' +
      '\n\n**Best practice workflow:** ' +
      '1. Use "list\\_device\\_group\\_properties" to see current properties ' +
      '2. Update property value ' +
      '3. Changes propagate to all member resource/device immediately ' +
      '4. Test monitoring still works (especially for credential changes) ' +
      '\n\n**Related tools:** "list\\_device\\_group\\_properties" (view all), "list\\_device\\_properties" (device-level view), "get\\_resource\\_group" (group details).',
    annotations: {
      title: 'Update resource/device group property',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        groupId: {
          type: 'number',
          description: 'The resource/device group ID',
        },
        propertyName: {
          type: 'string',
          description: 'The name of the property to update',
        },
        value: {
          type: 'string',
          description: 'The new value for the property',
        },
      },
      additionalProperties: false,
      required: ['groupId', 'propertyName', 'value'],
    },
  },

  // Device Group DataSources (group-level datasource associations & threshold overrides)
  {
    name: 'list_resource_group_datasources',
    description: 'List the datasources currently associated with (applied to) a resource/device group in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Array of group-datasource associations with: dataSourceId, dataSourceName, dataSourceDisplayName, dataSourceGroupName, deviceGroupId, stopMonitoring, disableAlerting, dataSourceType. ' +
      '\n\n**When to use:** ' +
      '\n- Find the dataSourceId to pass to "get\\_resource\\_group\\_datasource\\_thresholds"/"update\\_resource\\_group\\_datasource\\_thresholds" for a datasource you already know by name' +
      '\n- Confirm a datasource actually applies to (has data for) resource/device in this group before configuring a group-level threshold override' +
      '\n- Audit which datasources are disabled or stopped for a group ' +
      '\n\n**Note:** The "dataSourceId" returned here is the same global DataSource module ID used by "get\\_datasource" - there is no separate per-group ID. ' +
      '\n\n**Workflow:** Use "list\\_resource\\_groups" to find groupId, this tool (optionally filtered by dataSourceName) to confirm the datasource applies and get its ID, then "get\\_resource\\_group\\_datasource\\_thresholds" to inspect current overrides. ' +
      '\n\n**Related tools:** "get\\_resource\\_group\\_datasource\\_thresholds" (current overrides), "update\\_resource\\_group\\_datasource\\_thresholds" (set overrides), "list\\_datasources" (find datasource by name globally).',
    annotations: {
      title: 'List resource/device group datasources',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        groupId: {
          type: 'number',
          description: 'The resource/device group ID',
        },
        ...paginationSchema,
        ...filterSchema,
        ...fieldsSchema,
      },
      additionalProperties: false,
      required: ['groupId'],
    },
  },
  {
    name: 'get_resource_group_datasource_thresholds',
    description: 'Get the group-level alert threshold overrides for a specific datasource on a resource/device group in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** `{dpConfig: [{dataPointId, dataPointName, dataPointDescription, alertExpr, disableAlerting, globalAlertExpr}]}` - one entry per datapoint on the datasource. ' +
      '\n- "alertExpr": the group-level override, or an empty string if the group has no override (inherits the datasource\'s global threshold) ' +
      '\n- "globalAlertExpr": the datasource\'s global/default threshold, for comparison ' +
      '\n\n**When to use:** ' +
      '\n- Check whether a group already has a custom threshold for a datapoint before changing it ' +
      '\n- Verify a change made via "update\\_resource\\_group\\_datasource\\_thresholds" took effect ' +
      '\n- Audit per-group alert tuning (e.g. why a group is more/less sensitive than the datasource default) ' +
      '\n\n**Workflow:** Use "list\\_resource\\_group\\_datasources" (or "list\\_datasources") to find dataSourceId, then this tool to inspect current overrides, then "update\\_resource\\_group\\_datasource\\_thresholds" to change them. ' +
      '\n\n**Related tools:** "update\\_resource\\_group\\_datasource\\_thresholds" (set overrides), "get\\_datasource" (global thresholds and datapoint definitions), "list\\_resource\\_group\\_datasources" (find dataSourceId).',
    annotations: {
      title: 'Get resource/device group datasource threshold overrides',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        groupId: {
          type: 'number',
          description: 'The resource/device group ID',
        },
        dataSourceId: {
          type: 'number',
          description: 'The datasource ID (same ID used by "get_datasource")',
        },
      },
      additionalProperties: false,
      required: ['groupId', 'dataSourceId'],
    },
  },
  {
    name: 'update_resource_group_datasource_thresholds',
    description: 'Set group-level alert threshold overrides for one or more datapoints on a datasource, scoped to a single resource/device group, in LogicMonitor (LM) monitoring - without changing the datasource\'s global thresholds or any other group. ' +
      '\n\n**What this does:** Writes an override that applies only to resource/device in this group (and its subgroups, unless overridden further down). resources/devices outside this group keep the datasource\'s global threshold. This is the same mechanism as the LM portal\'s per-group "Alert Tuning" feature. ' +
      '\n\n**Required parameters:** ' +
      '\n- groupId: The resource/device group ID ' +
      '\n- dataSourceId: The datasource ID (same ID used by "get\\_datasource") ' +
      '\n- dpConfig: Array of datapoint overrides, each with: ' +
      '\n  - dataPointId or dataPointName (one required) - which datapoint to override ' +
      '\n  - alertExpr (optional) - the threshold expression, e.g. "< 28 7 2" for a "less than" comparator with warning/error/critical levels. There must be a space between the operator and each value. ' +
      '\n  - disableAlerting (optional) - true to suppress alerting for this datapoint in this group without changing its threshold ' +
      '\n\n**Omitting severity levels:** alertExpr values are read left-to-right as warning, error, critical. Supplying fewer values than the datasource normally has omits the more severe level(s) for this group - e.g. "< 28 7" sets warning/error but leaves this group\'s copy of the datapoint with no critical threshold, even if the datasource\'s global default includes one. ' +
      '\n\n**Clearing an override:** Pass alertExpr: "" to remove a group\'s override for that datapoint and revert it to inheriting the datasource\'s global threshold. ' +
      '\n\n**Untouched settings are preserved automatically:** Behind the scenes this tool reads the datapoint\'s current alert-transition-interval/no-data settings first and carries them through unchanged - you never need to specify them, and this call never resets them to datasource defaults just because they weren\'t mentioned. ' +
      '\n\n**Verified behavior:** Confirmed against a live LM portal - overriding a datapoint\'s alertExpr for one group leaves "globalAlertExpr" (and every other group\'s effective threshold) unchanged; the override is visible afterward via "get\\_resource\\_group\\_datasource\\_thresholds". ' +
      '\n\n**Workflow:** Use "list\\_resource\\_group\\_datasources" (or "list\\_datasources") to find dataSourceId, "get\\_resource\\_group\\_datasource\\_thresholds" or "get\\_datasource" to see current/default values and exact dataPointName spelling, then this tool to write the override. ' +
      '\n\n**Related tools:** "get\\_resource\\_group\\_datasource\\_thresholds" (verify before/after), "get\\_datasource" (datapoint names and global thresholds), "update\\_resource\\_datasource" (per-device, not per-group, alerting/monitoring controls).',
    annotations: {
      title: 'Update resource/device group datasource threshold overrides',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        groupId: {
          type: 'number',
          description: 'The resource/device group ID',
        },
        dataSourceId: {
          type: 'number',
          description: 'The datasource ID (same ID used by "get_datasource")',
        },
        dpConfig: {
          type: 'array',
          description: 'Array of per-datapoint overrides to apply. Each item needs dataPointId or dataPointName, plus alertExpr and/or disableAlerting.',
          items: {
            type: 'object',
            properties: {
              dataPointId: {
                type: 'number',
                description: 'The ID of the datapoint associated with the threshold (one of dataPointId/dataPointName required)',
              },
              dataPointName: {
                type: 'string',
                description: 'The name of the datapoint associated with the threshold (one of dataPointId/dataPointName required)',
              },
              alertExpr: {
                type: 'string',
                description: 'The threshold expression for this group, e.g. "> 1" or "< 28 7 2". Space-separated operator and values (warning, error, critical - trailing values may be omitted to skip those levels). Pass "" to clear the override and revert to the datasource\'s global threshold.',
              },
              disableAlerting: {
                type: 'boolean',
                description: 'Whether alerting is disabled for this datapoint in this group (defaults to false)',
              },
            },
            additionalProperties: false,
          },
        },
      },
      additionalProperties: false,
      required: ['groupId', 'dataSourceId', 'dpConfig'],
    },
  },

  // NetScans
  {
    name: 'list_netscans',
    description: 'List all network discovery scans (NetScans) in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Array of netscans with: id, name, description, scan method (nmap/script/ICMP/SNMP), schedule, target networks (IP ranges/subnets), collector, last run time, resource/device discovered. ' +
      '\n\n**What are netscans:** Automated network discovery that finds resource/device on your network and adds them to monitoring. Instead of manually adding resource/device one-by-one, netscan automatically discovers and onboards resource/device based on IP ranges or subnets. ' +
      '\n\n**When to use:**' +
      '\n- Audit existing discovery configurations' +
      '\n- Check which networks are being scanned' +
      '\n- Review netscan schedules' +
      '\n- Troubleshoot why resource/device not auto-discovered' +
      '\n- Find netscan IDs for modifications' +
      '\n' +
      '\n\n**How netscans work:** ' +
      'Scheduled job → Scan network range (e.g., 192.168.1.0/24) → Find live resource/device → Check if already monitored → If new, add to LogicMonitor → Apply resource/device properties and datasources → Begin monitoring ' +
      '\n\n**NetScan methods:** ' +
      '\n- **nmap:** Network mapper scan (comprehensive, detects OS, ports, services) ' +
      '\n- **ICMP Ping:** Simple ping sweep (fastest, basic reachability) ' +
      '\n- **SNMP Walk:** Query SNMP-enabled resource/device (network gear, servers with SNMP) ' +
      '\n- **Script:** Custom discovery logic (cloud APIs, CMDBs, etc.) ' +
      '\n- **AWS/Azure/GCP:** Cloud auto-discovery via APIs ' +
      '\n\n**Common use cases:** ' +
      '\n- **Data center discovery:** Scan 10.0.0.0/16 network, auto-add all servers ' +
      '\n- **Cloud auto-discovery:** Scan AWS account, add all EC2 instances daily ' +
      '\n- **Branch office monitoring:** Scan remote office subnets, discover network resource/device ' +
      '\n- **Dynamic infrastructure:** Auto-discover containers, VMs as they spin up ' +
      '\n\n**Example NetScan configurations:** ' +
      '\n- "Production Servers" - Scan 192.168.1.0/24 every 6 hours via nmap ' +
      '\n- "AWS EC2 Discovery" - Query AWS API every hour for new instances ' +
      '\n- "Network resources/Devices" - SNMP walk 10.0.0.0/8 daily for routers/switches ' +
      '\n\n**Workflow:** Use this tool to review netscans, then "get\\_netscan" for detailed configuration including filters and resource/device properties. ' +
      '\n\n**Important:** LogicMonitor may return a negative "total" value due to a known upstream API limitation - this does not mean the request failed. Never use "total" to count or check for results; check the length of the "items" array instead, and use pagination (size/offset) or autoPaginate: true to retrieve all items across pages. ' +
      '\n\n**Related tools:** "get\\_netscan" (configuration details), "create\\_netscan" (set up auto-discovery), "run\\_netscan" (trigger manual scan).',
    annotations: {
      title: 'List NetScans',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        ...paginationSchema,
        ...filterSchema,
        ...fieldsSchema,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_netscan',
    description: 'Get detailed information about a specific netscan by ID in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Complete netscan details: name, description, scan method, schedule, target networks/IPs, credentials, filters (include/exclude rules), resource/device properties to apply, collector assignment, duplicate detection settings, last execution results. ' +
      '\n\n**When to use:**' +
      '\n- Review netscan configuration before running' +
      '\n- Troubleshoot why certain resource/device not discovered' +
      '\n- Check credentials and filters' +
      '\n- Verify resource/device properties applied to discovered resources/devices' +
      '\n- Understand duplicate detection logic' +
      '\n' +
      '\n\n**Configuration details returned:** ' +
      '\n- **Targets:** IP ranges, subnets, or cloud filters (e.g., "192.168.1.0/24", "All EC2 with tag:Environment=prod") ' +
      '\n- **Schedule:** How often scan runs (hourly, daily, weekly, on-demand) ' +
      '\n- **Credentials:** Which properties used for authentication (ssh.user, snmp.community) ' +
      '\n- **Filters:** Include/exclude rules (e.g., "Exclude IPs ending in .1", "Only Linux servers") ' +
      '\n- **Device properties:** Auto-applied to discovered resource/device (e.g., location, environment tags) ' +
      '\n- **Duplicate handling:** How to handle resource/device found in multiple scans ' +
      '\n\n**Troubleshooting use cases:** ' +
      '\n- "Why resource/device not discovered?" → Check if IP in target range and not excluded by filters ' +
      '\n- "Wrong credentials?" → Verify credential properties configured in netscan ' +
      '\n- "resources/Devices missing properties?" → Check default properties applied by netscan ' +
      '\n\n**Workflow:** Use "list\\_netscans" to find netscanId, then use this tool to review complete configuration. ' +
      '\n\n**Related tools:** "list\\_netscans" (find netscan), "update\\_netscan" (modify), "run\\_netscan" (execute now).',
    annotations: {
      title: 'Get NetScan details',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        netscanId: {
          type: 'number',
          description: 'The ID of the netscan to retrieve',
        },
        ...fieldsSchema,
      },
      additionalProperties: false,
      required: ['netscanId'],
    },
  },
  {
    name: 'create_netscan',
    description: 'Create a new network discovery scan (NetScan) in LogicMonitor (LM) monitoring to automatically discover and add resources/devices. ' +
      '\n\n**What this does:** Creates automated network scanner that discovers resource/device by IP range/subnet and adds them to monitoring. Runs on schedule to continuously discover new infrastructure. ' +
      '\n\n**When to use:**' +
      '\n- Automate resource/device discovery instead of manual adds' +
      '\n- Onboard entire subnets' +
      '\n- Keep monitoring in sync with dynamic infrastructure (cloud/containers)' +
      '\n- Continuous discovery for DHCP/dynamic environments' +
      '\n- Bulk resource/device onboarding' +
      '\n' +
      '\n\n**Required parameters:** ' +
      '\n- name: NetScan name (e.g., "Production Network Scan", "AWS EC2 Discovery") ' +
      '\n- collectorId: Collector to perform scan (from "list\\_collectors") ' +
      '\n- targetType: "subnet", "iprange", "script", "awsEC2", "azureVMs", etc. ' +
      '\n- target: What to scan (depends on type - subnet CIDR, IP range, script, etc.) ' +
      '\n\n**Optional parameters:** ' +
      '\n- schedule: When to run ("manual", "daily", "weekly", cron expression) ' +
      '\n- deviceGroupId: Where to add discovered resource/device ' +
      '\n- credentials: Authentication for discovered resource/device ' +
      '\n- excludeFilters: IPs/ranges to skip ' +
      '\n\n**Common netscan patterns:** ' +
      '\n\n**Subnet discovery (on-prem):** ' +
      '{name: "Production Subnet", collectorId: 5, targetType: "subnet", target: "192.168.1.0/24", schedule: "daily", deviceGroupId: 100} ' +
      '// Scan 192.168.1.0/24 every day, add to Production group ' +
      '\n\n**IP range discovery:** ' +
      '{name: "Server Range", collectorId: 5, targetType: "iprange", target: "10.0.1.10-10.0.1.100", schedule: "0 0 2 * * ?", deviceGroupId: 200} ' +
      '// Scan IPs 10.0.1.10-100 at 2am daily ' +
      '\n\n**AWS EC2 discovery:** ' +
      '{name: "AWS Production EC2", collectorId: 5, targetType: "awsEC2", target: "us-east-1", schedule: "0 */6 * * ?", deviceGroupId: 300} ' +
      '// Discover EC2 instances every 6 hours ' +
      '\n\n**Azure VMs discovery:** ' +
      '{name: "Azure Production", collectorId: 5, targetType: "azureVMs", target: "subscription-id", schedule: "0 */4 * * ?", deviceGroupId: 400} ' +
      '// Discover Azure VMs every 4 hours ' +
      '\n\n**With exclusions:** ' +
      '{name: "Office Network", collectorId: 5, targetType: "subnet", target: "172.16.0.0/16", excludeFilters: ["172.16.1.0/24", "172.16.2.50"], deviceGroupId: 500} ' +
      '// Scan 172.16.0.0/16 except specific subnet/IP ' +
      '\n\n**Schedule options:** ' +
      '\n- "manual": Only run when manually triggered ' +
      '\n- "daily": Run once per day ' +
      '\n- "weekly": Run once per week ' +
      '\n- Cron: "0 0 2 * * ?" = 2am daily, "0 */6 * * * ?" = every 6 hours ' +
      '\n\n**TargetType options:** ' +
      '\n- subnet: Scan CIDR (e.g., "10.0.0.0/24") ' +
      '\n- iprange: Scan IP range (e.g., "10.0.1.1-10.0.1.255") ' +
      '\n- awsEC2: Discover AWS EC2 instances in region ' +
      '\n- azureVMs: Discover Azure VMs in subscription ' +
      '\n- script: Custom discovery script ' +
      '\n\n**Why use netscans:** ' +
      '\n- **Automation:** No manual resource/device adds ' +
      '\n- **Continuous:** Automatically discovers new infrastructure ' +
      '\n- **Dynamic environments:** Cloud, containers, DHCP networks ' +
      '\n- **Bulk onboarding:** Add hundreds of resource/device at once ' +
      '\n- **Compliance:** Ensure all resource/device are monitored ' +
      '\n\n**Best practices:** ' +
      '\n- Start with small subnets to test ' +
      '\n- Use excludeFilters for management IPs, printers, phones ' +
      '\n- Schedule during low-traffic hours (scans generate network traffic) ' +
      '\n- Test credentials before scheduling ' +
      '\n- Group resource/device appropriately with deviceGroupId ' +
      '\n\n**After creation:** NetScan runs on schedule. Use "list\\_netscans" to view, "get\\_netscan" for details. Check "list\\_resources" to see discovered resources/devices. ' +
      '\n\n**Related tools:** "list\\_collectors" (find collector), "list\\_resource\\_groups" (find deviceGroupId), "update\\_netscan" (modify), "delete\\_netscan" (remove).',
    annotations: {
      title: 'Create NetScan',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the netscan',
        },
        collectorId: {
          type: 'number',
          description: 'ID of the collector that will perform the scan',
        },
        description: {
          type: 'string',
          description: 'Description',
        },
        schedule: {
          type: 'object',
          description: 'Schedule configuration (e.g., { cron: "0 0 * * *" })',
        },
        subnet: {
          type: 'string',
          description: 'Subnet to scan (e.g., "192.168.1.0/24")',
        },
        excludeDuplicateType: {
          type: 'string',
          description: 'How to handle duplicate resources/devices',
        },
      },
      additionalProperties: false,
      required: ['name', 'collectorId'],
    },
  },
  {
    name: 'update_netscan',
    description: 'Update an existing network discovery scan (NetScan) in LogicMonitor (LM) monitoring. ' +
      '\n\n**What this does:** Modify netscan name, target, schedule, credentials, or settings. Changes take effect on next scan run. ' +
      '\n\n**When to use:**' +
      '\n- Change IP range/subnet scanned' +
      '\n- Update scan schedule' +
      '\n- Modify credentials' +
      '\n- Change destination group for discovered resources/devices' +
      '\n- Update exclusion filters' +
      '\n' +
      '\n\n**Required parameters:** ' +
      '\n- netscanId: NetScan ID (from "list\\_netscans") ' +
      '\n\n**Optional parameters (what to change):** ' +
      '\n- name: New NetScan name ' +
      '\n- target: New IP range/subnet ' +
      '\n- schedule: New schedule (daily, weekly, cron) ' +
      '\n- deviceGroupId: New destination group ' +
      '\n- excludeFilters: Updated exclusion list ' +
      '\n- credentials: Updated authentication ' +
      '\n\n**Common update scenarios:** ' +
      '\n\n**Expand IP range:** ' +
      '{netscanId: 123, target: "192.168.0.0/16"} // Expanded from /24 to /16 ' +
      '\n\n**Change schedule:** ' +
      '{netscanId: 123, schedule: "0 0 3 * * ?"} // Changed to 3am daily ' +
      '\n\n**Update destination group:** ' +
      '{netscanId: 123, deviceGroupId: 456} // Move discovered resource/device to different group ' +
      '\n\n**Add exclusions:** ' +
      '{netscanId: 123, excludeFilters: ["192.168.1.0/24", "192.168.2.50-192.168.2.100"]} ' +
      '\n\n**Best practice workflow:** ' +
      '1. Use "get\\_netscan" to review current settings ' +
      '2. Update NetScan configuration ' +
      '3. Changes apply on next scheduled run ' +
      '\n\n**Related tools:** "get\\_netscan" (review), "list\\_netscans" (find netscan), "delete\\_netscan" (remove).',
    annotations: {
      title: 'Update NetScan',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        netscanId: {
          type: 'number',
          description: 'The ID of the netscan to update',
        },
        name: {
          type: 'string',
          description: 'New name',
        },
        description: {
          type: 'string',
          description: 'New description',
        },
        schedule: {
          type: 'object',
          description: 'New schedule configuration',
        },
      },
      additionalProperties: false,
      required: ['netscanId'],
    },
  },
  {
    name: 'delete_netscan',
    description: 'Delete a network discovery scan (NetScan) from LogicMonitor (LM) monitoring. ' +
      '\n\n**What this does:** Permanently removes NetScan. Stops all future automatic resource/device discovery for this target. Previously discovered resource/device remain in monitoring. ' +
      '\n\n**When to use:**' +
      '\n- Decommissioned network/subnet' +
      '\n- Discovery no longer needed (static environment)' +
      '\n- Consolidating duplicate netscans' +
      '\n- Migrating to different discovery method' +
      '\n' +
      '\n\n**Required parameters:** ' +
      '\n- netscanId: NetScan ID to delete (from "list\\_netscans") ' +
      '\n\n**Impact:** ' +
      '\n- NetScan stops running (no more automatic discovery) ' +
      '\n- Previously discovered resource/device remain in monitoring (not deleted) ' +
      '\n- New resource/device in target range will NOT be automatically added ' +
      '\n- Cannot be undone ' +
      '\n\n**Best practice:** ' +
      'Before deleting, decide if you still need discovery for this network. resources/Devices already discovered remain monitored. ' +
      '\n\n**Related tools:** "list\\_netscans" (find NetScan), "get\\_netscan" (verify before delete), "list\\_resources" (see discovered resources/devices).',
    annotations: {
      title: 'Delete NetScan',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        netscanId: {
          type: 'number',
          description: 'The ID of the NetScan to delete',
        },
      },
      additionalProperties: false,
      required: ['netscanId'],
    },
  },

  // Integrations
  {
    name: 'list_integrations',
    description: 'List all third-party integrations configured in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Array of integrations with: id, name, type (Slack/PagerDuty/ServiceNow/Jira/etc), status (active/inactive), configuration summary, authentication status. ' +
      '\n\n**What are integrations:** Connections to external platforms for alert notifications, ticket creation, chat messages, incident management. Extend LogicMonitor alerting beyond email/SMS. ' +
      '\n\n**When to use:**' +
      '\n- Find integration IDs for escalation chains' +
      '\n- Verify integrations are working' +
      '\n- Audit external connections' +
      '\n- Check authentication status' +
      '\n- Review available integration options' +
      '\n' +
      '\n\n**Popular integrations:** ' +
      '\n\n**Incident Management:** ' +
      '\n- **PagerDuty:** Page on-call engineers for critical alerts ' +
      '\n- **Opsgenie:** Alternative incident management and on-call scheduling ' +
      '\n- **VictorOps (Splunk On-Call):** Alert routing and escalation ' +
      '\n\n**Ticketing:** ' +
      '\n- **ServiceNow:** Auto-create incidents for alerts ' +
      '\n- **Jira:** Create tickets for infrastructure issues ' +
      '\n- **Zendesk:** Customer-facing service desk integration ' +
      '\n\n**Collaboration:** ' +
      '\n- **Slack:** Post alerts to channels, interactive notifications ' +
      '\n- **Microsoft Teams:** Teams channel notifications ' +
      '\n- **Mattermost:** Self-hosted chat notifications ' +
      '\n\n**Workflow & Automation:** ' +
      '\n- **Webhooks:** Custom integrations to any HTTP endpoint ' +
      '\n- **API:** Programmatic integration for custom workflows ' +
      '\n\n**Use cases:** ' +
      '\n- "Post critical production alerts to #incidents Slack channel" ' +
      '\n- "Auto-create ServiceNow ticket for every critical alert" ' +
      '\n- "Page PagerDuty when datacenter resource/device go offline" ' +
      '\n- "Update Jira epic when deployment causes alerts" ' +
      '\n\n**Integration status:** ' +
      '\n- Active: Integration configured and working ' +
      '\n- Inactive: Disabled or authentication failed ' +
      '\n- Test: Verify integration by triggering test notification ' +
      '\n\n**Workflow:** Use this tool to find integrations, then use in escalation chains or as webhook recipients for alert delivery. ' +
      '\n\n**Important:** LogicMonitor may return a negative "total" value due to a known upstream API limitation - this does not mean the request failed. Never use "total" to count or check for results; check the length of the "items" array instead, and use pagination (size/offset) or autoPaginate: true to retrieve all items across pages. ' +
      '\n\n**Related tools:** "get\\_integration" (configuration details), "test\\_integration" (verify working), "list\\_escalation\\_chains" (see usage).',
    annotations: {
      title: 'List integrations',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        ...paginationSchema,
        ...filterSchema,
        ...fieldsSchema,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_integration',
    description: 'Get detailed information about a specific integration by ID in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Complete integration details: name, type, configuration (API keys, webhooks, URLs), authentication status, last successful notification, error logs, which escalation chains use it. ' +
      '\n\n**When to use:**' +
      '\n- Troubleshoot integration not working' +
      '\n- Review configuration before updates' +
      '\n- Check API keys/authentication' +
      '\n- See last successful notification time' +
      '\n- Audit integration settings' +
      '\n' +
      '\n\n**Configuration details by type:** ' +
      '\n- **Slack:** Webhook URL, channel names, mention settings ' +
      '\n- **PagerDuty:** Integration key, service mappings ' +
      '\n- **ServiceNow:** Instance URL, credentials, table mapping ' +
      '\n- **Jira:** Project keys, issue type, custom field mapping ' +
      '\n- **Webhook:** Target URL, authentication headers, payload format ' +
      '\n\n**Troubleshooting:** ' +
      '\n- Authentication failed: Check API keys/credentials ' +
      '\n- Not receiving notifications: Verify escalation chain configuration ' +
      '\n- Error logs: Review failed notification attempts ' +
      '\n\n**Workflow:** Use "list\\_integrations" to find integrationId, then use this tool for detailed configuration and troubleshooting. ' +
      '\n\n**Related tools:** "list\\_integrations" (find integrations), "test\\_integration" (send test), "update\\_integration" (modify).',
    annotations: {
      title: 'Get integration details',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        integrationId: {
          type: 'number',
          description: 'The ID of the integration to retrieve',
        },
        ...fieldsSchema,
      },
      additionalProperties: false,
      required: ['integrationId'],
    },
  },
  {
    name: 'create_integration',
    description: 'Create a new third-party integration in LogicMonitor (LM) monitoring to send alerts/data to external platforms. ' +
      '\n\n**What this does:** Connects LogicMonitor to external platforms (Slack, PagerDuty, ServiceNow, Jira, Teams, etc.) for alert notifications, ticket creation, and data export. ' +
      '\n\n**When to use:**' +
      '\n- Send alerts to Slack/Teams channels' +
      '\n- Create tickets in ServiceNow/Jira automatically' +
      '\n- Page on-call via PagerDuty/Opsgenie' +
      '\n- Export data to analytics platforms' +
      '\n- Integrate with ITSM workflows' +
      '\n' +
      '\n\n**Required parameters:** ' +
      '\n- type: Integration type ("slack", "pagerduty", "servicenow", "jira", "teams", "webhook", etc.) ' +
      '\n- name: Integration name (e.g., "DevOps Slack Channel", "ServiceNow Production") ' +
      '\n- config: Integration-specific configuration (API keys, URLs, channels, etc.) ' +
      '\n\n**Common integration patterns:** ' +
      '\n\n**Slack integration:** ' +
      '{type: "slack", name: "DevOps Team Slack", config: {webhookUrl: "https://hooks.slack.com/...", channel: "#alerts"}} ' +
      '// Sends alerts to Slack channel ' +
      '\n\n**PagerDuty integration:** ' +
      '{type: "pagerduty", name: "Production On-Call", config: {apiKey: "...", serviceKey: "..."}} ' +
      '// Pages on-call engineer ' +
      '\n\n**ServiceNow integration:** ' +
      '{type: "servicenow", name: "SNOW Production", config: {instance: "company.service-now.com", username: "...", password: "...", assignmentGroup: "Platform Team"}} ' +
      '// Creates incidents in ServiceNow ' +
      '\n\n**Jira integration:** ' +
      '{type: "jira", name: "Infrastructure Project", config: {url: "company.atlassian.net", username: "...", apiToken: "...", project: "INFRA", issueType: "Bug"}} ' +
      '// Creates Jira tickets ' +
      '\n\n**Microsoft Teams integration:** ' +
      '{type: "teams", name: "Platform Team Channel", config: {webhookUrl: "https://outlook.office.com/webhook/..."}} ' +
      '// Sends alerts to Teams channel ' +
      '\n\n**Generic webhook integration:** ' +
      '{type: "webhook", name: "Custom Webhook", config: {url: "https://api.company.com/alerts", method: "POST", headers: {"Authorization": "Bearer ..."}}} ' +
      '// Sends alerts to custom endpoint ' +
      '\n\n**Why use integrations:** ' +
      '\n- **Centralized communication:** Alerts go where teams already work (Slack, Teams) ' +
      '\n- **Automated ticketing:** Create incidents/tickets without manual work ' +
      '\n- **On-call paging:** Reliable paging via PagerDuty/Opsgenie ' +
      '\n- **ITSM workflows:** Integrate with existing processes (ServiceNow, Jira) ' +
      '\n- **Data export:** Send metrics to analytics platforms ' +
      '\n\n**After creation:** ' +
      '1. Use integration in escalation chains to send notifications ' +
      '2. Configure alert rules to route specific alerts to integration ' +
      '3. Test with sample alert before production use ' +
      '\n\n**Best practices:** ' +
      '\n- Test integration before adding to escalation chains ' +
      '\n- Use descriptive names (include team/purpose) ' +
      '\n- Secure credentials (API keys, passwords) ' +
      '\n- One integration per channel/destination ' +
      '\n- Document integration purpose ' +
      '\n\n**Related tools:** "list\\_integrations" (view all), "update\\_integration" (modify), "delete\\_integration" (remove), "create\\_escalation\\_chain" (use integration).',
    annotations: {
      title: 'Create integration',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the integration',
        },
        type: {
          type: 'string',
          description: 'Integration type (e.g., "slack", "pagerduty")',
        },
        url: {
          type: 'string',
          description: 'Integration URL/webhook',
        },
        extra: {
          type: 'object',
          description: 'Additional integration-specific configuration',
        },
      },
      additionalProperties: false,
      required: ['name', 'type'],
    },
  },
  {
    name: 'update_integration',
    description: 'Update an existing third-party integration in LogicMonitor (LM) monitoring. ' +
      '\n\n**What this does:** Modify integration name, credentials, configuration, or destination. Changes affect future notifications immediately. ' +
      '\n\n**When to use:**' +
      '\n- Update API keys/credentials' +
      '\n- Change Slack/Teams channel' +
      '\n- Update ServiceNow/Jira configuration' +
      '\n- Modify webhook URL' +
      '\n- Rename integration' +
      '\n' +
      '\n\n**Required parameters:** ' +
      '\n- integrationId: Integration ID (from "list\\_integrations") ' +
      '\n\n**Optional parameters (what to change):** ' +
      '\n- name: New integration name ' +
      '\n- config: Updated configuration (API keys, URLs, channels, etc.) ' +
      '\n\n**Common update scenarios:** ' +
      '\n\n**Update Slack channel:** ' +
      '{integrationId: 123, config: {webhookUrl: "https://hooks.slack.com/...", channel: "#critical-alerts"}} ' +
      '\n\n**Rotate API key (PagerDuty):** ' +
      '{integrationId: 123, config: {apiKey: "new-key-...", serviceKey: "..."}} ' +
      '\n\n**Update ServiceNow credentials:** ' +
      '{integrationId: 123, config: {instance: "company.service-now.com", username: "newuser", password: "newpass"}} ' +
      '\n\n**Change webhook URL:** ' +
      '{integrationId: 123, config: {url: "https://new-api.company.com/alerts"}} ' +
      '\n\n**Best practice workflow:** ' +
      '1. Use "get\\_integration" to see current configuration ' +
      '2. Update integration ' +
      '3. Test with sample notification ' +
      '\n\n**Related tools:** "get\\_integration" (review), "list\\_integrations" (find integration), "delete\\_integration" (remove).',
    annotations: {
      title: 'Update integration',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        integrationId: {
          type: 'number',
          description: 'The ID of the integration to update',
        },
        name: {
          type: 'string',
          description: 'New name',
        },
        url: {
          type: 'string',
          description: 'New URL/webhook',
        },
        extra: {
          type: 'object',
          description: 'Updated configuration',
        },
      },
      additionalProperties: false,
      required: ['integrationId'],
    },
  },
  {
    name: 'delete_integration',
    description: 'Delete a third-party integration from LogicMonitor (LM) monitoring. ' +
      '\n\n**⚠️ WARNING: BREAKS NOTIFICATIONS** ' +
      '\n- Escalation chains using this integration stop sending notifications ' +
      '\n- No error shown - notifications silently fail ' +
      '\n- Cannot be undone ' +
      '\n\n**What this does:** Permanently removes integration. Escalation chains referencing this integration lose that notification path. ' +
      '\n\n**When to use:**' +
      '\n- Integration no longer needed' +
      '\n- Platform decommissioned (stopped using Slack/ServiceNow)' +
      '\n- Consolidating duplicate integrations' +
      '\n- Migration to different platform' +
      '\n' +
      '\n\n**Required parameters:** ' +
      '\n- integrationId: Integration ID to delete (from "list\\_integrations") ' +
      '\n\n**Before deleting - CRITICAL CHECKS:** ' +
      '1. Find all escalation chains using this integration ' +
      '2. Create replacement integration (if needed) ' +
      '3. Update all escalation chains to use replacement BEFORE deleting ' +
      '4. Verify no chains reference this integration ' +
      '\n\n**Impact of deletion:** ' +
      '\n- Escalation chain stages with this integration stop notifying ' +
      '\n- No error or warning - notifications silently fail ' +
      '\n- Active alerts may skip notification stages ' +
      '\n\n**Safe deletion workflow:** ' +
      '1. Use "list\\_escalation\\_chains" to find chains using this integration ' +
      '2. Create new integration (if replacing) ' +
      '3. Update all escalation chains to use new integration ' +
      '4. Verify updated ' +
      '5. Delete old integration ' +
      '\n\n**Best practice:** Migrate escalation chains to replacement integration BEFORE deleting to prevent notification gaps. ' +
      '\n\n**Related tools:** "list\\_escalation\\_chains" (find usage), "create\\_integration" (replacement), "update\\_escalation\\_chain" (migrate).',
    annotations: {
      title: 'Delete integration',
      readOnlyHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        integrationId: {
          type: 'number',
          description: 'The ID of the integration to delete',
        },
      },
      additionalProperties: false,
      required: ['integrationId'],
    },
  },

  // Website Checkpoints
  {
    name: 'list_website_checkpoints',
    description: 'List available checkpoint locations for website monitoring in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Array of checkpoint locations with: id, name, geographic region, status, type (internal/external). ' +
      '\n\n**What are checkpoints:** Global testing locations from which LogicMonitor runs synthetic website checks. Think "test my website from New York, London, Tokyo" - checkpoints are those global vantage points. ' +
      '\n\n**When to use:**' +
      '\n- Check available checkpoint locations before creating website monitors' +
      '\n- Verify geographic coverage for multi-region testing' +
      '\n- Select appropriate locations for SLA monitoring' +
      '\n- Plan website monitoring strategy' +
      '\n' +
      '\n\n**Checkpoint types:** ' +
      '\n- **External (Cloud):** LogicMonitor-managed locations around the world (US-East, EU-West, Asia-Pacific, etc.) ' +
      '\n- **Internal (Collector-based):** Tests run from your own collectors (test internal apps, VPNs, private networks) ' +
      '\n\n**Common checkpoint locations:** ' +
      '\n- North America: US-East, US-West, US-Central, Canada ' +
      '\n- Europe: EU-West (Ireland), EU-Central (Frankfurt), UK ' +
      '\n- Asia-Pacific: Singapore, Sydney, Tokyo ' +
      '\n- South America: São Paulo ' +
      '\n\n**Use cases:** ' +
      '\n- **Global SLA monitoring:** Test from regions where customers are located ' +
      '\n- **CDN verification:** Ensure content delivery works worldwide ' +
      '\n- **Regional compliance:** Monitor from specific geographic locations ' +
      '\n- **Multi-region performance:** Compare response times across locations ' +
      '\n- **Failover testing:** Verify DR sites accessible from all regions ' +
      '\n\n**Best practices:** ' +
      '\n- Select checkpoints near your user base ' +
      '\n- Use multiple checkpoints for critical services (avoid false positives from single location issues) ' +
      '\n- Mix internal and external checkpoints for comprehensive coverage ' +
      '\n- Consider timezone differences for result interpretation ' +
      '\n\n**Workflow:** Use this tool to discover available locations, then use those checkpoint IDs when creating website monitors via "create\\_website". ' +
      '\n\n**Related tools:** "list\\_websites" (existing monitors), "create\\_website" (configure checkpoints), "get\\_website" (verify checkpoint configuration).',
    annotations: {
      title: 'List checkpoint locations',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        ...fieldsSchema,
      },
      additionalProperties: false,
    },
  },

  // Topology
  {
    name: 'get_topology',
    description: 'Get network topology information in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Network topology data with: resource/device relationships, network connections, parent-child hierarchies, Layer 2/Layer 3 connectivity maps. ' +
      '\n\n**What is topology:** Automatically discovered network relationship map showing how resource/device connect to each other. LogicMonitor uses SNMP, CDP (Cisco Discovery Protocol), LLDP (Link Layer Discovery Protocol), and other methods to build network topology maps. ' +
      '\n\n**When to use:**' +
      '\n- Understand network architecture and resource/device relationships' +
      '\n- Visualize network connectivity' +
      '\n- Plan network changes' +
      '\n- Troubleshoot connectivity issues' +
      '\n- Document network infrastructure' +
      '\n' +
      '\n\n**Topology information includes:** ' +
      '\n- **Physical connections:** Which resource/device are physically connected (switch ports, router interfaces) ' +
      '\n- **Logical relationships:** Parent-child relationships (gateway → firewall → switches → servers) ' +
      '\n- **Layer 2 topology:** MAC address tables, VLANs, switch port connections ' +
      '\n- **Layer 3 topology:** IP routing, subnets, default gateways ' +
      '\n\n**Use cases:** ' +
      '\n- **Network visualization:** See how your network is structured ' +
      '\n- **Impact analysis:** "If this switch fails, what resource/device lose connectivity?" ' +
      '\n- **Capacity planning:** Identify network bottlenecks and heavily-utilized links ' +
      '\n- **Documentation:** Auto-generated network diagrams ' +
      '\n- **Troubleshooting:** Trace connection paths between resource/device ' +
      '\n\n**How LogicMonitor discovers topology:** ' +
      '\n- CDP/LLDP: Cisco and other vendors broadcast neighbor information ' +
      '\n- SNMP: Query resource/device interface tables, ARP tables, routing tables ' +
      '\n- Traceroute: Active probing to discover paths ' +
      '\n- Parent/child relationships: Based on gateway configuration ' +
      '\n\n**Related tools:** "list\\_resources" (view resources/devices), "get\\_resource" (device details including connections).',
    annotations: {
      title: 'Get network topology',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        ...fieldsSchema,
      },
      additionalProperties: false,
    },
  },

  // Collector Versions
  {
    name: 'list_collector_versions',
    description: 'List available collector versions in LogicMonitor (LM) monitoring. ' +
      '\n\n**Returns:** Array of collector versions with: version number, release date, stability level (GA/EA/RC), changelog summary, download size, platform support (Windows/Linux), mandatory/recommended flag. ' +
      '\n\n**What are collector versions:** Software releases for LogicMonitor collector agents. Collectors are installed on your infrastructure to gather monitoring data. Staying current ensures latest features, bug fixes, and security patches. ' +
      '\n\n**When to use:**' +
      '\n- Check for collector updates' +
      '\n- Review changelog before upgrading' +
      '\n- Find specific version for rollback' +
      '\n- Verify platform compatibility' +
      '\n- Plan maintenance windows for collector upgrades' +
      '\n' +
      '\n\n**Version types:** ' +
      '\n- **GA (Generally Available):** Production-ready, stable, recommended ' +
      '\n- **EA (Early Adopter):** Beta, new features, use in non-production first ' +
      '\n- **RC (Release Candidate):** Pre-GA testing version ' +
      '\n- **Mandatory:** Critical security/bug fixes, upgrade required ' +
      '\n\n**Collector update workflow:** ' +
      '1. Use this tool to check available versions ' +
      '2. Review changelog for breaking changes ' +
      '3. Test new version on non-production collector first ' +
      '4. Use "get\\_collector" to check current version on your collectors ' +
      '5. Update collectors via LogicMonitor UI or API ' +
      '6. Monitor collector health after upgrade ' +
      '\n\n**Version numbering:** Format is typically X.Y.Z (e.g., 34.100.0) where: ' +
      '\n- X = Major release (significant changes) ' +
      '\n- Y = Minor release (features, improvements) ' +
      '\n- Z = Patch release (bug fixes) ' +
      '\n\n**Best practices:** ' +
      '\n- Keep collectors within 2-3 versions of latest GA release ' +
      '\n- Subscribe to release notifications for critical updates ' +
      '\n- Test EA versions in lab before production ' +
      '\n- Upgrade during maintenance windows (may briefly interrupt monitoring) ' +
      '\n- Stagger upgrades (don\'t upgrade all collectors simultaneously) ' +
      '\n\n**Common scenarios:** ' +
      '\n- "Check if newer version available" → Compare latest version to your collectors ' +
      '\n- "Plan upgrade" → Review changelog, schedule maintenance ' +
      '\n- "Rollback needed" → Find previous stable version ' +
      '\n- "Platform migration" → Verify version supports new OS ' +
      '\n\n**Related tools:** "get\\_collector" (check current version on collector), "list\\_collectors" (find collectors to upgrade).',
    annotations: {
      title: 'List collector versions',
      readOnlyHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        size: {
          type: 'number',
          description: 'Number of results per page (default: 50, max: 1000).',
        },
        offset: {
          type: 'number',
          description: 'Starting offset for pagination (default: 0).',
        },
        ...fieldsSchema,
      },
      additionalProperties: false,
    },
  },
];

/**
 * Get LogicMonitor tools, optionally filtered by read-only status
 * @param onlyReadOnly - If true, only return tools with readOnlyHint: true
 * @returns Array of Tool definitions sorted alphabetically by name
 */
export function getLogicMonitorTools(onlyReadOnly: boolean = false): Tool[] {
  const tools = onlyReadOnly
    ? ALL_LOGICMONITOR_TOOLS.filter(tool => {
      const readOnlyHint = tool.annotations?.readOnlyHint;
      return readOnlyHint === true;
    })
    : ALL_LOGICMONITOR_TOOLS;

  // Sort tools alphabetically by name
  return [...tools].sort((a, b) => a.name.localeCompare(b.name));
}
