/**
 * Loose argument coercion. MCP clients do not always send booleans and numbers with the right type
 * (for example when their cached tool schema predates a parameter, true arrives as "true" and false
 * as the truthy string "false"), so options read from tool arguments go through these.
 */

/** True for true and "true" (any case, surrounding spaces ignored); everything else, including "false", is false. */
export function isTrue(value: unknown): boolean {
  return value === true || (typeof value === 'string' && value.trim().toLowerCase() === 'true');
}
