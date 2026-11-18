/**
 * Required-argument validation for tool calls. The MCP request handlers are registered
 * with the low-level SDK API, which does not enforce a tool's inputSchema, so a call
 * missing an ID would otherwise build a path like /setting/datasources/undefined and
 * send it to LogicMonitor. Lenient on purpose: it only checks that required properties
 * are present, not their types, so it never rejects a call that used to work.
 */

interface ToolSchemaLike {
  name: string;
  inputSchema?: { required?: string[] };
}

/** Names of required properties that are missing (undefined, null, NaN or blank string). */
export function findMissingRequired(tool: ToolSchemaLike | undefined, args: unknown): string[] {
  const required = tool?.inputSchema?.required;
  if (!required?.length) return [];
  const provided = (args ?? {}) as Record<string, unknown>;
  return required.filter(key => {
    const value = provided[key];
    return value === undefined
      || value === null
      || (typeof value === 'number' && Number.isNaN(value))
      || (typeof value === 'string' && value.trim() === '');
  });
}

/** Argument names the tool's inputSchema does not declare (for example "id" where "dataSourceId" is expected). */
export function findUnknownArguments(tool: { inputSchema?: { properties?: Record<string, unknown> } } | undefined, args: unknown): string[] {
  const properties = tool?.inputSchema?.properties;
  if (!properties) return [];
  return Object.keys((args ?? {}) as Record<string, unknown>).filter(key => !(key in properties));
}

/** Names of all parameters the tool declares, required ones first. */
export function acceptedParameterNames(tool: ToolSchemaLike & { inputSchema?: { properties?: Record<string, unknown> } } | undefined): string[] {
  const names = Object.keys(tool?.inputSchema?.properties ?? {});
  const required = new Set(tool?.inputSchema?.required ?? []);
  return [...names.filter(n => required.has(n)), ...names.filter(n => !required.has(n))];
}

/**
 * Clients routinely guess "id" (list_* results return "id") where a tool declares "<thing>Id".
 * When a tool does not declare "id", requires exactly one parameter, that parameter is named
 * "*Id" and is missing, treat "id" as that parameter. Tools with several required IDs stay
 * strict because "id" would be ambiguous.
 */
export function applyIdAlias<T>(tool: (ToolSchemaLike & { inputSchema?: { properties?: Record<string, unknown> } }) | undefined, args: T): T {
  const provided = (args ?? {}) as Record<string, unknown>;
  const required = tool?.inputSchema?.required;
  if (!tool || !required || required.length !== 1 || !/Id$/.test(required[0])) return args;
  if ('id' in (tool.inputSchema?.properties ?? {}) || provided.id === undefined) return args;
  if (findMissingRequired(tool, args).length === 0) return args;
  const { id, ...rest } = provided;
  return { ...rest, [required[0]]: id } as T;
}

/**
 * Argument aliases. Each one is backed by evidence, not a guess: resourceId(s) because tools say
 * "resource" but take LogicMonitor's older "device" names; hostId, datasourceId and group_id
 * because clients were seen sending exactly those names and getting "missing required".
 * Ambiguous names (id on multi-ID tools, name, dataSourceId vs deviceDataSourceId) are left out.
 */
const PARAMETER_ALIASES: Record<string, string> = {
  resourceId: 'deviceId',
  resourceIds: 'deviceIds',
  hostId: 'deviceId',
  datasourceId: 'dataSourceId',
  group_id: 'groupId',
};

/**
 * Accept the aliases above where a tool declares the canonical name. The canonical name
 * wins when both are given, and a tool that declares the alias itself is left alone.
 */
export function applyParameterAliases<T>(tool: { inputSchema?: { properties?: Record<string, unknown> } } | undefined, args: T): T {
  const properties = tool?.inputSchema?.properties;
  if (!properties || !args || typeof args !== 'object') return args;
  const provided = args as Record<string, unknown>;
  let result: Record<string, unknown> | undefined;
  for (const [alias, canonical] of Object.entries(PARAMETER_ALIASES)) {
    if (!(alias in provided) || alias in properties || !(canonical in properties)) continue;
    result ??= { ...provided };
    if (result[canonical] === undefined) result[canonical] = result[alias];
    delete result[alias];
  }
  return (result ?? args) as T;
}
