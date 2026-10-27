/**
 * LogicMonitor MCP Server - Prompts
 *
 * This module provides MCP prompts for common LogicMonitor operations.
 * Prompts are interactive workflows that guide users through multi-step tasks.
 */

/**
 * Prompt definition for checking resource health
 */
export interface LMPrompt {
  name: string;
  description: string;
  arguments?: Array<{
    name: string;
    description: string;
    required?: boolean;
  }>;
}

/**
 * Available LogicMonitor prompts
 */
export const LM_PROMPTS: LMPrompt[] = [
  {
    name: 'resource_check',
    description: 'Interactive resource check for a LogicMonitor resource/device. ' +
      'Searches for a resource by name or custom filter, allows selection if multiple matches, ' +
      'then displays comprehensive information including resource details, groups, ' +
      'collector assignment, and current metrics (CPU, memory, network, ping, etc.) in a formatted table for selected resource.',
    arguments: [
      {
        name: 'resourceName',
        description: 'Name or partial name of the resource/device to check (e.g., "prod-web-01", "palo"). ' +
          'Can also be a filter expression like "customProperties.name:company.team,customProperties.value:teamA"',
        required: true,
      },
    ],
  },
  {
    name: 'datasource_from_mib',
    description: 'Build (or improve) an SNMP DataSource from one table of a MIB. ' +
      'You name the table; the assistant reads its definition, proposes the instances, datapoints (with descriptions and units), ' +
      'status display names and suggested thresholds for your review, creates the DataSource, and tests it against a device. ' +
      'Paste only the table\'s part of the MIB, not the whole file.',
    arguments: [
      {
        name: 'table',
        description: 'The MIB table (or scalar group) to monitor, by name or OID, e.g. "rPDUOutletStatusTable".',
        required: true,
      },
      {
        name: 'mibText',
        description: 'The MIB text for that table: the Table, Entry and SEQUENCE definitions, each column\'s OBJECT-TYPE, and the OID chain above it. ' +
          'Not the whole MIB (they can be megabytes). If omitted, the assistant asks for it.',
        required: false,
      },
      {
        name: 'existingDataSource',
        description: 'Name of a DataSource already on the portal to improve instead of creating a new one.',
        required: false,
      },
      {
        name: 'testResource',
        description: 'Name of a resource/device that has this table, to test discovery and collection against.',
        required: false,
      },
    ],
  },
];

/**
 * Lists all available LogicMonitor prompts
 */
export function listLMPrompts(): LMPrompt[] {
  return LM_PROMPTS;
}

/**
 * Gets a specific prompt by name
 */
export function getLMPrompt(name: string): LMPrompt | undefined {
  return LM_PROMPTS.find(p => p.name === name);
}

/**
 * Generates prompt messages for a given prompt and arguments
 * This is the single source of truth for prompt message generation
 */
export function generatePromptMessages(name: string, args?: Record<string, any>): {
  description: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: {
      type: 'text';
      text: string;
    };
  }>;
} {
  if (name === 'resource_check') {
    const resourceName = args?.resourceName as string;

    if (!resourceName) {
      throw new Error('Missing required argument: resourceName');
    }

    // Build the interactive prompt workflow
    const messages = [
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `I need to check the status of a LogicMonitor resource: "${resourceName}"`,
        },
      },
      {
        role: 'assistant' as const,
        content: {
          type: 'text' as const,
          text: `I'll help you check the health of the resource "${resourceName}". Let me search for it first.\n\n` +
            'I\'ll use the list_resources tool with query parameter to find this resource, ' +
            'eventually ask user to select one particular resource from the list if there is multiple resources matching search condition, ' +
            'list_alerts tool to find any alerts for this resource, ' +
            'generate_resource_link tool to create direct link to LogicMonitor for this resource, ' +
            'list_resource_datasources tool to find available datasources for this resource, ' +
            'list_resource_instances tool to find available instances for this resource, ' +
            'get_resource_instance_data tool to get data for this resource (start/end are epoch seconds; start time must be before current time), ' +
            'get_resource_group tool to get the group details for this resource, ' +
            'get_collector tool to get the collector details for this resource, ' +
            'get_collector_group tool to get the collector group details for this resource. ' +
            'Result will be table summary with display name, name, ip, status, current alerts and current main metrics (CPU/Memory/network/Ping), ' +
            'full group paths for all resource groups where is resource assigned. ',
        },
      },
    ];

    return {
      description: `Resource check workflow for resource: ${resourceName}`,
      messages,
    };
  }

  if (name === 'datasource_from_mib') {
    const table = args?.table as string;

    if (!table) {
      throw new Error('Missing required argument: table');
    }

    const mibText = args?.mibText as string | undefined;
    const existing = args?.existingDataSource as string | undefined;
    const testResource = args?.testResource as string | undefined;

    const text =
      `I want to monitor the SNMP MIB table "${table}" with a LogicMonitor DataSource.\n\n` +
      (existing
        ? `Improve the existing DataSource "${existing}" (read it first with list_datasources and get_datasource) rather than creating a new one.\n\n`
        : 'Create a new DataSource, after checking with list_datasources that a similar one does not already exist.\n\n') +
      (testResource ? `Test it against the resource "${testResource}".\n\n` : '') +
      'Start by reading the MCP resource "lm://knowledge/snmp-datasource-from-mib" and follow it. In short:\n' +
      '1. Read the table definition below and resolve the OIDs. Do not invent anything the MIB text does not give; ask for any missing line.\n' +
      '2. Propose the design as a short table for me to adjust before you build anything: the instance (what is walked and what names it), each column you will turn into a datapoint with its description and unit, which columns you skip and why, status display names for enumerations, and suggested thresholds with your reasoning. Ask me about anything the MIB does not settle (which state is bad, whether to filter instances (and whether the filters should be property-driven, see "lm://knowledge/property-driven-discovery"), what devices it applies to, scaling).\n' +
      '3. After I agree, create the DataSource with appliesTo set to false(), read it back, then test it on a real device and report what you checked and what you could not.\n' +
      '4. Only then set the real appliesTo.\n\n' +
      (mibText
        ? `Here is the MIB text for the table:\n\n${mibText}`
        : 'I have not pasted the MIB text yet. Ask me for the table\'s part of the MIB (not the whole file) before you begin.');

    return {
      description: `Build an SNMP DataSource from the MIB table: ${table}`,
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text,
          },
        },
      ],
    };
  }

  throw new Error(`Unknown prompt: ${name}`);
}
