/**
 * Concise results for create/update tools.
 *
 * LogicMonitor answers a create or update with the complete object: a DataSource comes back with
 * every script and datapoint (about 20,000 tokens), a resource with all of its system, auto and
 * inherited properties. Callers almost never need that back, so large results are shortened to the
 * object's scalar fields and small values, and the large nested parts are listed under `omitted`.
 * Callers who do want everything pass returnFull: true.
 */

/** Results whose JSON is at most this long are returned unchanged. */
export const COMPACT_THRESHOLD_CHARS = 3000;
/** Nested values whose JSON is at most this long are kept. */
const KEEP_NESTED_CHARS = 200;
/** Longer strings are cut to this length. */
const MAX_STRING_CHARS = 300;

/** Tools whose result is shortened by default: every create_* and update_* tool. */
export function isConciseResultTool(toolName: string): boolean {
  return /^(create|update)_/.test(toolName);
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** A batch result lists one outcome per item (including failures), which must not be hidden. */
function isBatchResult(result: Record<string, any>): boolean {
  return Array.isArray(result.devices) && result.summary !== undefined;
}

/**
 * Return a concise copy of a large create/update result, or the result itself when it is small,
 * is not a single object, is a batch result, or has nothing worth shortening. The input is not modified.
 */
export function compactWriteResult(result: unknown): unknown {
  if (!isPlainObject(result) || isBatchResult(result)) {
    return result;
  }

  const totalChars = JSON.stringify(result).length;
  if (totalChars <= COMPACT_THRESHOLD_CHARS) {
    return result;
  }

  const compact: Record<string, any> = {};
  const omitted: Record<string, string> = {};
  let shortened = false;

  for (const [key, value] of Object.entries(result)) {
    if (typeof value === 'string' && value.length > MAX_STRING_CHARS) {
      compact[key] = `${value.slice(0, MAX_STRING_CHARS)}... (${value.length} chars)`;
      shortened = true;
    } else if (value === null || typeof value !== 'object') {
      compact[key] = value;
    } else if (JSON.stringify(value).length <= KEEP_NESTED_CHARS) {
      compact[key] = value;
    } else {
      omitted[key] = Array.isArray(value) ? `array of ${value.length}` : `object with ${Object.keys(value).length} fields`;
    }
  }

  if (!shortened && Object.keys(omitted).length === 0) {
    return result;
  }

  if (Object.keys(omitted).length > 0) {
    compact.omitted = omitted;
  }
  compact.note =
    `Concise result: the full response was ${totalChars} characters. Large nested parts are listed under "omitted" ` +
    `and long text is cut at ${MAX_STRING_CHARS} characters; pass returnFull: true to get the complete object, ` +
    'or read it back with the matching get_* tool.';
  return compact;
}
