/**
 * Loose argument coercion. MCP clients do not always send booleans and numbers with the right type
 * (for example when their cached tool schema predates a parameter, true arrives as "true" and false
 * as the truthy string "false"), so options read from tool arguments go through these.
 */

/** True for true and "true" (any case, surrounding spaces ignored); everything else, including "false", is false. */
export function isTrue(value: unknown): boolean {
  return value === true || (typeof value === 'string' && value.trim().toLowerCase() === 'true');
}

/**
 * An array argument that some clients send as a JSON string (for example '["a","b"]'). Arrays are
 * returned as they are, a string holding a JSON array is parsed, anything else is returned unchanged.
 */
export function parseJsonArray(value: unknown): unknown {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // not JSON: fall through and return the string
      }
    }
  }
  return value;
}
