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
